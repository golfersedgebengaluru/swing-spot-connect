
CREATE TABLE public.pending_guest_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_order_id text NOT NULL UNIQUE,
  city text NOT NULL,
  bay_id uuid,
  bay_name text,
  calendar_email text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  session_type text DEFAULT 'practice',
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_phone text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'pending',
  finalized_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_guest_bookings_status ON public.pending_guest_bookings(status);
CREATE INDEX idx_pending_guest_bookings_created_at ON public.pending_guest_bookings(created_at DESC);

ALTER TABLE public.pending_guest_bookings ENABLE ROW LEVEL SECURITY;

-- Public can insert (guest checkout flow)
CREATE POLICY "Anyone can create pending guest bookings"
ON public.pending_guest_bookings
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can read/update (service role bypasses RLS)
CREATE POLICY "Admins view pending guest bookings"
ON public.pending_guest_bookings
FOR SELECT
TO authenticated
USING (public.is_admin_or_site_admin(auth.uid()));

CREATE TRIGGER trg_pending_guest_bookings_updated_at
BEFORE UPDATE ON public.pending_guest_bookings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
