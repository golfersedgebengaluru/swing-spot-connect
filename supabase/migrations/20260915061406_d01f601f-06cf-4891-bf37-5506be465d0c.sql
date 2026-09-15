ALTER TABLE public.coaching_sessions
  ADD COLUMN session_type text NOT NULL DEFAULT 'coach_directed';

ALTER TABLE public.coaching_sessions
  ADD CONSTRAINT coaching_sessions_session_type_check
  CHECK (session_type IN ('self_directed', 'coach_directed'));

ALTER TABLE public.coaching_sessions
  ADD CONSTRAINT coaching_sessions_self_identity_check
  CHECK (session_type <> 'self_directed' OR coach_user_id = student_user_id);

CREATE OR REPLACE FUNCTION public.prevent_coaching_session_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.coach_user_id IS DISTINCT FROM OLD.coach_user_id
     OR NEW.student_user_id IS DISTINCT FROM OLD.student_user_id
     OR NEW.session_type IS DISTINCT FROM OLD.session_type THEN
    RAISE EXCEPTION 'Session ownership and type cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_coaching_sessions_immutable_identity
BEFORE UPDATE ON public.coaching_sessions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_coaching_session_identity_change();

DROP POLICY IF EXISTS "Students view own sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "Coaches view own sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "Admins view all city sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "Coaches create own sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "Admins create sessions in city" ON public.coaching_sessions;
DROP POLICY IF EXISTS "Coaches update own sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "Admins update city sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "Coaches delete own sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "Admins delete city sessions" ON public.coaching_sessions;

CREATE POLICY "Owners view self directed sessions"
ON public.coaching_sessions FOR SELECT TO authenticated
USING (
  session_type = 'self_directed'
  AND coach_user_id = auth.uid()
  AND student_user_id = auth.uid()
);

CREATE POLICY "Owners create self directed sessions"
ON public.coaching_sessions FOR INSERT TO authenticated
WITH CHECK (
  session_type = 'self_directed'
  AND coach_user_id = auth.uid()
  AND student_user_id = auth.uid()
  AND booking_id IS NULL
  AND invoice_id IS NULL
  AND corporate_invoice_id IS NULL
);

CREATE POLICY "Owners update self directed sessions"
ON public.coaching_sessions FOR UPDATE TO authenticated
USING (
  session_type = 'self_directed'
  AND coach_user_id = auth.uid()
  AND student_user_id = auth.uid()
)
WITH CHECK (
  session_type = 'self_directed'
  AND coach_user_id = auth.uid()
  AND student_user_id = auth.uid()
  AND booking_id IS NULL
  AND invoice_id IS NULL
  AND corporate_invoice_id IS NULL
);

CREATE POLICY "Owners delete self directed sessions"
ON public.coaching_sessions FOR DELETE TO authenticated
USING (
  session_type = 'self_directed'
  AND coach_user_id = auth.uid()
  AND student_user_id = auth.uid()
);

CREATE POLICY "Students view coach directed sessions"
ON public.coaching_sessions FOR SELECT TO authenticated
USING (session_type = 'coach_directed' AND auth.uid() = student_user_id);

CREATE POLICY "Coaches view coach directed sessions"
ON public.coaching_sessions FOR SELECT TO authenticated
USING (session_type = 'coach_directed' AND auth.uid() = coach_user_id);

CREATE POLICY "Admins view coach directed city sessions"
ON public.coaching_sessions FOR SELECT TO authenticated
USING (session_type = 'coach_directed' AND public.has_city_access(auth.uid(), city));

CREATE POLICY "Coaches create coach directed sessions"
ON public.coaching_sessions FOR INSERT TO authenticated
WITH CHECK (
  session_type = 'coach_directed'
  AND auth.uid() = coach_user_id
  AND public.is_coach(auth.uid())
);

CREATE POLICY "Admins create coach directed city sessions"
ON public.coaching_sessions FOR INSERT TO authenticated
WITH CHECK (session_type = 'coach_directed' AND public.has_city_access(auth.uid(), city));

CREATE POLICY "Coaches update coach directed sessions"
ON public.coaching_sessions FOR UPDATE TO authenticated
USING (session_type = 'coach_directed' AND auth.uid() = coach_user_id)
WITH CHECK (session_type = 'coach_directed' AND auth.uid() = coach_user_id);

CREATE POLICY "Admins update coach directed city sessions"
ON public.coaching_sessions FOR UPDATE TO authenticated
USING (session_type = 'coach_directed' AND public.has_city_access(auth.uid(), city))
WITH CHECK (session_type = 'coach_directed' AND public.has_city_access(auth.uid(), city));

CREATE POLICY "Coaches delete coach directed sessions"
ON public.coaching_sessions FOR DELETE TO authenticated
USING (session_type = 'coach_directed' AND auth.uid() = coach_user_id);

CREATE POLICY "Admins delete coach directed city sessions"
ON public.coaching_sessions FOR DELETE TO authenticated
USING (session_type = 'coach_directed' AND public.has_city_access(auth.uid(), city));

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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF COALESCE(jsonb_typeof(_focuses), '') <> 'array'
     OR COALESCE(jsonb_typeof(_drills), '') <> 'array' THEN
    RAISE EXCEPTION 'Invalid training selection';
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
    NULLIF(trim(_session->>'city'), ''),
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
  SELECT
    v_session_id,
    NULLIF(item->>'focus_id', '')::uuid,
    COALESCE(item->'snapshot', '{}'::jsonb)
  FROM jsonb_array_elements(_focuses) AS item;

  INSERT INTO public.session_drills (session_id, drill_id, focus_id, coach_note, snapshot)
  SELECT
    v_session_id,
    NULLIF(item->>'drill_id', '')::uuid,
    NULLIF(item->>'focus_id', '')::uuid,
    NULLIF(trim(item->>'coach_note'), ''),
    COALESCE(item->'snapshot', '{}'::jsonb)
  FROM jsonb_array_elements(_drills) AS item;

  RETURN v_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_coaching_session_identity_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_coaching_session_identity_change() TO service_role;
REVOKE EXECUTE ON FUNCTION public.complete_self_directed_training(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_self_directed_training(jsonb, jsonb, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.can_read_coaching_session(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_coaching_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_coaching_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_coaching_session(uuid) TO authenticated, service_role;