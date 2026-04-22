-- ── league_cities ────────────────────────────────────────────
CREATE TABLE public.league_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, name)
);

CREATE INDEX idx_league_cities_league ON public.league_cities(league_id);
CREATE INDEX idx_league_cities_tenant ON public.league_cities(tenant_id);

ALTER TABLE public.league_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view league cities"
  ON public.league_cities FOR SELECT
  USING (
    public.is_franchise_or_site_admin(auth.uid(), tenant_id)
    OR public.has_league_role_for_league(auth.uid(), league_id, 'league_admin')
    OR EXISTS (
      SELECT 1 FROM public.league_players
      WHERE league_id = league_cities.league_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "manage league cities"
  ON public.league_cities FOR ALL
  USING (public.is_franchise_or_site_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_franchise_or_site_admin(auth.uid(), tenant_id));

CREATE TRIGGER trg_league_cities_updated_at
  BEFORE UPDATE ON public.league_cities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── league_locations ─────────────────────────────────────────
CREATE TABLE public.league_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_city_id uuid NOT NULL REFERENCES public.league_cities(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_city_id, name)
);

CREATE INDEX idx_league_locations_city ON public.league_locations(league_city_id);
CREATE INDEX idx_league_locations_league ON public.league_locations(league_id);
CREATE INDEX idx_league_locations_tenant ON public.league_locations(tenant_id);

ALTER TABLE public.league_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view league locations"
  ON public.league_locations FOR SELECT
  USING (
    public.is_franchise_or_site_admin(auth.uid(), tenant_id)
    OR public.has_league_role_for_league(auth.uid(), league_id, 'league_admin')
    OR EXISTS (
      SELECT 1 FROM public.league_players
      WHERE league_id = league_locations.league_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "manage league locations"
  ON public.league_locations FOR ALL
  USING (public.is_franchise_or_site_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_franchise_or_site_admin(auth.uid(), tenant_id));

CREATE TRIGGER trg_league_locations_updated_at
  BEFORE UPDATE ON public.league_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── league_bay_mappings ──────────────────────────────────────
CREATE TABLE public.league_bay_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_location_id uuid NOT NULL REFERENCES public.league_locations(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bay_id uuid NOT NULL REFERENCES public.bays(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A bay can only be mapped to one location per league
  UNIQUE (league_id, bay_id)
);

CREATE INDEX idx_league_bay_mappings_location ON public.league_bay_mappings(league_location_id);
CREATE INDEX idx_league_bay_mappings_league ON public.league_bay_mappings(league_id);
CREATE INDEX idx_league_bay_mappings_tenant ON public.league_bay_mappings(tenant_id);
CREATE INDEX idx_league_bay_mappings_bay ON public.league_bay_mappings(bay_id);

ALTER TABLE public.league_bay_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view league bay mappings"
  ON public.league_bay_mappings FOR SELECT
  USING (
    public.is_franchise_or_site_admin(auth.uid(), tenant_id)
    OR public.has_league_role_for_league(auth.uid(), league_id, 'league_admin')
    OR EXISTS (
      SELECT 1 FROM public.league_players
      WHERE league_id = league_bay_mappings.league_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "manage league bay mappings"
  ON public.league_bay_mappings FOR ALL
  USING (public.is_franchise_or_site_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_franchise_or_site_admin(auth.uid(), tenant_id));

-- ── Player/team assignment columns ───────────────────────────
ALTER TABLE public.league_players
  ADD COLUMN league_city_id uuid REFERENCES public.league_cities(id) ON DELETE SET NULL,
  ADD COLUMN league_location_id uuid REFERENCES public.league_locations(id) ON DELETE SET NULL;

CREATE INDEX idx_league_players_city ON public.league_players(league_city_id);
CREATE INDEX idx_league_players_location ON public.league_players(league_location_id);

ALTER TABLE public.league_teams
  ADD COLUMN league_city_id uuid REFERENCES public.league_cities(id) ON DELETE SET NULL,
  ADD COLUMN league_location_id uuid REFERENCES public.league_locations(id) ON DELETE SET NULL;

CREATE INDEX idx_league_teams_city ON public.league_teams(league_city_id);
CREATE INDEX idx_league_teams_location ON public.league_teams(league_location_id);

-- ── Leaderboard visibility ───────────────────────────────────
ALTER TABLE public.leagues
  ADD COLUMN leaderboard_visibility text NOT NULL DEFAULT 'public'
  CHECK (leaderboard_visibility IN ('public', 'admin_only'));
