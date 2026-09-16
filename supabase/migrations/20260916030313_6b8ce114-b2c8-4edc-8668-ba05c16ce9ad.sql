DROP POLICY IF EXISTS "Owners view self directed sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "Owners create self directed sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "Owners update self directed sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "Owners delete self directed sessions" ON public.coaching_sessions;

CREATE POLICY "Non-coach owners view self directed sessions"
ON public.coaching_sessions FOR SELECT TO authenticated
USING (
  session_type = 'self_directed'
  AND NOT public.has_role(auth.uid(), 'coach')
  AND coach_user_id = auth.uid()
  AND student_user_id = auth.uid()
);

CREATE POLICY "Non-coach owners create self directed sessions"
ON public.coaching_sessions FOR INSERT TO authenticated
WITH CHECK (
  session_type = 'self_directed'
  AND NOT public.has_role(auth.uid(), 'coach')
  AND coach_user_id = auth.uid()
  AND student_user_id = auth.uid()
  AND booking_id IS NULL
  AND invoice_id IS NULL
  AND corporate_invoice_id IS NULL
);

CREATE POLICY "Non-coach owners update self directed sessions"
ON public.coaching_sessions FOR UPDATE TO authenticated
USING (
  session_type = 'self_directed'
  AND NOT public.has_role(auth.uid(), 'coach')
  AND coach_user_id = auth.uid()
  AND student_user_id = auth.uid()
)
WITH CHECK (
  session_type = 'self_directed'
  AND NOT public.has_role(auth.uid(), 'coach')
  AND coach_user_id = auth.uid()
  AND student_user_id = auth.uid()
  AND booking_id IS NULL
  AND invoice_id IS NULL
  AND corporate_invoice_id IS NULL
);

CREATE POLICY "Non-coach owners delete self directed sessions"
ON public.coaching_sessions FOR DELETE TO authenticated
USING (
  session_type = 'self_directed'
  AND NOT public.has_role(auth.uid(), 'coach')
  AND coach_user_id = auth.uid()
  AND student_user_id = auth.uid()
);

