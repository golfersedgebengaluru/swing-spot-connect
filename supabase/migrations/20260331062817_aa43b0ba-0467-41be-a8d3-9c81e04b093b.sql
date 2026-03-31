
-- Site admins can view bookings for their assigned cities
CREATE POLICY "Site admins can view city bookings"
ON public.bookings FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role) 
  AND has_city_access(auth.uid(), city)
);

-- Site admins can update bookings for their assigned cities
CREATE POLICY "Site admins can update city bookings"
ON public.bookings FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role) 
  AND has_city_access(auth.uid(), city)
)
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role) 
  AND has_city_access(auth.uid(), city)
);

-- Site admins can view revenue transactions for their assigned cities
CREATE POLICY "Site admins can view city revenue_transactions"
ON public.revenue_transactions FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role) 
  AND city IS NOT NULL
  AND has_city_access(auth.uid(), city)
);

-- Site admins can view invoices for their assigned cities
CREATE POLICY "Site admins can view city invoices"
ON public.invoices FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role) 
  AND city IS NOT NULL
  AND has_city_access(auth.uid(), city)
);

-- Site admins can view invoice line items for invoices in their cities
CREATE POLICY "Site admins can view city invoice_line_items"
ON public.invoice_line_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM invoices
    WHERE invoices.id = invoice_line_items.invoice_id
      AND invoices.city IS NOT NULL
      AND has_city_access(auth.uid(), invoices.city)
      AND has_role(auth.uid(), 'site_admin'::app_role)
  )
);
