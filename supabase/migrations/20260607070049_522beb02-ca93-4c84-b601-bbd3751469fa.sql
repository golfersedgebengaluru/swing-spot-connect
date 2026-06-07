ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS parent_booking_id uuid
  REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_parent_booking_id
  ON public.bookings(parent_booking_id)
  WHERE parent_booking_id IS NOT NULL;