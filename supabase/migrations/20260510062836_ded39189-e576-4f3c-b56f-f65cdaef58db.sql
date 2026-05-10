CREATE TABLE IF NOT EXISTS public.leagues_only_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leagues_only_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Self can read leagues_only flag"
  ON public.leagues_only_admins
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage leagues_only_admins"
  ON public.leagues_only_admins
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));