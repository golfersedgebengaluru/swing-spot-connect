ALTER TABLE public.hours_transactions
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS service_date date,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hours_transactions_booking_id ON public.hours_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_hours_transactions_service_date ON public.hours_transactions(service_date);