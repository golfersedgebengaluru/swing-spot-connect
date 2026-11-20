-- View-only Google copies of app block-outs. Rows outlive their block-out on purpose:
-- the mirror removes a Google entry only after seeing that its source is gone.
CREATE TABLE public.bay_blockout_google_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  blockout_id uuid,
  series_id uuid,
  calendar_id text NOT NULL,
  event_id text NOT NULL,
  synced_version text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bay_blockout_google_events_source_check CHECK ((blockout_id IS NULL) <> (series_id IS NULL))
);
CREATE UNIQUE INDEX bay_blockout_google_events_source_calendar_idx
  ON public.bay_blockout_google_events (COALESCE(blockout_id, series_id), calendar_id);
CREATE INDEX bay_blockout_google_events_city_idx ON public.bay_blockout_google_events (city);

GRANT ALL ON public.bay_blockout_google_events TO service_role;
ALTER TABLE public.bay_blockout_google_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bay_day_schedule(p_city text, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(kind text, id uuid, bay_id uuid, start_time timestamptz, end_time timestamptz, label text, session_type text, on_google boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  SELECT 'blockout', o.id, o.bay_id, o.start_time, o.end_time, NULLIF(o.reason, ''), NULL::text,
         EXISTS (SELECT 1 FROM public.bay_blockout_google_events g WHERE g.blockout_id = o.id)
  FROM public.bay_blockouts o
  WHERE o.city = p_city AND o.start_time < p_to AND o.end_time > p_from
  UNION ALL
  SELECT 'recurring_blockout', r.series_id, r.bay_id, r.start_time, r.end_time, NULLIF(r.reason, ''), NULL::text,
         EXISTS (SELECT 1 FROM public.bay_blockout_google_events g WHERE g.series_id = r.series_id)
  FROM public.bay_blockout_series_ranges(p_city, p_from, p_to) r;
END;
$$;