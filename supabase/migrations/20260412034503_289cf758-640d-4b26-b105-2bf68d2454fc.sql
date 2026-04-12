
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.league_format AS ENUM (
  'stroke_play', 'match_play', 'stableford', 'scramble', 'best_ball', 'skins'
);

CREATE TYPE public.league_status AS ENUM (
  'draft', 'active', 'completed', 'archived'
);

CREATE TYPE public.score_entry_method AS ENUM (
  'photo_ocr', 'manual', 'api', 'not_set'
);

CREATE TYPE public.league_role_type AS ENUM (
  'franchise_admin', 'league_admin', 'player'
);

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL,
  sponsorship_enabled boolean NOT NULL DEFAULT false,
  default_logo_url text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- LEAGUE ROLES (decoupled from app_role)
-- ============================================================
CREATE TABLE public.league_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  league_id uuid, -- nullable: franchise_admin is tenant-wide
  role league_role_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, league_id, role)
);

ALTER TABLE public.league_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS (security definer to avoid RLS recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_league_role(
  _user_id uuid, _tenant_id uuid, _role league_role_type
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.league_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_league_role_for_league(
  _user_id uuid, _league_id uuid, _role league_role_type
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.league_roles
    WHERE user_id = _user_id
      AND league_id = _league_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_franchise_or_site_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_or_site_admin(_user_id)
     OR public.has_league_role(_user_id, _tenant_id, 'franchise_admin')
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT tenant_id FROM public.league_roles WHERE user_id = _user_id
$$;

-- ============================================================
-- LEAGUES
-- ============================================================
CREATE TABLE public.leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  format league_format NOT NULL DEFAULT 'stroke_play',
  season_start date,
  season_end date,
  venue_id text,
  status league_status NOT NULL DEFAULT 'draft',
  score_entry_method score_entry_method NOT NULL DEFAULT 'not_set',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_leagues_updated_at
  BEFORE UPDATE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- league_id FK on league_roles now
ALTER TABLE public.league_roles
  ADD CONSTRAINT league_roles_league_id_fkey
  FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE CASCADE;

-- ============================================================
-- LEAGUE BRANDING
-- ============================================================
CREATE TABLE public.league_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL UNIQUE REFERENCES public.leagues(id) ON DELETE CASCADE,
  logo_url text,
  sponsor_name text,
  sponsor_logo_url text,
  sponsor_url text,
  placement_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid_from date,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.league_branding ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_league_branding_updated_at
  BEFORE UPDATE ON public.league_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- LEAGUE JOIN CODES
-- ============================================================
CREATE TABLE public.league_join_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  expires_at timestamptz,
  revoked_at timestamptz,
  max_uses integer NOT NULL DEFAULT 100,
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.league_join_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_league_join_codes_code ON public.league_join_codes(code);

-- ============================================================
-- LEAGUE PLAYERS
-- ============================================================
CREATE TABLE public.league_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_via_code_id uuid REFERENCES public.league_join_codes(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, user_id)
);

ALTER TABLE public.league_players ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- LEAGUE SCORES
-- ============================================================
CREATE TABLE public.league_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  player_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  round_number integer NOT NULL DEFAULT 1,
  hole_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_score integer,
  method score_entry_method NOT NULL DEFAULT 'manual',
  photo_url text,
  confirmed_at timestamptz,
  submitted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.league_scores ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_league_scores_updated_at
  BEFORE UPDATE ON public.league_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- LEAGUE AUDIT LOG
-- ============================================================
CREATE TABLE public.league_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.league_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_league_audit_log_tenant ON public.league_audit_log(tenant_id);
CREATE INDEX idx_league_audit_log_league ON public.league_audit_log(league_id);

-- ============================================================
-- RLS POLICIES — TENANTS
-- ============================================================
CREATE POLICY "Site admins can manage tenants"
  ON public.tenants FOR ALL TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Franchise admins can view own tenant"
  ON public.tenants FOR SELECT TO authenticated
  USING (public.has_league_role(auth.uid(), id, 'franchise_admin'));

CREATE POLICY "Franchise admins can update own tenant"
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.has_league_role(auth.uid(), id, 'franchise_admin'))
  WITH CHECK (public.has_league_role(auth.uid(), id, 'franchise_admin'));

-- ============================================================
-- RLS POLICIES — LEAGUE ROLES
-- ============================================================
CREATE POLICY "Site admins can manage league_roles"
  ON public.league_roles FOR ALL TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Franchise admins can manage tenant league_roles"
  ON public.league_roles FOR ALL TO authenticated
  USING (public.has_league_role(auth.uid(), tenant_id, 'franchise_admin'))
  WITH CHECK (public.has_league_role(auth.uid(), tenant_id, 'franchise_admin'));

CREATE POLICY "Users can view own league_roles"
  ON public.league_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES — LEAGUES
-- ============================================================
CREATE POLICY "Site admins can manage leagues"
  ON public.leagues FOR ALL TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Franchise admins can manage tenant leagues"
  ON public.leagues FOR ALL TO authenticated
  USING (public.is_franchise_or_site_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_franchise_or_site_admin(auth.uid(), tenant_id));

CREATE POLICY "League admins can manage own leagues"
  ON public.leagues FOR ALL TO authenticated
  USING (public.has_league_role_for_league(auth.uid(), id, 'league_admin'))
  WITH CHECK (public.has_league_role_for_league(auth.uid(), id, 'league_admin'));

CREATE POLICY "Players can view joined leagues"
  ON public.leagues FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.league_players
    WHERE league_players.league_id = leagues.id
      AND league_players.user_id = auth.uid()
  ));

