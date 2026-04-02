ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date date DEFAULT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_category text NOT NULL DEFAULT 'purchase';