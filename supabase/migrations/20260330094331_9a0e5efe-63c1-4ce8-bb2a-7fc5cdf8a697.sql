
-- Add city column to financial_years for per-city overrides (NULL = global)
ALTER TABLE public.financial_years ADD COLUMN IF NOT EXISTS city text DEFAULT NULL;

-- Add admin_config entry for the toggle
INSERT INTO public.admin_config (key, value)
VALUES ('allow_per_city_fy', 'false')
ON CONFLICT DO NOTHING;

-- Allow site-admins to view financial_years
CREATE POLICY "Site admins can view financial_years"
ON public.financial_years
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_site_admin(auth.uid())
);

-- Allow site-admins to insert city-specific financial years for their cities
CREATE POLICY "Site admins can insert city financial_years"
ON public.financial_years
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'site_admin') AND city IS NOT NULL AND public.has_city_access(auth.uid(), city)
);

-- Allow site-admins to update city-specific financial years for their cities
CREATE POLICY "Site admins can update city financial_years"
ON public.financial_years
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'site_admin') AND city IS NOT NULL AND public.has_city_access(auth.uid(), city)
)
WITH CHECK (
  public.has_role(auth.uid(), 'site_admin') AND city IS NOT NULL AND public.has_city_access(auth.uid(), city)
);

-- Allow site-admins to delete city-specific financial years for their cities
CREATE POLICY "Site admins can delete city financial_years"
ON public.financial_years
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'site_admin') AND city IS NOT NULL AND public.has_city_access(auth.uid(), city)
);

-- Allow site-admins to read admin_config for the toggle
-- (already has admin select policy; add site_admin read for specific keys)
CREATE POLICY "Site admins can read fy toggle config"
ON public.admin_config
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'site_admin') AND key = 'allow_per_city_fy'
);
