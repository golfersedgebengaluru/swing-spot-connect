
-- League rounds table
CREATE TABLE public.league_rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(league_id, round_number)
);

ALTER TABLE public.league_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view league rounds"
  ON public.league_rounds FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage league rounds"
  ON public.league_rounds FOR ALL TO authenticated
  USING (
    public.is_admin_or_site_admin(auth.uid())
    OR public.has_league_role(auth.uid(), tenant_id, 'franchise_admin')
    OR public.has_league_role(auth.uid(), tenant_id, 'league_admin')
  );

CREATE TRIGGER update_league_rounds_updated_at
  BEFORE UPDATE ON public.league_rounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- League competitions table
CREATE TABLE public.league_competitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.league_rounds(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  points_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.league_competitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view league competitions"
  ON public.league_competitions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage league competitions"
  ON public.league_competitions FOR ALL TO authenticated
  USING (
    public.is_admin_or_site_admin(auth.uid())
    OR public.has_league_role(auth.uid(), tenant_id, 'franchise_admin')
    OR public.has_league_role(auth.uid(), tenant_id, 'league_admin')
  );

CREATE TRIGGER update_league_competitions_updated_at
  BEFORE UPDATE ON public.league_competitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_league_rounds_league ON public.league_rounds(league_id);
CREATE INDEX idx_league_competitions_round ON public.league_competitions(round_id);
CREATE INDEX idx_league_competitions_league ON public.league_competitions(league_id);
