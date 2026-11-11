-- Weekly repeating block-outs: one rule expanded on the fly, in the city's timezone,
-- wherever availability and the staff day view read block-outs.
CREATE TABLE public.bay_blockout_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  bay_id uuid REFERENCES public.bays(id) ON DELETE CASCADE,
  days_of_week smallint[] NOT NULL,
  start_local time NOT NULL,
  end_local time NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  skipped_dates date[] NOT NULL DEFAULT '{}',
  reason text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bay_blockout_series_days_check CHECK (cardinality(days_of_week) BETWEEN 1 AND 7 AND days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
  CONSTRAINT bay_blockout_series_time_check CHECK (end_local > start_local),
  CONSTRAINT bay_blockout_series_dates_check CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT bay_blockout_series_reason_check CHECK (char_length(reason) <= 200)
);
CREATE INDEX bay_blockout_series_city_idx ON public.bay_blockout_series (city);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bay_blockout_series TO authenticated;
GRANT ALL ON public.bay_blockout_series TO service_role;
ALTER TABLE public.bay_blockout_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read city recurring block-outs" ON public.bay_blockout_series
  FOR SELECT TO authenticated USING (public.has_city_access(auth.uid(), city));
CREATE POLICY "Staff add city recurring block-outs" ON public.bay_blockout_series
  FOR INSERT TO authenticated WITH CHECK (
    public.has_city_access(auth.uid(), city) AND created_by = auth.uid()
    AND (bay_id IS NULL OR EXISTS (SELECT 1 FROM public.bays b WHERE b.id = bay_blockout_series.bay_id AND b.city = bay_blockout_series.city))
  );
CREATE POLICY "Staff change city recurring block-outs" ON public.bay_blockout_series
  FOR UPDATE TO authenticated USING (public.has_city_access(auth.uid(), city))
  WITH CHECK (
    public.has_city_access(auth.uid(), city)
    AND (bay_id IS NULL OR EXISTS (SELECT 1 FROM public.bays b WHERE b.id = bay_blockout_series.bay_id AND b.city = bay_blockout_series.city))
  );
CREATE POLICY "Staff remove city recurring block-outs" ON public.bay_blockout_series
  FOR DELETE TO authenticated USING (public.has_city_access(auth.uid(), city));