-- ============================================================
-- RLS POLICIES — LEAGUE BRANDING
-- ============================================================
CREATE POLICY "Site admins can manage league_branding"
  ON public.league_branding FOR ALL TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "League admins can manage own league branding"
  ON public.league_branding FOR ALL TO authenticated
  USING (public.has_league_role_for_league(auth.uid(), league_id, 'league_admin'))
  WITH CHECK (public.has_league_role_for_league(auth.uid(), league_id, 'league_admin'));

CREATE POLICY "Players can view branding if sponsorship enabled"
  ON public.league_branding FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leagues l
    JOIN public.tenants t ON t.id = l.tenant_id
    JOIN public.league_players lp ON lp.league_id = l.id
    WHERE l.id = league_branding.league_id
      AND lp.user_id = auth.uid()
      AND t.sponsorship_enabled = true
  ));

-- ============================================================
-- RLS POLICIES — LEAGUE JOIN CODES
-- ============================================================
CREATE POLICY "Site admins can manage league_join_codes"
  ON public.league_join_codes FOR ALL TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "League admins can manage join codes"
  ON public.league_join_codes FOR ALL TO authenticated
  USING (public.has_league_role_for_league(auth.uid(), league_id, 'league_admin'))
  WITH CHECK (public.has_league_role_for_league(auth.uid(), league_id, 'league_admin'));

CREATE POLICY "Franchise admins can manage tenant join codes"
  ON public.league_join_codes FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.id = league_join_codes.league_id
      AND public.is_franchise_or_site_admin(auth.uid(), l.tenant_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.id = league_join_codes.league_id
      AND public.is_franchise_or_site_admin(auth.uid(), l.tenant_id)
  ));

-- ============================================================
-- RLS POLICIES — LEAGUE PLAYERS
-- ============================================================
CREATE POLICY "Site admins can manage league_players"
  ON public.league_players FOR ALL TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "League admins can view league players"
  ON public.league_players FOR SELECT TO authenticated
  USING (public.has_league_role_for_league(auth.uid(), league_id, 'league_admin'));

CREATE POLICY "Players can view own membership"
  ON public.league_players FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can join leagues"
  ON public.league_players FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES — LEAGUE SCORES
-- ============================================================
CREATE POLICY "Site admins can manage league_scores"
  ON public.league_scores FOR ALL TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "League admins can view league scores"
  ON public.league_scores FOR SELECT TO authenticated
  USING (public.has_league_role_for_league(auth.uid(), league_id, 'league_admin'));

CREATE POLICY "Players can submit own scores"
  ON public.league_scores FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Players can update own unconfirmed scores"
  ON public.league_scores FOR UPDATE TO authenticated
  USING (auth.uid() = player_id AND confirmed_at IS NULL);

CREATE POLICY "Players can view own scores"
  ON public.league_scores FOR SELECT TO authenticated
  USING (auth.uid() = player_id);

CREATE POLICY "Players can view league scores for joined leagues"
  ON public.league_scores FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.league_players lp
    WHERE lp.league_id = league_scores.league_id
      AND lp.user_id = auth.uid()
  ));

-- ============================================================
-- RLS POLICIES — LEAGUE AUDIT LOG
-- ============================================================
CREATE POLICY "Site admins can view all audit logs"
  ON public.league_audit_log FOR SELECT TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Franchise admins can view tenant audit logs"
  ON public.league_audit_log FOR SELECT TO authenticated
  USING (public.has_league_role(auth.uid(), tenant_id, 'franchise_admin'));

CREATE POLICY "Audit log insert via service role only"
  ON public.league_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_site_admin(auth.uid())
    OR public.has_league_role(auth.uid(), tenant_id, 'franchise_admin')
    OR public.has_league_role(auth.uid(), tenant_id, 'league_admin'));

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.leagues;
ALTER PUBLICATION supabase_realtime ADD TABLE public.league_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.league_scores;

-- ============================================================
-- STORAGE — league-assets bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('league-assets', 'league-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Scoped access: files stored under tenant_id/ prefix
CREATE POLICY "League assets publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'league-assets');

CREATE POLICY "Franchise/league admins can upload league assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'league-assets'
    AND (
      public.is_admin_or_site_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.league_roles lr
        WHERE lr.user_id = auth.uid()
          AND lr.role IN ('franchise_admin', 'league_admin')
          AND lr.tenant_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "Franchise/league admins can update league assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'league-assets'
    AND (
      public.is_admin_or_site_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.league_roles lr
        WHERE lr.user_id = auth.uid()
          AND lr.role IN ('franchise_admin', 'league_admin')
          AND lr.tenant_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "Franchise/league admins can delete league assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'league-assets'
    AND (
      public.is_admin_or_site_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.league_roles lr
        WHERE lr.user_id = auth.uid()
          AND lr.role IN ('franchise_admin', 'league_admin')
          AND lr.tenant_id::text = (storage.foldername(name))[1]
      )
    )
  );
