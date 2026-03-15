
-- Table for storing page content (About, Contact, Privacy, Terms)
CREATE TABLE public.page_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.page_content ENABLE ROW LEVEL SECURITY;

-- Anyone can read pages
CREATE POLICY "Anyone can read page content"
ON public.page_content FOR SELECT
TO anon, authenticated
USING (true);

-- Only admins can update
CREATE POLICY "Admins can update page content"
ON public.page_content FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert
CREATE POLICY "Admins can insert page content"
ON public.page_content FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete
CREATE POLICY "Admins can delete page content"
ON public.page_content FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Seed default pages
INSERT INTO public.page_content (slug, title, content) VALUES
  ('about', 'About Us', 'Welcome to EdgeCollective by Golfer''s Edge. Tell your story here.'),
  ('contact', 'Contact Us', 'Get in touch with us. Add your contact details here.'),
  ('privacy', 'Privacy Policy', 'Add your privacy policy here.'),
  ('terms', 'Terms of Service', 'Add your terms of service here.');
