
-- Insert site-admin permission toggle keys
INSERT INTO public.admin_config (key, value) VALUES
  ('site_admin_expense_reports_visible', 'false'),
  ('site_admin_pnl_visible', 'false'),
  ('site_admin_product_profitability_visible', 'false'),
  ('site_admin_cost_price_visible', 'false')
ON CONFLICT DO NOTHING;

-- Allow site admins to read these permission keys
CREATE POLICY "Site admins can read permission toggles"
ON public.admin_config
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role) 
  AND key IN (
    'site_admin_expense_reports_visible',
    'site_admin_pnl_visible', 
    'site_admin_product_profitability_visible',
    'site_admin_cost_price_visible',
    'coach_name_required'
  )
);
