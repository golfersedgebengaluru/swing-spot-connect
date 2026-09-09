ALTER TABLE public.revenue_transactions
  ALTER COLUMN revenue_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date);

ALTER TABLE public.revenue_transactions
  ALTER COLUMN revenue_date SET NOT NULL;

REVOKE ALL ON FUNCTION public.stamp_revenue_defaults() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_revenue_date_from_invoice() FROM anon, authenticated;