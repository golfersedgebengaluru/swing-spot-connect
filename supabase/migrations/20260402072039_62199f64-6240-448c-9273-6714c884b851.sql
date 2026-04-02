
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid';

-- Set existing invoices: amount_paid = total for all issued invoices
UPDATE public.invoices SET amount_paid = total, payment_status = 'paid' WHERE payment_status = 'paid';
