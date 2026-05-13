ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS allowed_team_sizes integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS show_on_landing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_per_person numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';

DROP POLICY IF EXISTS "Public can view leagues on landing" ON public.leagues;
CREATE POLICY "Public can view leagues on landing"
ON public.leagues
FOR SELECT
TO anon, authenticated
USING (show_on_landing = true AND status = 'active');