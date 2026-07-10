CREATE OR REPLACE FUNCTION public.admin_create_managed_team(
  _caller uuid,
  _league_id uuid,
  _league_city_id uuid,
  _league_location_id uuid,
  _team_name text,
  _members jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg_id uuid;
  v_league RECORD;
  v_size int;
  v_captain_idx int;
  v_captain jsonb;
  v_member jsonb;
  v_member_id uuid;
  v_currency text;
  v_price numeric;
  i int;
BEGIN
  IF NOT public.is_admin_or_site_admin(_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF jsonb_typeof(_members) <> 'array' OR jsonb_array_length(_members) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'at_least_one_member');
  END IF;

  v_size := jsonb_array_length(_members);

  SELECT * INTO v_league FROM public.leagues WHERE id = _league_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'league_not_found'); END IF;
  IF NOT (v_league.allowed_team_sizes @> ARRAY[v_size]) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_size_not_allowed');
  END IF;

  v_currency := COALESCE(v_league.currency, 'INR');
  v_price := COALESCE(v_league.price_per_person, 0) * v_size;

  v_captain_idx := -1;
  FOR i IN 0 .. v_size - 1 LOOP
    IF COALESCE((_members->i->>'is_captain')::boolean, false) THEN
      v_captain_idx := i; EXIT;
    END IF;
  END LOOP;
  IF v_captain_idx = -1 THEN v_captain_idx := 0; END IF;
  v_captain := _members->v_captain_idx;

  INSERT INTO public.legacy_league_team_registrations
    (league_id, league_city_id, league_location_id, captain_user_id, team_name, team_size,
     total_amount, original_amount, currency, payment_status,
     created_by_admin, created_by_admin_user_id)
  VALUES
    (_league_id, _league_city_id, _league_location_id,
     _caller,
     _team_name, v_size, v_price, v_price, v_currency, 'paid',
     true, _caller)
  RETURNING id INTO v_reg_id;

  FOR i IN 0 .. v_size - 1 LOOP
    v_member := _members->i;
    INSERT INTO public.legacy_league_team_members
      (team_registration_id, league_id, user_id, role, joined_via,
       display_name, email, phone, added_by_admin_user_id)
    VALUES
      (v_reg_id, _league_id, NULL,
       CASE WHEN i = v_captain_idx THEN 'captain' ELSE 'member' END,
       'admin_add',
       NULLIF(trim(v_member->>'name'), ''),
       NULLIF(lower(trim(v_member->>'email')), ''),
       NULLIF(trim(v_member->>'phone'), ''),
       _caller)
    RETURNING id INTO v_member_id;

    PERFORM public.promote_managed_team_member(v_member_id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'registration_id', v_reg_id);
END;
$$;