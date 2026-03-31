
-- Create a dedicated invoice_settings table with per-city support
CREATE TABLE public.invoice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text UNIQUE DEFAULT NULL,
  template text NOT NULL DEFAULT 'classic',
  logo_url text NOT NULL DEFAULT '',
  footer_note text NOT NULL DEFAULT '',
  terms text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- null city = global default
-- non-null city = per-city override

ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invoice_settings"
  ON public.invoice_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Site admins can manage own city invoice_settings"
  ON public.invoice_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'site_admin') AND city IS NOT NULL AND public.has_city_access(auth.uid(), city))
  WITH CHECK (public.has_role(auth.uid(), 'site_admin') AND city IS NOT NULL AND public.has_city_access(auth.uid(), city));

CREATE POLICY "Invoice settings readable by all admins"
  ON public.invoice_settings FOR SELECT TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()));

-- Seed global default from existing admin_config values
INSERT INTO public.invoice_settings (city, template, logo_url, footer_note, terms)
VALUES (
  NULL,
  COALESCE((SELECT value FROM public.admin_config WHERE key = 'invoice_template'), 'classic'),
  COALESCE((SELECT value FROM public.admin_config WHERE key = 'invoice_logo_url'), ''),
  COALESCE((SELECT value FROM public.admin_config WHERE key = 'invoice_footer_note'), ''),
  COALESCE((SELECT value FROM public.admin_config WHERE key = 'invoice_terms'), '')
);

-- Clean up old admin_config keys
DELETE FROM public.admin_config WHERE key IN ('invoice_template', 'invoice_logo_url', 'invoice_footer_note', 'invoice_terms');
