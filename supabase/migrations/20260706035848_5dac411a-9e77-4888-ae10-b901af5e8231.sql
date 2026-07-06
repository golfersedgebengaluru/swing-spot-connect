
CREATE OR REPLACE FUNCTION public.claim_legacy_league_team_by_token(_user_id uuid, _token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg RECORD;
  v_count integer;
  v_user_email text;
BEGIN
  IF _user_id IS NULL OR _token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_args');
  END IF;

  SELECT * INTO v_reg FROM public.legacy_league_team_registrations WHERE join_token = _token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;
  IF v_reg.payment_status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_paid');
  END IF;

  SELECT lower(email) INTO v_user_email FROM auth.users WHERE id = _user_id;

  -- Already on this team → idempotent success
  IF EXISTS (SELECT 1 FROM public.legacy_league_team_members
             WHERE team_registration_id = v_reg.id AND user_id = _user_id) THEN
    PERFORM public.promote_legacy_team_member(v_reg.id, _user_id);
    UPDATE public.legacy_league_team_invites
       SET status = 'joined', claimed_user_id = _user_id, claimed_at = COALESCE(claimed_at, now())
     WHERE team_registration_id = v_reg.id
       AND (claimed_user_id = _user_id OR (v_user_email IS NOT NULL AND lower(email) = v_user_email))
       AND status <> 'joined';
    RETURN jsonb_build_object('ok', true, 'already_member', true,
      'league_id', v_reg.league_id, 'team_registration_id', v_reg.id, 'team_name', v_reg.team_name);
  END IF;

  -- Block joining a second team in the same league
  IF EXISTS (SELECT 1 FROM public.legacy_league_team_members
             WHERE league_id = v_reg.league_id AND user_id = _user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_on_other_team');
  END IF;

  -- Capacity check
  SELECT COUNT(*) INTO v_count FROM public.legacy_league_team_members WHERE team_registration_id = v_reg.id;
  IF v_count >= v_reg.team_size THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_full');
  END IF;

  BEGIN
    INSERT INTO public.legacy_league_team_members
      (team_registration_id, league_id, user_id, role, joined_via)
    VALUES (v_reg.id, v_reg.league_id, _user_id, 'member', 'token');
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  PERFORM public.promote_legacy_team_member(v_reg.id, _user_id);

  -- If a matching invite existed, mark it joined (best-effort)
  UPDATE public.legacy_league_team_invites
     SET status = 'joined', claimed_user_id = _user_id, claimed_at = now()
   WHERE team_registration_id = v_reg.id
     AND status = 'pending'
     AND v_user_email IS NOT NULL
     AND lower(email) = v_user_email;

  RETURN jsonb_build_object('ok', true,
    'league_id', v_reg.league_id, 'team_registration_id', v_reg.id, 'team_name', v_reg.team_name);
END;
$$;