-- Occurrences of every rule overlapping [p_from, p_to), in the city's local time.
CREATE OR REPLACE FUNCTION public.bay_blockout_series_ranges(p_city text, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(series_id uuid, bay_id uuid, start_time timestamptz, end_time timestamptz, reason text)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH tz AS (
    SELECT COALESCE((SELECT c.timezone FROM public.bay_config c WHERE c.city = p_city LIMIT 1), 'Asia/Kolkata') AS zone
  )
  SELECT s.id, s.bay_id,
         (d.day + s.start_local) AT TIME ZONE tz.zone,
         (d.day + s.end_local) AT TIME ZONE tz.zone,
         s.reason
  FROM public.bay_blockout_series s
  CROSS JOIN tz
  CROSS JOIN LATERAL (
    SELECT g::date AS day
    FROM generate_series(
      GREATEST(s.starts_on, (p_from AT TIME ZONE tz.zone)::date - 1)::timestamp,
      LEAST(COALESCE(s.ends_on, 'infinity'::date), (p_to AT TIME ZONE tz.zone)::date)::timestamp,
      interval '1 day'
    ) g
  ) d
  WHERE s.city = p_city
    AND EXTRACT(DOW FROM d.day)::smallint = ANY (s.days_of_week)
    AND NOT (d.day = ANY (s.skipped_dates))
    AND (d.day + s.start_local) AT TIME ZONE tz.zone < p_to
    AND (d.day + s.end_local) AT TIME ZONE tz.zone > p_from
$$;
REVOKE ALL ON FUNCTION public.bay_blockout_series_ranges(text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bay_blockout_series_ranges(text, timestamptz, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.bay_busy_ranges(p_city text, p_from timestamptz, p_to timestamptz, p_exclude_hold uuid DEFAULT NULL::uuid)
RETURNS TABLE(bay_id uuid, start_time timestamptz, end_time timestamptz, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT b.bay_id, b.start_time, b.end_time, 'booking'::text
  FROM public.bookings b
  WHERE b.city = p_city AND b.bay_id IS NOT NULL AND b.parent_booking_id IS NULL
    AND b.status IN ('confirmed', 'pending') AND b.end_time > b.start_time
    AND (b.note IS NULL OR b.note NOT LIKE 'Invoice %')
    AND b.start_time < p_to AND b.end_time > p_from
  UNION ALL
  SELECT h.bay_id, h.start_time, h.end_time, 'hold'
  FROM public.bay_holds h
  WHERE h.city = p_city AND h.released_at IS NULL AND h.expires_at > now()
    AND (p_exclude_hold IS NULL OR h.id <> p_exclude_hold)
    AND h.start_time < p_to AND h.end_time > p_from
  UNION ALL
  SELECT COALESCE(o.bay_id, bay.id), o.start_time, o.end_time, 'blockout'
  FROM public.bay_blockouts o
  JOIN public.bays bay ON bay.city = o.city AND (o.bay_id IS NULL OR bay.id = o.bay_id)
  WHERE o.city = p_city AND o.start_time < p_to AND o.end_time > p_from
  UNION ALL
  SELECT COALESCE(r.bay_id, bay.id), r.start_time, r.end_time, 'blockout'
  FROM public.bay_blockout_series_ranges(p_city, p_from, p_to) r
  JOIN public.bays bay ON bay.city = p_city AND (r.bay_id IS NULL OR bay.id = r.bay_id)
  UNION ALL
  SELECT l.bay_id, l.blocked_from, l.blocked_to, 'league'
  FROM public.league_bay_blocks l
  JOIN public.bays bay ON bay.id = l.bay_id
  WHERE bay.city = p_city AND l.blocked_from < p_to AND l.blocked_to > p_from
$function$;

CREATE OR REPLACE FUNCTION public.bay_day_schedule(p_city text, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(kind text, id uuid, bay_id uuid, start_time timestamptz, end_time timestamptz, label text, session_type text, on_google boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_city_access(auth.uid(), p_city) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_to <= p_from OR p_to - p_from > interval '8 days' THEN
    RAISE EXCEPTION 'Invalid range';
  END IF;
  RETURN QUERY
  SELECT 'booking'::text, b.id, b.bay_id, b.start_time, b.end_time,
         COALESCE(NULLIF(p.display_name, ''), NULLIF(b.note, ''), 'Booking'),
         b.session_type, b.calendar_event_id IS NOT NULL
  FROM public.bookings b
  LEFT JOIN LATERAL (
    SELECT pr.display_name FROM public.profiles pr
    WHERE pr.user_id = b.user_id OR pr.id = b.user_id
    ORDER BY (pr.user_id = b.user_id) DESC LIMIT 1
  ) p ON true
  WHERE b.city = p_city AND b.bay_id IS NOT NULL AND b.parent_booking_id IS NULL
    AND b.status IN ('confirmed', 'pending')
    AND (b.note IS NULL OR b.note NOT LIKE 'Invoice %')
    AND b.start_time < p_to AND b.end_time > p_from
  UNION ALL
  SELECT 'hold', h.id, h.bay_id, h.start_time, h.end_time, 'Payment in progress', NULL::text, true
  FROM public.bay_holds h
  WHERE h.city = p_city AND h.released_at IS NULL AND h.expires_at > now()
    AND h.start_time < p_to AND h.end_time > p_from
  UNION ALL
  SELECT 'blockout', o.id, o.bay_id, o.start_time, o.end_time, NULLIF(o.reason, ''), NULL::text, true
  FROM public.bay_blockouts o
  WHERE o.city = p_city AND o.start_time < p_to AND o.end_time > p_from
  UNION ALL
  SELECT 'recurring_blockout', r.series_id, r.bay_id, r.start_time, r.end_time, NULLIF(r.reason, ''), NULL::text, true
  FROM public.bay_blockout_series_ranges(p_city, p_from, p_to) r;
END;
$function$;

-- Remove one day of a repeating block, or end it from that day on. Runs as the
-- caller so table policies apply; refuses when nothing the caller may change was found.
CREATE OR REPLACE FUNCTION public.remove_bay_blockout_occurrence(p_series uuid, p_date date, p_scope text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_starts date;
  v_count int;
BEGIN
  IF p_scope NOT IN ('day', 'following') THEN RAISE EXCEPTION 'Invalid scope'; END IF;
  SELECT s.starts_on INTO v_starts FROM public.bay_blockout_series s WHERE s.id = p_series FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recurring block not found' USING ERRCODE = '42501'; END IF;
  IF p_scope = 'following' AND p_date <= v_starts THEN
    DELETE FROM public.bay_blockout_series WHERE id = p_series;
  ELSIF p_scope = 'following' THEN
    UPDATE public.bay_blockout_series SET ends_on = p_date - 1
    WHERE id = p_series AND (ends_on IS NULL OR ends_on >= p_date);
  ELSE
    UPDATE public.bay_blockout_series SET skipped_dates = array_append(skipped_dates, p_date)
    WHERE id = p_series AND NOT (p_date = ANY (skipped_dates));
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'Recurring block was not changed' USING ERRCODE = '42501'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_bay_blockout_occurrence(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_bay_blockout_occurrence(uuid, date, text) TO authenticated, service_role;