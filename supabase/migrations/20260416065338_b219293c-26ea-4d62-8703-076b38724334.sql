
-- Add scoring config columns to leagues
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS scoring_holes integer NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS fairness_factor_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS team_aggregation_method text NOT NULL DEFAULT 'best_ball',
  ADD COLUMN IF NOT EXISTS peoria_multiplier numeric(4,2) NOT NULL DEFAULT 3;

-- Validation trigger for scoring_holes
CREATE OR REPLACE FUNCTION public.validate_leagues_scoring()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scoring_holes NOT IN (9, 18) THEN
    RAISE EXCEPTION 'scoring_holes must be 9 or 18';
  END IF;
  IF NEW.team_aggregation_method NOT IN ('best_ball', 'average') THEN
    RAISE EXCEPTION 'team_aggregation_method must be best_ball or average';
  END IF;
  IF NEW.fairness_factor_pct < 0 OR NEW.fairness_factor_pct > 100 THEN
    RAISE EXCEPTION 'fairness_factor_pct must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_leagues_scoring
  BEFORE INSERT OR UPDATE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.validate_leagues_scoring();

-- Hidden holes table
CREATE TABLE public.league_round_hidden_holes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  hidden_holes integer[] NOT NULL,
  revealed_at timestamptz,
  selected_by uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_id, round_number)
);

ALTER TABLE public.league_round_hidden_holes ENABLE ROW LEVEL SECURITY;

-- Admins can always read/manage
CREATE POLICY "Tenant admins manage hidden holes"
  ON public.league_round_hidden_holes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.league_roles lr
      WHERE lr.tenant_id = league_round_hidden_holes.tenant_id
        AND lr.user_id = auth.uid()
        AND lr.role IN ('franchise_admin', 'league_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.league_roles lr
      WHERE lr.tenant_id = league_round_hidden_holes.tenant_id
        AND lr.user_id = auth.uid()
        AND lr.role IN ('franchise_admin', 'league_admin')
    )
  );

-- Players can only see hidden holes AFTER reveal
CREATE POLICY "Players see revealed holes only"
  ON public.league_round_hidden_holes
  FOR SELECT
  TO authenticated
  USING (
    revealed_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.league_players lp
      WHERE lp.league_id = league_round_hidden_holes.league_id
        AND lp.user_id = auth.uid()
    )
  );
