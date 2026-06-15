REVOKE EXECUTE ON FUNCTION public.auto_create_invoice_for_revenue(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_referenced_product_delete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_create_invoice_for_revenue(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_referenced_product_delete() TO service_role;