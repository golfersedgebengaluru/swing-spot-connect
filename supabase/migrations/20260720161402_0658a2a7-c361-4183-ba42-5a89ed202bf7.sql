
CREATE TABLE public.pending_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  city TEXT NOT NULL,
  bay_id UUID,
  bay_name TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  session_type TEXT,
  display_name TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  coupon_code TEXT,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  original_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending',
  booking_id UUID,
  finalized_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.pending_bookings TO authenticated;
GRANT ALL ON public.pending_bookings TO service_role;

ALTER TABLE public.pending_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pending bookings"
  ON public.pending_bookings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access pending bookings"
  ON public.pending_bookings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_pending_bookings_updated_at
  BEFORE UPDATE ON public.pending_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pending_bookings_status_created
  ON public.pending_bookings (status, created_at);
