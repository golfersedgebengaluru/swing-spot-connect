-- 1. Corporate-scoped products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS corporate_account_id UUID NULL REFERENCES public.corporate_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_corporate_account_id
  ON public.products(corporate_account_id)
  WHERE corporate_account_id IS NOT NULL;

-- 2. Link bookings & coaching sessions to a monthly invoice
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS invoice_id UUID NULL REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_invoice_id
  ON public.bookings(invoice_id)
  WHERE invoice_id IS NOT NULL;

ALTER TABLE public.coaching_sessions
  ADD COLUMN IF NOT EXISTS invoice_id UUID NULL REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coaching_sessions_invoice_id
  ON public.coaching_sessions(invoice_id)
  WHERE invoice_id IS NOT NULL;
