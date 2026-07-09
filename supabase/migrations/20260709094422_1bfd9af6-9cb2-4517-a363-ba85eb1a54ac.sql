
-- 1) legacy_league_team_members: allow admin-added members without a user account
ALTER TABLE public.legacy_league_team_members
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS added_by_admin_user_id uuid,
  ADD COLUMN IF NOT EXISTS league_player_id uuid;

-- Expand joined_via CHECK to include admin_add
ALTER TABLE public.legacy_league_team_members
  DROP CONSTRAINT IF EXISTS legacy_league_team_members_joined_via_check;
ALTER TABLE public.legacy_league_team_members
  ADD CONSTRAINT legacy_league_team_members_joined_via_check
  CHECK (joined_via = ANY (ARRAY['captain'::text, 'invite'::text, 'token'::text, 'admin_add'::text]));

-- Case-insensitive email lookup
CREATE INDEX IF NOT EXISTS legacy_league_team_members_email_lower_idx
  ON public.legacy_league_team_members ((lower(email)))
  WHERE email IS NOT NULL AND user_id IS NULL;

-- 2) legacy_league_team_registrations: flag admin-created teams
ALTER TABLE public.legacy_league_team_registrations
  ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_admin_user_id uuid;

-- 3) league_players: allow admin-added shadow players (no auth user yet)
ALTER TABLE public.league_players
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text;

CREATE INDEX IF NOT EXISTS league_players_email_lower_idx
  ON public.league_players ((lower(email)))
  WHERE email IS NOT NULL AND user_id IS NULL;

-- ============================================================
-- 4) Helper: promote a managed (possibly userless) member into league_players / league_team_members
-- ============================================================
CREATE OR REPLACE FUNCTION public.promote_managed_team_member(_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_reg RECORD;
  v_tenant_id uuid;
  v_team_id uuid;
  v_player_id uuid;
BEGIN
  SELECT * INTO v_member FROM public.legacy_league_team_members WHERE id = _member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_not_found');
  END IF;

  SELECT * INTO v_reg FROM public.legacy_league_team_registrations WHERE id = v_member.team_registration_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'registration_not_found');
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.leagues WHERE id = v_reg.league_id;

  v_team_id := v_reg.league_team_id;
  IF v_team_id IS NULL THEN
    INSERT INTO public.league_teams (league_id, tenant_id, name, max_roster_size, created_by, league_city_id, league_location_id)
    VALUES (v_reg.league_id, v_tenant_id, v_reg.team_name, GREATEST(v_reg.team_size, 1), v_reg.captain_user_id, v_reg.league_city_id, v_reg.league_location_id)
    RETURNING id INTO v_team_id;
    UPDATE public.legacy_league_team_registrations SET league_team_id = v_team_id WHERE id = v_reg.id;
  END IF;

  -- If member has a linked user, prefer that path
  IF v_member.user_id IS NOT NULL THEN
    SELECT id INTO v_player_id FROM public.league_players
      WHERE league_id = v_reg.league_id AND user_id = v_member.user_id LIMIT 1;
    IF v_player_id IS NULL THEN
      INSERT INTO public.league_players (league_id, user_id, team_id, league_city_id, league_location_id, display_name, email, phone)
      VALUES (v_reg.league_id, v_member.user_id, v_team_id, v_reg.league_city_id, v_reg.league_location_id,
              v_member.display_name, v_member.email, v_member.phone)
      RETURNING id INTO v_player_id;
    ELSE
      UPDATE public.league_players
        SET team_id = COALESCE(team_id, v_team_id),
            league_city_id = COALESCE(league_city_id, v_reg.league_city_id),
            league_location_id = COALESCE(league_location_id, v_reg.league_location_id)
        WHERE id = v_player_id;
    END IF;
    INSERT INTO public.league_roles (user_id, tenant_id, league_id, role)
      VALUES (v_member.user_id, v_tenant_id, v_reg.league_id, 'player')
      ON CONFLICT (user_id, tenant_id, league_id, role) DO NOTHING;
  ELSE
    -- Admin-added shadow player: reuse existing league_player_id if any
    v_player_id := v_member.league_player_id;
    IF v_player_id IS NULL THEN
      INSERT INTO public.league_players (league_id, user_id, team_id, league_city_id, league_location_id, display_name, email, phone)
      VALUES (v_reg.league_id, NULL, v_team_id, v_reg.league_city_id, v_reg.league_location_id,
              v_member.display_name, v_member.email, v_member.phone)
      RETURNING id INTO v_player_id;
    ELSE
      UPDATE public.league_players
        SET team_id = v_team_id,
            display_name = v_member.display_name,
            email = v_member.email,
            phone = v_member.phone
        WHERE id = v_player_id;
    END IF;
  END IF;

  UPDATE public.legacy_league_team_members SET league_player_id = v_player_id WHERE id = v_member.id;

  INSERT INTO public.league_team_members (team_id, player_id, assigned_by)
    VALUES (v_team_id, v_player_id, COALESCE(v_reg.created_by_admin_user_id, v_reg.captain_user_id))
    ON CONFLICT (team_id, player_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'team_id', v_team_id, 'player_id', v_player_id);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_managed_team_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.promote_managed_team_member(uuid) TO authenticated, service_role;

