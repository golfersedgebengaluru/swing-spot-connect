CREATE POLICY "Branding config viewable by everyone"
ON public.admin_config
FOR SELECT
TO public
USING (key IN ('studio_name', 'logo_url', 'primary_color', 'footer_text'));