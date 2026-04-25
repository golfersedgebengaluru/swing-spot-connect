
-- ── league_awards ────────────────────────────────────────────
CREATE TABLE public.league_awards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  award_type TEXT NOT NULL, -- 'most_birdies' | 'best_round' | 'most_improved' | 'lowest_avg' | 'manual'
  name TEXT NOT NULL,
  winner_player_id UUID REFERENCES public.league_players(id) ON DELETE SET NULL,
  winner_team_id UUID REFERENCES public.league_teams(id) ON DELETE SET NULL,
  value NUMERIC,
  detail TEXT,
  is_manual BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_league_awards_league ON public.league_awards(league_id);
CREATE INDEX idx_league_awards_tenant ON public.league_awards(tenant_id);

ALTER TABLE public.league_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Awards viewable within tenant"
ON public.league_awards FOR SELECT
USING (
  public.is_admin_or_site_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.league_roles WHERE user_id = auth.uid() AND tenant_id = league_awards.tenant_id)
  OR EXISTS (SELECT 1 FROM public.league_players WHERE user_id = auth.uid() AND league_id = league_awards.league_id)
);

CREATE POLICY "Awards managed by league admins"
ON public.league_awards FOR ALL
USING (
  public.is_admin_or_site_admin(auth.uid())
  OR public.has_league_role(auth.uid(), league_awards.tenant_id, 'franchise_admin')
  OR public.has_league_role_for_league(auth.uid(), league_awards.league_id, 'league_admin')
)
WITH CHECK (
  public.is_admin_or_site_admin(auth.uid())
  OR public.has_league_role(auth.uid(), league_awards.tenant_id, 'franchise_admin')
  OR public.has_league_role_for_league(auth.uid(), league_awards.league_id, 'league_admin')
);

CREATE TRIGGER trg_league_awards_updated_at
BEFORE UPDATE ON public.league_awards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── league_season_snapshots ─────────────────────────────────
CREATE TABLE public.league_season_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL UNIQUE REFERENCES public.leagues(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  net_standings JSONB NOT NULL DEFAULT '[]'::jsonb,
  gross_standings JSONB NOT NULL DEFAULT '[]'::jsonb,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshots_tenant ON public.league_season_snapshots(tenant_id);

ALTER TABLE public.league_season_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Snapshots viewable within tenant"
ON public.league_season_snapshots FOR SELECT
USING (
  public.is_admin_or_site_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.league_roles WHERE user_id = auth.uid() AND tenant_id = league_season_snapshots.tenant_id)
  OR EXISTS (SELECT 1 FROM public.league_players WHERE user_id = auth.uid() AND league_id = league_season_snapshots.league_id)
);

CREATE POLICY "Snapshots managed by admins"
ON public.league_season_snapshots FOR ALL
USING (
  public.is_admin_or_site_admin(auth.uid())
  OR public.has_league_role(auth.uid(), league_season_snapshots.tenant_id, 'franchise_admin')
  OR public.has_league_role_for_league(auth.uid(), league_season_snapshots.league_id, 'league_admin')
)
WITH CHECK (
  public.is_admin_or_site_admin(auth.uid())
  OR public.has_league_role(auth.uid(), league_season_snapshots.tenant_id, 'franchise_admin')
  OR public.has_league_role_for_league(auth.uid(), league_season_snapshots.league_id, 'league_admin')
);

CREATE TRIGGER trg_snapshots_updated_at
BEFORE UPDATE ON public.league_season_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Lock scores when league completed ───────────────────────
CREATE OR REPLACE FUNCTION public.block_scores_when_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.leagues WHERE id = COALESCE(NEW.league_id, OLD.league_id);
  IF v_status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'League is completed; scores are locked';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_block_scores_completed
BEFORE INSERT OR UPDATE ON public.league_scores
FOR EACH ROW EXECUTE FUNCTION public.block_scores_when_completed();

-- ── Restrict re-opening completed leagues ───────────────────
CREATE OR REPLACE FUNCTION public.restrict_league_reopen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status = 'active' THEN
    IF NOT public.is_admin_or_site_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only a site admin can re-open a completed season';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_restrict_league_reopen
BEFORE UPDATE ON public.leagues
FOR EACH ROW EXECUTE FUNCTION public.restrict_league_reopen();

-- ── Storage bucket for recap cards (private) ────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('league-recaps', 'league-recaps', false)
ON CONFLICT (id) DO NOTHING;

-- Only backend (service role) reads/writes; signed URLs delivered via edge function.
-- No public policies created intentionally.
