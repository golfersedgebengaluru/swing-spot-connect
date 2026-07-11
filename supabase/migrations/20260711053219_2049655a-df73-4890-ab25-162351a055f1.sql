
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_discount_type_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_discount_type_check
  CHECK (discount_type IS NULL OR discount_type IN ('percentage','amount'));
