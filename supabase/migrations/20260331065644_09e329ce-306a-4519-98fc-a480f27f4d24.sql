
-- Allow site-admins to INSERT invoices for their assigned cities
CREATE POLICY "Site admins can insert city invoices"
ON public.invoices FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND city IS NOT NULL
  AND has_city_access(auth.uid(), city)
);

-- Allow site-admins to UPDATE invoices for their assigned cities (needed for cancellation flow)
CREATE POLICY "Site admins can update city invoices"
ON public.invoices FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND city IS NOT NULL
  AND has_city_access(auth.uid(), city)
)
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND city IS NOT NULL
  AND has_city_access(auth.uid(), city)
);

-- Allow site-admins to INSERT invoice line items (for invoices in their cities)
CREATE POLICY "Site admins can insert city invoice_line_items"
ON public.invoice_line_items FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.id = invoice_line_items.invoice_id
      AND invoices.city IS NOT NULL
      AND has_city_access(auth.uid(), invoices.city)
  )
);

-- Allow site-admins to manage invoice_sequences for their cities' GSTINs
CREATE POLICY "Site admins can manage invoice_sequences"
ON public.invoice_sequences FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM gst_profiles
    WHERE gst_profiles.gstin = invoice_sequences.gstin
      AND has_city_access(auth.uid(), gst_profiles.city)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM gst_profiles
    WHERE gst_profiles.gstin = invoice_sequences.gstin
      AND has_city_access(auth.uid(), gst_profiles.city)
  )
);

-- Allow site-admins to manage recycled_invoice_numbers for their cities
CREATE POLICY "Site admins can manage recycled_invoice_numbers"
ON public.recycled_invoice_numbers FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM gst_profiles
    WHERE gst_profiles.gstin = recycled_invoice_numbers.gstin
      AND has_city_access(auth.uid(), gst_profiles.city)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM gst_profiles
    WHERE gst_profiles.gstin = recycled_invoice_numbers.gstin
      AND has_city_access(auth.uid(), gst_profiles.city)
  )
);

-- Allow site-admins to INSERT revenue_transactions for their cities (needed for walk-in bookings)
CREATE POLICY "Site admins can insert city revenue_transactions"
ON public.revenue_transactions FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND city IS NOT NULL
  AND has_city_access(auth.uid(), city)
);
