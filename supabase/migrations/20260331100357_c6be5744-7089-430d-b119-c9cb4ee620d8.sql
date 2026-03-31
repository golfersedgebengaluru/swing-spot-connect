DROP POLICY IF EXISTS "Site admins can read operational config" ON public.admin_config;
CREATE POLICY "Site admins can read operational config" ON public.admin_config
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND key = ANY (ARRAY[
    'studio_name', 'logo_url', 'primary_color', 'footer_text', 'default_currency',
    'low_hours_threshold'
  ])
);