-- Add webhook_secret to payment_gateways for per-city Razorpay webhook verification
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- Add payment tracking columns to orders and bookings so webhook handler can
-- mark them as paid/failed without relying only on client-side callbacks.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'not_required';

-- Indexes for efficient webhook lookups
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id
  ON public.orders (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_razorpay_order_id
  ON public.bookings (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;
