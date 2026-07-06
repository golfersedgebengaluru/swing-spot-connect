
-- ── league_par_sets ──────────────────────────────────────────
CREATE TABLE public.league_par_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  software text NOT NULL DEFAULT 'TGC',
  par_per_hole integer[] NOT NULL DEFAULT ARRAY[]::integer[],
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, name)
);

CREATE INDEX idx_league_par_sets_league ON public.league_par_sets(league_id);
CREATE INDEX idx_league_par_sets_tenant ON public.league_par_sets(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_par_sets TO authenticated;
GRANT ALL ON public.league_par_sets TO service_role;

ALTER TABLE public.league_par_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view league par sets"
  ON public.league_par_sets FOR SELECT
  USING (
    public.is_franchise_or_site_admin(auth.uid(), tenant_id)
    OR public.has_league_role_for_league(auth.uid(), league_id, 'league_admin')
    OR EXISTS (
      SELECT 1 FROM public.league_players
      WHERE league_id = league_par_sets.league_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "manage league par sets"
  ON public.league_par_sets FOR ALL
  USING (
    public.is_franchise_or_site_admin(auth.uid(), tenant_id)
    OR public.has_league_role_for_league(auth.uid(), league_id, 'league_admin')
  )
  WITH CHECK (
    public.is_franchise_or_site_admin(auth.uid(), tenant_id)
    OR public.has_league_role_for_league(auth.uid(), league_id, 'league_admin')
  );

CREATE TRIGGER trg_league_par_sets_updated_at
  BEFORE UPDATE ON public.league_par_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── link locations to a par set ──────────────────────────────
ALTER TABLE public.league_locations
  ADD COLUMN par_set_id uuid REFERENCES public.league_par_sets(id) ON DELETE SET NULL;

CREATE INDEX idx_league_locations_par_set ON public.league_locations(par_set_id);
