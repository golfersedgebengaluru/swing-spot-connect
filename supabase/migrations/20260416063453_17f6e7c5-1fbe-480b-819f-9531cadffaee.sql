
-- ── league_teams ─────────────────────────────────────────────
CREATE TABLE public.league_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  max_roster_size INTEGER NOT NULL DEFAULT 4,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (league_id, name)
);

ALTER TABLE public.league_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on league_teams"
  ON public.league_teams FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_league_teams_updated_at
  BEFORE UPDATE ON public.league_teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── league_team_members ──────────────────────────────────────
CREATE TABLE public.league_team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.league_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.league_players(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (team_id, player_id)
);

ALTER TABLE public.league_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on league_team_members"
  ON public.league_team_members FOR ALL
  USING (true) WITH CHECK (true);

-- ── Extend league_join_codes with team_id ────────────────────
ALTER TABLE public.league_join_codes
  ADD COLUMN team_id UUID REFERENCES public.league_teams(id) ON DELETE SET NULL;

-- ── Extend league_players with team_id ───────────────────────
ALTER TABLE public.league_players
  ADD COLUMN team_id UUID REFERENCES public.league_teams(id) ON DELETE SET NULL;

-- ── Index for fast lookups ───────────────────────────────────
CREATE INDEX idx_league_teams_league ON public.league_teams(league_id);
CREATE INDEX idx_league_team_members_team ON public.league_team_members(team_id);
CREATE INDEX idx_league_team_members_player ON public.league_team_members(player_id);
CREATE INDEX idx_league_players_team ON public.league_players(team_id);
