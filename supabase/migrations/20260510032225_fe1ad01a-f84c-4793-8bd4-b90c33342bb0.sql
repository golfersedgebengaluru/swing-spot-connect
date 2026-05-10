
REVOKE EXECUTE ON FUNCTION public.auto_create_invoice_for_revenue(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_missing_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_create_invoice_for_revenue(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_missing_invoices() TO service_role;
