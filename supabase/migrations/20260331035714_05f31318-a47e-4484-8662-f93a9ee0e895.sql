
-- Storage bucket for invoice logos
INSERT INTO storage.buckets (id, name, public) VALUES ('invoice-assets', 'invoice-assets', true);

-- Allow admins to upload to invoice-assets bucket
CREATE POLICY "Admins can upload invoice assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'invoice-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update invoice assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'invoice-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete invoice assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'invoice-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Invoice assets are publicly readable"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'invoice-assets');

-- Seed invoice config keys
INSERT INTO public.admin_config (key, value) VALUES
  ('invoice_template', 'classic'),
  ('invoice_logo_url', ''),
  ('invoice_footer_note', ''),
  ('invoice_terms', '')
ON CONFLICT DO NOTHING;
