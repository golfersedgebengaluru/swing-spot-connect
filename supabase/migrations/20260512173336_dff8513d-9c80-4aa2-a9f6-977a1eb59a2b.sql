
-- League Management (Lite) — Phase 1 schema
-- Independent of the app's bays/cities/locations.

CREATE TABLE public.league_lite_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_lite_venues_name_unique UNIQUE (name)
);

CREATE TABLE public.leagues_lite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,                        -- nullable: multi-location leagues let captain name the instance later
  is_active boolean NOT NULL DEFAULT true,
  show_on_landing boolean NOT NULL DEFAULT true,
  multi_location boolean NOT NULL DEFAULT false,
  allowed_team_sizes integer[] NOT NULL DEFAULT ARRAY[2,4]::integer[],
  price_per_person numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leagues_lite_name_required_for_single_location
    CHECK (multi_location = true OR (name IS NOT NULL AND length(trim(name)) > 0)),
  CONSTRAINT leagues_lite_team_sizes_nonempty CHECK (array_length(allowed_team_sizes, 1) >= 1)
);

CREATE TABLE public.leagues_lite_venues (
  league_id uuid NOT NULL REFERENCES public.leagues_lite(id) ON DELETE CASCADE,
  venue_id  uuid NOT NULL REFERENCES public.league_lite_venues(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, venue_id)
);

CREATE INDEX idx_leagues_lite_active ON public.leagues_lite (is_active, show_on_landing);
CREATE INDEX idx_leagues_lite_venues_league ON public.leagues_lite_venues (league_id);
CREATE INDEX idx_leagues_lite_venues_venue ON public.leagues_lite_venues (venue_id);

-- updated_at triggers
CREATE TRIGGER trg_league_lite_venues_updated
BEFORE UPDATE ON public.league_lite_venues
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_leagues_lite_updated
BEFORE UPDATE ON public.leagues_lite
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.league_lite_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues_lite ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues_lite_venues ENABLE ROW LEVEL SECURITY;

-- Public can read active venues (needed for join flow + landing page)
CREATE POLICY "Active venues readable by all"
  ON public.league_lite_venues FOR SELECT
  USING (is_active = true OR public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins manage venues"
  ON public.league_lite_venues FOR ALL
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

-- Public can read active+visible leagues (Join League button); admins see all
CREATE POLICY "Active visible leagues readable by all"
  ON public.leagues_lite FOR SELECT
  USING (
    (is_active = true AND show_on_landing = true)
    OR public.is_admin_or_site_admin(auth.uid())
  );

CREATE POLICY "Admins manage leagues lite"
  ON public.leagues_lite FOR ALL
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

-- Venue links: public read so captain can see allowed venues for an active league
CREATE POLICY "League venue links readable by all"
  ON public.leagues_lite_venues FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues_lite l
      WHERE l.id = leagues_lite_venues.league_id
        AND ((l.is_active = true AND l.show_on_landing = true) OR public.is_admin_or_site_admin(auth.uid()))
    )
  );

CREATE POLICY "Admins manage league venue links"
  ON public.leagues_lite_venues FOR ALL
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));
