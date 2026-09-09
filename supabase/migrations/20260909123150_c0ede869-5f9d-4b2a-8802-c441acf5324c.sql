ALTER TABLE public.revenue_transactions ADD COLUMN IF NOT EXISTS revenue_date date;

COMMENT ON COLUMN public.revenue_transactions.revenue_date IS
  'Business date the revenue belongs to (IST). Equals the linked invoice date when an invoice exists, else the IST calendar date of created_at. All revenue reporting periods are measured on this column.';

CREATE OR REPLACE FUNCTION public.stamp_revenue_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.revenue_date IS NULL THEN
    NEW.revenue_date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Kolkata')::date;
  END IF;

  IF NEW.city IS NULL OR btrim(NEW.city) = '' THEN
    NEW.city := NULL;

    IF NEW.metadata ? 'city' THEN
      NEW.city := nullif(btrim(NEW.metadata->>'city'), '');
    END IF;

    IF NEW.city IS NULL AND NEW.booking_id IS NOT NULL THEN
      SELECT nullif(btrim(b.city), '') INTO NEW.city
      FROM public.bookings b WHERE b.id = NEW.booking_id;
    END IF;

    IF NEW.city IS NULL AND NEW.original_transaction_id IS NOT NULL THEN
      SELECT nullif(btrim(r.city), '') INTO NEW.city
      FROM public.revenue_transactions r WHERE r.id = NEW.original_transaction_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_revenue_defaults_before_insert ON public.revenue_transactions;
CREATE TRIGGER stamp_revenue_defaults_before_insert
BEFORE INSERT ON public.revenue_transactions
FOR EACH ROW EXECUTE FUNCTION public.stamp_revenue_defaults();

CREATE OR REPLACE FUNCTION public.sync_revenue_date_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.revenue_transaction_id IS NOT NULL AND NEW.invoice_date IS NOT NULL THEN
    UPDATE public.revenue_transactions
    SET revenue_date = NEW.invoice_date,
        updated_at = now()
    WHERE id = NEW.revenue_transaction_id
      AND revenue_date IS DISTINCT FROM NEW.invoice_date;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_revenue_date_after_invoice ON public.invoices;
CREATE TRIGGER sync_revenue_date_after_invoice
AFTER INSERT OR UPDATE OF invoice_date, revenue_transaction_id ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_revenue_date_from_invoice();

CREATE INDEX IF NOT EXISTS idx_revenue_transactions_city_revenue_date
  ON public.revenue_transactions (city, revenue_date);
CREATE INDEX IF NOT EXISTS idx_revenue_transactions_revenue_date
  ON public.revenue_transactions (revenue_date);