CREATE OR REPLACE FUNCTION public.can_read_coaching_session(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coaching_sessions s
    WHERE s.id = _session_id
      AND (
        (
          s.session_type = 'self_directed'
          AND NOT public.has_role(auth.uid(), 'coach')
          AND s.coach_user_id = auth.uid()
          AND s.student_user_id = auth.uid()
        )
        OR
        (
          s.session_type = 'coach_directed'
          AND (
            s.coach_user_id = auth.uid()
            OR s.student_user_id = auth.uid()
            OR s.coach_user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
            OR s.student_user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
            OR public.has_city_access(auth.uid(), s.city)
          )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_write_coaching_session(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coaching_sessions s
    WHERE s.id = _session_id
      AND (
        (
          s.session_type = 'self_directed'
          AND NOT public.has_role(auth.uid(), 'coach')
          AND s.coach_user_id = auth.uid()
          AND s.student_user_id = auth.uid()
        )
        OR
        (
          s.session_type = 'coach_directed'
          AND (
            s.coach_user_id = auth.uid()
            OR s.coach_user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
            OR public.has_city_access(auth.uid(), s.city)
          )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.complete_self_directed_training(
  _session jsonb,
  _focuses jsonb DEFAULT '[]'::jsonb,
  _drills jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_city text := NULLIF(trim(_session->>'city'), '');
  v_requested_focus_count integer;
  v_valid_focus_count integer;
  v_requested_drill_count integer;
  v_valid_drill_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF public.has_role(v_user_id, 'coach') THEN
    RAISE EXCEPTION 'Self-directed training is unavailable for coach accounts';
  END IF;

  IF COALESCE(jsonb_typeof(_focuses), '') <> 'array'
     OR COALESCE(jsonb_typeof(_drills), '') <> 'array' THEN
    RAISE EXCEPTION 'Invalid training selection';
  END IF;

  IF v_city IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.bays b WHERE b.city = v_city
  ) THEN
    RAISE EXCEPTION 'Invalid training city';
  END IF;

  SELECT count(DISTINCT NULLIF(item->>'focus_id', '')::uuid)
  INTO v_requested_focus_count
  FROM jsonb_array_elements(_focuses) AS item;

  IF v_requested_focus_count < 1 THEN
    RAISE EXCEPTION 'Select at least one focus area';
  END IF;

  SELECT count(*)
  INTO v_valid_focus_count
  FROM public.coaching_focuses f
  WHERE f.active = true
    AND f.id IN (
      SELECT DISTINCT NULLIF(item->>'focus_id', '')::uuid
      FROM jsonb_array_elements(_focuses) AS item
    );

  IF v_valid_focus_count <> v_requested_focus_count THEN
    RAISE EXCEPTION 'Invalid or inactive focus area';
  END IF;

  SELECT count(DISTINCT NULLIF(item->>'drill_id', '')::uuid)
  INTO v_requested_drill_count
  FROM jsonb_array_elements(_drills) AS item;

  SELECT count(*)
  INTO v_valid_drill_count
  FROM (
    SELECT DISTINCT d.id
    FROM jsonb_array_elements(_drills) AS item
    JOIN public.coaching_drills d
      ON d.id = NULLIF(item->>'drill_id', '')::uuid
     AND d.active = true
    JOIN public.focus_drills fd
      ON fd.drill_id = d.id
     AND fd.focus_id = NULLIF(item->>'focus_id', '')::uuid
    JOIN public.coaching_focuses f
      ON f.id = fd.focus_id
     AND f.active = true
    WHERE fd.focus_id IN (
      SELECT DISTINCT NULLIF(focus_item->>'focus_id', '')::uuid
      FROM jsonb_array_elements(_focuses) AS focus_item
    )
      AND length(COALESCE(trim(item->>'coach_note'), '')) <= 500
  ) valid_drills;

  IF v_valid_drill_count <> v_requested_drill_count THEN
    RAISE EXCEPTION 'Invalid, inactive, or mismatched drill selection';
  END IF;

  INSERT INTO public.coaching_sessions (
    coach_user_id,
    student_user_id,
    city,
    session_date,
    notes,
    drills,
    progress_summary,
    onform_links,
    sportsbox_links,
    superspeed_links,
    other_links,
    booking_id,
    session_type
  ) VALUES (
    v_user_id,
    v_user_id,
    v_city,
    (_session->>'session_date')::date,
    NULLIF(trim(_session->>'notes'), ''),
    NULL,
    NULLIF(trim(_session->>'progress_summary'), ''),
    COALESCE(_session->'onform_links', '[]'::jsonb),
    COALESCE(_session->'sportsbox_links', '[]'::jsonb),
    COALESCE(_session->'superspeed_links', '[]'::jsonb),
    COALESCE(_session->'other_links', '[]'::jsonb),
    NULL,
    'self_directed'
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.session_focuses (session_id, focus_id, snapshot)
  SELECT DISTINCT ON (f.id)
    v_session_id,
    f.id,
    jsonb_build_object(
      'name', f.name,
      'category', c.name
    )
  FROM jsonb_array_elements(_focuses) AS item
  JOIN public.coaching_focuses f
    ON f.id = NULLIF(item->>'focus_id', '')::uuid
   AND f.active = true
  LEFT JOIN public.coaching_categories c ON c.id = f.category_id
  ORDER BY f.id;

  INSERT INTO public.session_drills (session_id, drill_id, focus_id, coach_note, snapshot)
  SELECT DISTINCT ON (d.id)
    v_session_id,
    d.id,
    f.id,
    NULLIF(trim(item->>'coach_note'), ''),
    jsonb_build_object(
      'name', d.name,
      'objective', d.objective,
      'instructions', d.instructions,
      'recommended_reps', d.recommended_reps,
      'category', dc.name,
      'focus_name', f.name,
      'video_url', d.video_url
    )
  FROM jsonb_array_elements(_drills) AS item
  JOIN public.coaching_drills d
    ON d.id = NULLIF(item->>'drill_id', '')::uuid
   AND d.active = true
  JOIN public.focus_drills fd
    ON fd.drill_id = d.id
   AND fd.focus_id = NULLIF(item->>'focus_id', '')::uuid
  JOIN public.coaching_focuses f
    ON f.id = fd.focus_id
   AND f.active = true
  LEFT JOIN public.coaching_categories dc ON dc.id = d.category_id
  ORDER BY d.id;

  RETURN v_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_self_directed_training(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_self_directed_training(jsonb, jsonb, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.can_read_coaching_session(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_coaching_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_coaching_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_coaching_session(uuid) TO authenticated, service_role;