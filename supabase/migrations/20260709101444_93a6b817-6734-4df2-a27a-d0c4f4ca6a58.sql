
-- Admin: update team registration details (name, city, location, size)
CREATE OR REPLACE FUNCTION public.admin_update_team_registration(
  _caller uuid,
  _registration_id uuid,
  _team_name text,
  _league_city_id uuid,
  _league_location_id uuid,
  _team_size int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg RECORD;
  v_league RECORD;
  v_current_members int;
  v_new_amount numeric;
BEGIN
  IF NOT public.is_admin_or_site_admin(_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_reg FROM public.legacy_league_team_registrations WHERE id = _registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'registration_not_found'); END IF;

  SELECT * INTO v_league FROM public.leagues WHERE id = v_reg.league_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'league_not_found'); END IF;

  IF NOT (v_league.allowed_team_sizes @> ARRAY[_team_size]) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_size_not_allowed');
  END IF;

  SELECT count(*) INTO v_current_members FROM public.legacy_league_team_members
    WHERE team_registration_id = _registration_id;
  IF _team_size < v_current_members THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_size_below_roster');
  END IF;

  -- Recompute amount only for admin-managed teams (paid teams keep original invoice amount)
  IF v_reg.created_by_admin THEN
    v_new_amount := COALESCE(v_league.price_per_person, 0) * _team_size;
    UPDATE public.legacy_league_team_registrations
      SET team_name = NULLIF(trim(_team_name), ''),
          league_city_id = _league_city_id,
          league_location_id = _league_location_id,
          team_size = _team_size,
          total_amount = v_new_amount,
          original_amount = v_new_amount
      WHERE id = _registration_id;
  ELSE
    UPDATE public.legacy_league_team_registrations
      SET team_name = NULLIF(trim(_team_name), ''),
          league_city_id = _league_city_id,
          league_location_id = _league_location_id,
          team_size = _team_size
      WHERE id = _registration_id;
  END IF;

  -- Sync city/location on the promoted league_team + league_players rows
  IF v_reg.league_team_id IS NOT NULL THEN
    UPDATE public.league_teams
      SET name = NULLIF(trim(_team_name), ''),
          league_city_id = _league_city_id,
          league_location_id = _league_location_id,
          max_roster_size = GREATEST(_team_size, 1)
      WHERE id = v_reg.league_team_id;

    UPDATE public.league_players
      SET league_city_id = _league_city_id,
          league_location_id = _league_location_id
      WHERE team_id = v_reg.league_team_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_team_registration(uuid, uuid, text, uuid, uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update_team_registration(uuid, uuid, text, uuid, uuid, int) TO authenticated, service_role;

-- Admin: delete a managed team registration (managed-only)
CREATE OR REPLACE FUNCTION public.admin_delete_team_registration(
  _caller uuid,
  _registration_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg RECORD;
  v_player_ids uuid[];
BEGIN
  IF NOT public.is_admin_or_site_admin(_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_reg FROM public.legacy_league_team_registrations WHERE id = _registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'registration_not_found'); END IF;

  IF NOT v_reg.created_by_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_managed_team');
  END IF;

  -- Collect player ids linked to member rows (only shadow/no-user rows will be dropped)
  SELECT array_agg(league_player_id) INTO v_player_ids
    FROM public.legacy_league_team_members
    WHERE team_registration_id = _registration_id AND league_player_id IS NOT NULL;

  -- Remove league_team_members for the promoted team, and league_players for shadow rows
  IF v_reg.league_team_id IS NOT NULL THEN
    DELETE FROM public.league_team_members WHERE team_id = v_reg.league_team_id;
  END IF;

  DELETE FROM public.league_players
    WHERE id = ANY(COALESCE(v_player_ids, ARRAY[]::uuid[]))
      AND user_id IS NULL;

  -- Cascade will remove legacy_league_team_members + invites tied to this registration
  DELETE FROM public.legacy_league_team_invites WHERE team_registration_id = _registration_id;
  DELETE FROM public.legacy_league_team_members WHERE team_registration_id = _registration_id;

  IF v_reg.league_team_id IS NOT NULL THEN
    DELETE FROM public.league_teams WHERE id = v_reg.league_team_id;
  END IF;

  DELETE FROM public.legacy_league_team_registrations WHERE id = _registration_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_team_registration(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_team_registration(uuid, uuid) TO authenticated, service_role;
