
-- Add city column to offline_payment_methods for per-city overrides
ALTER TABLE offline_payment_methods ADD COLUMN IF NOT EXISTS city text;

-- ─── Site-admin RLS for payment_gateways ───────────────
CREATE POLICY "Site admins can view own city payment_gateways"
ON payment_gateways FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can insert own city payment_gateways"
ON payment_gateways FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can update own city payment_gateways"
ON payment_gateways FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can delete own city payment_gateways"
ON payment_gateways FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

-- ─── Site-admin RLS for offline_payment_methods ────────
-- Site admins can read all methods (global + their city) for inheritance
CREATE POLICY "Site admins can read offline_payment_methods"
ON offline_payment_methods FOR SELECT TO authenticated
USING (is_admin_or_site_admin(auth.uid()));

-- Site admins can only manage their city-specific overrides
CREATE POLICY "Site admins can insert city offline_payment_methods"
ON offline_payment_methods FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND city IS NOT NULL AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can update city offline_payment_methods"
ON offline_payment_methods FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND city IS NOT NULL AND has_city_access(auth.uid(), city))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND city IS NOT NULL AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can delete city offline_payment_methods"
ON offline_payment_methods FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND city IS NOT NULL AND has_city_access(auth.uid(), city));
