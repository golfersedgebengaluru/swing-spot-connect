
CREATE TABLE public.admin_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;

-- Only admins can read/update admin_config
CREATE POLICY "Admins can select admin_config" ON public.admin_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update admin_config" ON public.admin_config
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- No public access, no insert/delete from client
-- Edge functions use service role to read/write

-- Seed with current password from env (will be done via edge function on first use)
