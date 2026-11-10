-- App calendar is the booking record of truth: bay types, Bunker hours settings,
-- per-city availability source, payment holds, staff block-outs, and one
-- authorized busy-range/reservation path shared by every booking flow.

ALTER TABLE public.bays
  ADD COLUMN IF NOT EXISTS bay_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS member_hours_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS member_hours_rate numeric NOT NULL DEFAULT 1;
ALTER TABLE public.bays
  ADD CONSTRAINT bays_bay_type_check CHECK (bay_type IN ('standard', 'bunker')),
  ADD CONSTRAINT bays_member_hours_rate_check CHECK (member_hours_rate > 0 AND member_hours_rate <= 10);

ALTER TABLE public.bay_pricing
  ADD COLUMN IF NOT EXISTS bay_type text NOT NULL DEFAULT 'standard';
ALTER TABLE public.bay_pricing
  ADD CONSTRAINT bay_pricing_bay_type_check CHECK (bay_type IN ('standard', 'bunker'));
CREATE UNIQUE INDEX bay_pricing_city_bay_type_day_session_key
  ON public.bay_pricing (city, bay_type, day_type, session_type);
ALTER TABLE public.bay_pricing DROP CONSTRAINT IF EXISTS bay_pricing_city_day_type_session_type_key;
DROP INDEX IF EXISTS public.bay_pricing_city_day_type_session_type_key;

-- Booking screens read these settings; existing column-level grants stay as they are.
GRANT SELECT (bay_type, member_hours_enabled, member_hours_rate) ON public.bays TO anon, authenticated;

ALTER TABLE public.bay_config
  ADD COLUMN IF NOT EXISTS availability_source text NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE public.bay_config
  ADD CONSTRAINT bay_config_availability_source_check CHECK (availability_source IN ('google', 'app'));
GRANT SELECT (availability_source, timezone) ON public.bay_config TO anon, authenticated;

-- Short-lived slot reservations while a customer pays. Service-only.
CREATE TABLE public.bay_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bay_id uuid NOT NULL REFERENCES public.bays(id) ON DELETE CASCADE,
  city text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  razorpay_order_id text UNIQUE,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bay_holds_range_check CHECK (end_time > start_time)
);
REVOKE ALL ON public.bay_holds FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bay_holds TO service_role;
CREATE INDEX bay_holds_live_idx ON public.bay_holds (city, start_time, end_time) WHERE released_at IS NULL;
ALTER TABLE public.bay_holds ENABLE ROW LEVEL SECURITY;

-- Staff block-outs. bay_id NULL blocks every bay in the city.
CREATE TABLE public.bay_blockouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  bay_id uuid REFERENCES public.bays(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bay_blockouts_range_check CHECK (end_time > start_time),
  CONSTRAINT bay_blockouts_reason_length CHECK (char_length(reason) <= 200)
);
REVOKE ALL ON public.bay_blockouts FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.bay_blockouts TO authenticated;
GRANT ALL ON public.bay_blockouts TO service_role;
CREATE INDEX bay_blockouts_city_time_idx ON public.bay_blockouts (city, start_time, end_time);
ALTER TABLE public.bay_blockouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read city block-outs" ON public.bay_blockouts
  FOR SELECT TO authenticated USING (public.has_city_access(auth.uid(), city));
CREATE POLICY "Staff add city block-outs" ON public.bay_blockouts
  FOR INSERT TO authenticated WITH CHECK (
    public.has_city_access(auth.uid(), city)
    AND created_by = auth.uid()
    AND (bay_id IS NULL OR EXISTS (SELECT 1 FROM public.bays b WHERE b.id = bay_id AND b.city = bay_blockouts.city))
  );
CREATE POLICY "Staff remove city block-outs" ON public.bay_blockouts
  FOR DELETE TO authenticated USING (public.has_city_access(auth.uid(), city));

-- Every reason a bay is unavailable, from app records only.
CREATE OR REPLACE FUNCTION public.bay_busy_ranges(p_city text, p_from timestamptz, p_to timestamptz, p_exclude_hold uuid DEFAULT NULL)
RETURNS TABLE (bay_id uuid, start_time timestamptz, end_time timestamptz, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
  SELECT l.bay_id, l.blocked_from, l.blocked_to, 'league'
  FROM public.league_bay_blocks l
  JOIN public.bays bay ON bay.id = l.bay_id
  WHERE bay.city = p_city AND l.blocked_from < p_to AND l.blocked_to > p_from
$$;
REVOKE ALL ON FUNCTION public.bay_busy_ranges(text, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bay_busy_ranges(text, timestamptz, timestamptz, uuid) TO service_role;

-- Pick a free bay (preferred bay first, then any active bay of the same type;
-- a NULL type means only the preferred bay) and optionally hold it.
-- Serialized per city so two checkouts cannot take the same bay.
CREATE OR REPLACE FUNCTION public.reserve_bay_slot(
  p_city text, p_bay_type text, p_preferred_bay uuid, p_start timestamptz, p_end timestamptz,
  p_hold_minutes integer DEFAULT NULL, p_exclude_hold uuid DEFAULT NULL
) RETURNS TABLE (bay_id uuid, hold_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_bay uuid;
  v_hold uuid;
BEGIN
  IF p_end <= p_start THEN RAISE EXCEPTION 'Invalid time range'; END IF;
  IF p_hold_minutes IS NOT NULL AND (p_hold_minutes < 1 OR p_hold_minutes > 30) THEN
    RAISE EXCEPTION 'Invalid hold length';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bay-slots:' || p_city));

  SELECT bay.id INTO v_bay
  FROM public.bays bay
  WHERE bay.city = p_city AND bay.is_active
    AND (bay.id = p_preferred_bay OR bay.bay_type = p_bay_type)
    AND NOT EXISTS (
      SELECT 1 FROM public.bay_busy_ranges(p_city, p_start, p_end, p_exclude_hold) r WHERE r.bay_id = bay.id
    )
  ORDER BY (bay.id = p_preferred_bay) DESC NULLS LAST, bay.sort_order, bay.name
  LIMIT 1;

  IF v_bay IS NULL THEN RETURN; END IF;

  IF p_exclude_hold IS NOT NULL THEN
    UPDATE public.bay_holds SET released_at = now() WHERE id = p_exclude_hold AND released_at IS NULL;
  END IF;

  IF p_hold_minutes IS NOT NULL THEN
    INSERT INTO public.bay_holds (bay_id, city, start_time, end_time, expires_at)
    VALUES (v_bay, p_city, p_start, p_end, now() + make_interval(mins => p_hold_minutes))
    RETURNING id INTO v_hold;
  END IF;

  bay_id := v_bay;
  hold_id := v_hold;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_bay_slot(text, text, uuid, timestamptz, timestamptz, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_bay_slot(text, text, uuid, timestamptz, timestamptz, integer, uuid) TO service_role;

-- All-bays day view for staff: bookings, live holds and block-outs in one authorized read.
CREATE OR REPLACE FUNCTION public.bay_day_schedule(p_city text, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  kind text, id uuid, bay_id uuid, start_time timestamptz, end_time timestamptz,
  label text, session_type text, on_google boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
  WHERE o.city = p_city AND o.start_time < p_to AND o.end_time > p_from;
END;
$$;
REVOKE ALL ON FUNCTION public.bay_day_schedule(text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bay_day_schedule(text, timestamptz, timestamptz) TO authenticated, service_role;