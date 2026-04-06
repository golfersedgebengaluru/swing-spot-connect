DROP POLICY "Branding config viewable by everyone" ON public.admin_config;

CREATE POLICY "Branding config viewable by everyone"
ON public.admin_config
FOR SELECT
TO anon, authenticated
USING (key IN ('studio_name', 'logo_url', 'primary_color', 'footer_text', 'landing_page_mode'));