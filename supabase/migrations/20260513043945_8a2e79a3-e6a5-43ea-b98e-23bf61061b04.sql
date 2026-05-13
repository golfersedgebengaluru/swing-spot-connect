
-- ── Paid team registrations (legacy leagues only) ────────────────────
CREATE TABLE public.legacy_league_team_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  league_city_id uuid NOT NULL REFERENCES public.league_cities(id) ON DELETE RESTRICT,
  league_location_id uuid NOT NULL REFERENCES public.league_locations(id) ON DELETE RESTRICT,
  captain_user_id uuid NOT NULL,
  team_name text NOT NULL,
  team_size integer NOT NULL,
  total_amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  payment_status text NOT NULL DEFAULT 'paid',
  razorpay_order_id text,
  razorpay_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_league_team_unique_captain UNIQUE (league_id, captain_user_id)
);

CREATE INDEX idx_llt_reg_league ON public.legacy_league_team_registrations(league_id);
CREATE INDEX idx_llt_reg_captain ON public.legacy_league_team_registrations(captain_user_id);
CREATE INDEX idx_llt_reg_city ON public.legacy_league_team_registrations(league_city_id);

ALTER TABLE public.legacy_league_team_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "captain reads own legacy team"
  ON public.legacy_league_team_registrations FOR SELECT
  TO authenticated
  USING (captain_user_id = auth.uid());

CREATE POLICY "admins manage legacy team registrations"
  ON public.legacy_league_team_registrations FOR ALL
  TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "authenticated read minimal legacy team counts"
  ON public.legacy_league_team_registrations FOR SELECT
  TO authenticated
  USING (true);

-- updated_at trigger
CREATE TRIGGER trg_llt_reg_updated_at
BEFORE UPDATE ON public.legacy_league_team_registrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Pending registrations (pre-payment) ──────────────────────────────
CREATE TABLE public.pending_legacy_league_team_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_order_id text NOT NULL UNIQUE,
  captain_user_id uuid NOT NULL,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  league_city_id uuid NOT NULL REFERENCES public.league_cities(id) ON DELETE RESTRICT,
  league_location_id uuid NOT NULL REFERENCES public.league_locations(id) ON DELETE RESTRICT,
  team_name text NOT NULL,
  team_size integer NOT NULL,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  city text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  registration_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pllt_status ON public.pending_legacy_league_team_registrations(status);
CREATE INDEX idx_pllt_captain ON public.pending_legacy_league_team_registrations(captain_user_id);

ALTER TABLE public.pending_legacy_league_team_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "captain reads own pending legacy team"
  ON public.pending_legacy_league_team_registrations FOR SELECT
  TO authenticated
  USING (captain_user_id = auth.uid());

CREATE POLICY "admins manage pending legacy team"
  ON public.pending_legacy_league_team_registrations FOR ALL
  TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

CREATE TRIGGER trg_pllt_updated_at
BEFORE UPDATE ON public.pending_legacy_league_team_registrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
