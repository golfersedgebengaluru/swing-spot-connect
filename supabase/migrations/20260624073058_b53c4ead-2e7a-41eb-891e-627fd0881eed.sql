
DELETE FROM public.bookings
 WHERE id = '356c275b-e0c6-4cb0-8c9d-41a908d6fe0a'
   AND NOT EXISTS (
     SELECT 1 FROM public.revenue_transactions rt
      WHERE rt.booking_id = '356c275b-e0c6-4cb0-8c9d-41a908d6fe0a'
   );

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap_per_bay;

-- Excludes:
--   * rows with bad time data (end_time <= start_time) — legacy invoice entries
--   * invoice-derived accounting entries (note LIKE 'Invoice %') — they
--     intentionally co-exist with real slot bookings and don't represent
--     physical slot occupation.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap_per_bay
  EXCLUDE USING gist (
    bay_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  )
  WHERE (
    bay_id IS NOT NULL
    AND parent_booking_id IS NULL
    AND status IN ('confirmed','pending')
    AND end_time > start_time
    AND (note IS NULL OR note NOT LIKE 'Invoice %')
  );
