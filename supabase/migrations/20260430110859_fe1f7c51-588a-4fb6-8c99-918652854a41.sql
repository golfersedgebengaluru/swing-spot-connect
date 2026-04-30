-- 1. Corporate accounts table
CREATE TABLE public.corporate_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  gstin TEXT,
  billing_email TEXT,
  billing_address TEXT,
  state TEXT,
  state_code TEXT,
  billing_cycle_day INTEGER NOT NULL DEFAULT 1 CHECK (billing_cycle_day BETWEEN 1 AND 28),
  payment_terms_days INTEGER NOT NULL DEFAULT 15,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.corporate_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view corporate accounts"
  ON public.corporate_accounts FOR SELECT
  USING (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can insert corporate accounts"
  ON public.corporate_accounts FOR INSERT
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can update corporate accounts"
  ON public.corporate_accounts FOR UPDATE
  USING (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can delete corporate accounts"
  ON public.corporate_accounts FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_corporate_accounts_updated_at
  BEFORE UPDATE ON public.corporate_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Profiles: billing mode + corporate account link
ALTER TABLE public.profiles
  ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'standard'
    CHECK (billing_mode IN ('standard', 'monthly_consolidated')),
  ADD COLUMN corporate_account_id UUID REFERENCES public.corporate_accounts(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_corporate_account ON public.profiles(corporate_account_id)
  WHERE corporate_account_id IS NOT NULL;

-- 3. Bookings: billing status + invoice link
ALTER TABLE public.bookings
  ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'immediate'
    CHECK (billing_status IN ('immediate', 'deferred', 'invoiced')),
  ADD COLUMN corporate_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX idx_bookings_billing_status ON public.bookings(billing_status)
  WHERE billing_status = 'deferred';
CREATE INDEX idx_bookings_corporate_invoice ON public.bookings(corporate_invoice_id)
  WHERE corporate_invoice_id IS NOT NULL;

-- 4. Coaching sessions: billing status + invoice link
ALTER TABLE public.coaching_sessions
  ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'immediate'
    CHECK (billing_status IN ('immediate', 'deferred', 'invoiced')),
  ADD COLUMN corporate_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX idx_coaching_billing_status ON public.coaching_sessions(billing_status)
  WHERE billing_status = 'deferred';
CREATE INDEX idx_coaching_corporate_invoice ON public.coaching_sessions(corporate_invoice_id)
  WHERE corporate_invoice_id IS NOT NULL;