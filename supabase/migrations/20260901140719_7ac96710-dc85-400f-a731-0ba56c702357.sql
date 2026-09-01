REVOKE ALL ON FUNCTION public.generate_product_sku(text, text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.products_manage_sku() FROM anon, authenticated;