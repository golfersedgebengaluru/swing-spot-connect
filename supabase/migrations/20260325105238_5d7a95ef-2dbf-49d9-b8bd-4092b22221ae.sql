
-- Financial Years table
CREATE TABLE public.financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Financial years viewable by admins" ON public.financial_years
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage financial_years" ON public.financial_years
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Revenue Transactions table
CREATE TABLE public.revenue_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL CHECK (transaction_type IN ('payment', 'hours_deduction', 'guest_booking', 'refund')),
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  user_id uuid,
  guest_name text,
  guest_email text,
  guest_phone text,
  gateway_name text,
  gateway_order_ref text,
  gateway_payment_ref text UNIQUE,
  booking_id uuid REFERENCES public.bookings(id),
  hours_transaction_id uuid REFERENCES public.hours_transactions(id),
  description text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'failed', 'refunded')),
  original_transaction_id uuid REFERENCES public.revenue_transactions(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.revenue_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage revenue_transactions" ON public.revenue_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own revenue_transactions" ON public.revenue_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Index for duplicate webhook detection
CREATE UNIQUE INDEX idx_revenue_gateway_payment_ref ON public.revenue_transactions(gateway_payment_ref) WHERE gateway_payment_ref IS NOT NULL;

-- Index for financial year date range queries
CREATE INDEX idx_revenue_created_at ON public.revenue_transactions(created_at);
CREATE INDEX idx_financial_years_active ON public.financial_years(is_active) WHERE is_active = true;
