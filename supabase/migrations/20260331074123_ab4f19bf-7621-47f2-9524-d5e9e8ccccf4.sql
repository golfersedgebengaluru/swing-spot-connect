
-- ============================================================
-- FIX ALL SITE_ADMIN RLS GAPS
-- ============================================================

-- 1. revenue_transactions: Add UPDATE and DELETE for site_admin
CREATE POLICY "Site admins can update city revenue_transactions"
ON public.revenue_transactions FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND city IS NOT NULL AND has_city_access(auth.uid(), city))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND city IS NOT NULL AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can delete city revenue_transactions"
ON public.revenue_transactions FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND city IS NOT NULL AND has_city_access(auth.uid(), city));

-- 2. invoices: Add DELETE for site_admin
CREATE POLICY "Site admins can delete city invoices"
ON public.invoices FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND city IS NOT NULL AND has_city_access(auth.uid(), city));

-- 3. invoice_line_items: Add UPDATE and DELETE for site_admin
CREATE POLICY "Site admins can update city invoice_line_items"
ON public.invoice_line_items FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND EXISTS (
  SELECT 1 FROM invoices WHERE invoices.id = invoice_line_items.invoice_id AND invoices.city IS NOT NULL AND has_city_access(auth.uid(), invoices.city)
))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND EXISTS (
  SELECT 1 FROM invoices WHERE invoices.id = invoice_line_items.invoice_id AND invoices.city IS NOT NULL AND has_city_access(auth.uid(), invoices.city)
));

CREATE POLICY "Site admins can delete city invoice_line_items"
ON public.invoice_line_items FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND EXISTS (
  SELECT 1 FROM invoices WHERE invoices.id = invoice_line_items.invoice_id AND invoices.city IS NOT NULL AND has_city_access(auth.uid(), invoices.city)
));

-- 4. bookings: Add DELETE for site_admin
CREATE POLICY "Site admins can delete city bookings"
ON public.bookings FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

-- 5. products: Full CRUD for site_admin (city-scoped)
CREATE POLICY "Site admins can view city products"
ON public.products FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Site admins can insert city products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND (city IS NULL OR has_city_access(auth.uid(), city)));

CREATE POLICY "Site admins can update city products"
ON public.products FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND (city IS NULL OR has_city_access(auth.uid(), city)))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND (city IS NULL OR has_city_access(auth.uid(), city)));

CREATE POLICY "Site admins can delete city products"
ON public.products FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND city IS NOT NULL AND has_city_access(auth.uid(), city));

-- 6. bay_pricing: Full CRUD for site_admin (city-scoped)
CREATE POLICY "Site admins can view city bay_pricing"
ON public.bay_pricing FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can insert city bay_pricing"
ON public.bay_pricing FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can update city bay_pricing"
ON public.bay_pricing FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can delete city bay_pricing"
ON public.bay_pricing FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

-- 7. bays: Full CRUD for site_admin (city-scoped)
CREATE POLICY "Site admins can view city bays"
ON public.bays FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can insert city bays"
ON public.bays FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can update city bays"
ON public.bays FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can delete city bays"
ON public.bays FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

-- 8. bay_config: Full CRUD for site_admin (city-scoped)
CREATE POLICY "Site admins can view city bay_config"
ON public.bay_config FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can insert city bay_config"
ON public.bay_config FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can update city bay_config"
ON public.bay_config FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can delete city bay_config"
ON public.bay_config FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

-- 9. events: Full CRUD for site_admin
CREATE POLICY "Site admins can view events"
ON public.events FOR SELECT TO authenticated
USING (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Site admins can insert events"
ON public.events FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Site admins can update events"
ON public.events FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Site admins can delete events"
ON public.events FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role));

-- 10. rewards: Full CRUD for site_admin
CREATE POLICY "Site admins can insert rewards"
ON public.rewards FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Site admins can update rewards"
ON public.rewards FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Site admins can delete rewards"
ON public.rewards FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role));

-- 11. earn_methods: Full CRUD for site_admin
CREATE POLICY "Site admins can insert earn_methods"
ON public.earn_methods FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Site admins can update earn_methods"
ON public.earn_methods FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Site admins can delete earn_methods"
ON public.earn_methods FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role));

-- 12. product_categories: Full CRUD for site_admin
CREATE POLICY "Site admins can insert product_categories"
ON public.product_categories FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Site admins can update product_categories"
ON public.product_categories FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Site admins can delete product_categories"
ON public.product_categories FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role));

-- 13. units_of_measure: Full CRUD for site_admin
CREATE POLICY "Site admins can insert units_of_measure"
ON public.units_of_measure FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Site admins can update units_of_measure"
ON public.units_of_measure FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Site admins can delete units_of_measure"
ON public.units_of_measure FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role));

-- 14. notifications: Add SELECT for site_admin
CREATE POLICY "Site admins can view notifications"
ON public.notifications FOR SELECT TO authenticated
USING (is_admin_or_site_admin(auth.uid()));

-- 15. hour_packages: Full CRUD for site_admin
CREATE POLICY "Site admins can manage hour_packages"
ON public.hour_packages FOR ALL TO authenticated
USING (is_admin_or_site_admin(auth.uid()))
WITH CHECK (is_admin_or_site_admin(auth.uid()));

-- 16. admin_config: Allow site_admin to read branding keys needed for operations
CREATE POLICY "Site admins can read operational config"
ON public.admin_config FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'site_admin'::app_role) AND key IN ('studio_name', 'logo_url', 'primary_color', 'footer_text', 'default_currency'));

-- 17. gst_profiles: Add INSERT for site_admin (in case they need to set up their city's GST)
CREATE POLICY "Site admins can insert own city gst_profiles"
ON public.gst_profiles FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));
