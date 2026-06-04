
-- PRODUCTS: drop the duplicate select policy that didn't check city
DROP POLICY IF EXISTS "Site admins can view city products" ON public.products;
-- The remaining "Site admins can view products" policy already enforces (city IS NULL OR has_city_access)

-- FINANCIAL YEARS: replace cross-city select with city-scoped
DROP POLICY IF EXISTS "Site admins can view financial_years" ON public.financial_years;
CREATE POLICY "Site admins can view city financial_years"
  ON public.financial_years FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'site_admin'::app_role)
    AND (city IS NULL OR has_city_access(auth.uid(), city))
  );

-- INVOICE SETTINGS: replace cross-city select
DROP POLICY IF EXISTS "Invoice settings readable by all admins" ON public.invoice_settings;
CREATE POLICY "Admins can view invoice_settings"
  ON public.invoice_settings FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Site admins can view city invoice_settings"
  ON public.invoice_settings FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'site_admin'::app_role)
    AND (city IS NULL OR has_city_access(auth.uid(), city))
  );

-- OFFLINE PAYMENT METHODS: replace cross-city select
DROP POLICY IF EXISTS "Site admins can read offline_payment_methods" ON public.offline_payment_methods;
CREATE POLICY "Site admins can view city offline_payment_methods"
  ON public.offline_payment_methods FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'site_admin'::app_role)
    AND (city IS NULL OR has_city_access(auth.uid(), city))
  );
