
-- Add city column to products (NULL means "all sites/global")
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS city text DEFAULT NULL;

-- Drop existing product policies that need updating
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;

-- Re-create admin policies (unchanged behavior)
CREATE POLICY "Admins can insert products" ON public.products FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update products" ON public.products FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete products" ON public.products FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Site admins can view products: global (city IS NULL) + their assigned cities
CREATE POLICY "Site admins can view products" ON public.products FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND (city IS NULL OR has_city_access(auth.uid(), city))
);

-- Site admins can insert products scoped to their cities
CREATE POLICY "Site admins can insert products" ON public.products FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND city IS NOT NULL
  AND has_city_access(auth.uid(), city)
);

-- Site admins can update products for their cities
CREATE POLICY "Site admins can update products" ON public.products FOR UPDATE TO authenticated
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

-- Site admins can delete products for their cities
CREATE POLICY "Site admins can delete products" ON public.products FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND city IS NOT NULL
  AND has_city_access(auth.uid(), city)
);
