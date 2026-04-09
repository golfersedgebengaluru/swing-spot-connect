-- Table to store verified Razorpay webhook events.
-- Idempotency: razorpay_event_id is unique to prevent duplicate processing.

CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  razorpay_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,         -- e.g. "payment.captured", "payment.failed"
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  amount_paise INTEGER,
  currency TEXT,
  city TEXT,
  raw_payload JSONB NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Only admins can read payment events; no public access
CREATE POLICY "Admins can read payment events"
  ON public.payment_events FOR SELECT
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

-- Rate limit attempts table for auth endpoint protection
CREATE TABLE IF NOT EXISTS public.rate_limit_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,   -- IP address or user_id
  action TEXT NOT NULL,       -- e.g. "setup-admin", "change-admin-password"
  attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_attempts_lookup
  ON public.rate_limit_attempts (identifier, action, attempted_at);

ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- No direct client access — only service role writes to this table