-- ============================================================
-- 5) Admin: create a fully-managed team
--    _members = jsonb array [{ name, email, phone, is_captain }]
-- ============================================================
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

  -- Find captain row (first is_captain=true, else first row)
  v_captain_idx := -1;
  FOR i IN 0 .. v_size - 1 LOOP
    IF COALESCE((_members->i->>'is_captain')::boolean, false) THEN
      v_captain_idx := i; EXIT;
    END IF;
  END LOOP;
  IF v_captain_idx = -1 THEN v_captain_idx := 0; END IF;
  v_captain := _members->v_captain_idx;

  -- Create registration (assumed paid; payment handled offline in Invoices tab)
  INSERT INTO public.legacy_league_team_registrations
    (league_id, league_city_id, league_location_id, captain_user_id, team_name, team_size,
     total_amount, original_amount, currency, payment_status,
     created_by_admin, created_by_admin_user_id)
  VALUES
    (_league_id, _league_city_id, _league_location_id,
     _caller, -- placeholder captain_user_id; managed teams don't have a real captain login required
     _team_name, v_size, v_price, v_price, v_currency, 'paid',
     true, _caller)
  RETURNING id INTO v_reg_id;

  -- Insert member rows
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
       NULLIF(trim(v_member->>'phone'), ''))
    RETURNING id INTO v_member_id;

    PERFORM public.promote_managed_team_member(v_member_id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'registration_id', v_reg_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_managed_team(uuid, uuid, uuid, uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_managed_team(uuid, uuid, uuid, uuid, text, jsonb) TO authenticated, service_role;

-- ============================================================
-- 6) Admin: add a single member to any existing team (managed or captain-created)
--    Enforces team_size cap.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_add_managed_member(
  _caller uuid,
  _registration_id uuid,
  _name text,
  _email text,
  _phone text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg RECORD;
  v_count int;
  v_member_id uuid;
  v_email text := NULLIF(lower(trim(_email)), '');
  v_matched_user uuid;
BEGIN
  IF NOT public.is_admin_or_site_admin(_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_reg FROM public.legacy_league_team_registrations WHERE id = _registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'registration_not_found'); END IF;

  SELECT count(*) INTO v_count FROM public.legacy_league_team_members WHERE team_registration_id = _registration_id;
  IF v_count >= v_reg.team_size THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_full');
  END IF;

  -- If an existing profile matches this email, link the user directly.
  IF v_email IS NOT NULL THEN
    SELECT user_id INTO v_matched_user FROM public.profiles WHERE lower(email) = v_email LIMIT 1;
  END IF;

  INSERT INTO public.legacy_league_team_members
    (team_registration_id, league_id, user_id, role, joined_via,
     display_name, email, phone, added_by_admin_user_id)
  VALUES
    (_registration_id, v_reg.league_id, v_matched_user, 'member', 'admin_add',
     NULLIF(trim(_name), ''), v_email, NULLIF(trim(_phone), ''), _caller)
  RETURNING id INTO v_member_id;

  -- If there was a pending invite for this email, mark it joined.
  IF v_email IS NOT NULL THEN
    UPDATE public.legacy_league_team_invites
      SET status = 'joined', claimed_user_id = v_matched_user, claimed_at = now()
      WHERE team_registration_id = _registration_id
        AND lower(email) = v_email
        AND status = 'pending';
  END IF;

  PERFORM public.promote_managed_team_member(v_member_id);

  RETURN jsonb_build_object('ok', true, 'member_id', v_member_id, 'linked_user', v_matched_user);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_managed_member(uuid, uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_add_managed_member(uuid, uuid, text, text, text) TO authenticated, service_role;

-- ============================================================
-- 7) Admin: update a member (only admin-added / unlinked rows allowed)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_managed_member(
  _caller uuid,
  _member_id uuid,
  _name text,
  _email text,
  _phone text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_email text := NULLIF(lower(trim(_email)), '');
BEGIN
  IF NOT public.is_admin_or_site_admin(_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_member FROM public.legacy_league_team_members WHERE id = _member_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'member_not_found'); END IF;

  UPDATE public.legacy_league_team_members
    SET display_name = NULLIF(trim(_name), ''),
        email = v_email,
        phone = NULLIF(trim(_phone), '')
    WHERE id = _member_id;

  IF v_member.league_player_id IS NOT NULL AND v_member.user_id IS NULL THEN
    UPDATE public.league_players
      SET display_name = NULLIF(trim(_name), ''),
          email = v_email,
          phone = NULLIF(trim(_phone), '')
      WHERE id = v_member.league_player_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_managed_member(uuid, uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update_managed_member(uuid, uuid, text, text, text) TO authenticated, service_role;

-- ============================================================
-- 8) Admin: delete a member
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_managed_member(
  _caller uuid,
  _member_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
BEGIN
  IF NOT public.is_admin_or_site_admin(_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_member FROM public.legacy_league_team_members WHERE id = _member_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'member_not_found'); END IF;
  IF v_member.role = 'captain' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_captain');
  END IF;

  -- Remove from league_team_members (shadow player row can stay if it was ever scored;
  -- but if it's an admin-added shadow with no user, drop the league_players row too).
  IF v_member.league_player_id IS NOT NULL THEN
    DELETE FROM public.league_team_members WHERE player_id = v_member.league_player_id;
    IF v_member.user_id IS NULL THEN
      DELETE FROM public.league_players WHERE id = v_member.league_player_id;
    END IF;
  END IF;

  DELETE FROM public.legacy_league_team_members WHERE id = _member_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_managed_member(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_managed_member(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- 9) Auto-link on login: user just logged in, attach any admin-added rows matching their email
-- ============================================================
CREATE OR REPLACE FUNCTION public.link_managed_member_on_login(_user_id uuid, _email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(_email));
  v_row RECORD;
  v_linked int := 0;
BEGIN
  IF v_email IS NULL OR v_email = '' OR _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'linked', 0);
  END IF;

  FOR v_row IN
    SELECT * FROM public.legacy_league_team_members
     WHERE user_id IS NULL AND lower(email) = v_email
  LOOP
    -- Skip if this user is already a member of the same team (avoid unique conflict)
    IF EXISTS (
      SELECT 1 FROM public.legacy_league_team_members
       WHERE team_registration_id = v_row.team_registration_id AND user_id = _user_id
    ) THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.legacy_league_team_members
       WHERE league_id = v_row.league_id AND user_id = _user_id
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.legacy_league_team_members
      SET user_id = _user_id
      WHERE id = v_row.id;

    -- Attach league_players row (if any) to this user
    IF v_row.league_player_id IS NOT NULL THEN
      -- Avoid conflict with an existing (league_id, user_id) row
      IF NOT EXISTS (
        SELECT 1 FROM public.league_players
         WHERE league_id = v_row.league_id AND user_id = _user_id
      ) THEN
        UPDATE public.league_players
          SET user_id = _user_id
          WHERE id = v_row.league_player_id;
      END IF;
    END IF;

    PERFORM public.promote_managed_team_member(v_row.id);
    v_linked := v_linked + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'linked', v_linked);
END;
$$;

REVOKE ALL ON FUNCTION public.link_managed_member_on_login(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.link_managed_member_on_login(uuid, text) TO authenticated, service_role;
