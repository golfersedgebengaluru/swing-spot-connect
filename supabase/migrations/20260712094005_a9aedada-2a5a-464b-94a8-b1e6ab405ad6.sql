ALTER TABLE public.legacy_league_team_registrations
  DROP CONSTRAINT IF EXISTS legacy_league_team_unique_captain;

CREATE UNIQUE INDEX IF NOT EXISTS legacy_league_team_unique_captain
  ON public.legacy_league_team_registrations (league_id, captain_user_id)
  WHERE created_by_admin = false;