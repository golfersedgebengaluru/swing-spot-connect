
-- Sanitized view: every column except cost_price
CREATE OR REPLACE VIEW public.products_public
WITH (security_invoker = true)
AS
SELECT
  id, name, description, category, item_type, type, in_stock, sku,
  unit_of_measure, price, hsn_code, sac_code, gst_rate,
  opening_stock, reorder_level, reorder_quantity, duration_minutes,
  bookable, city, corporate_account_id, badge, sizes, colors, sort_order,
  image_url, created_at, updated_at
FROM public.products;

GRANT SELECT ON public.products_public TO anon, authenticated;
GRANT ALL    ON public.products_public TO service_role;
