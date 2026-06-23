
-- 1) Schema: per-invite token + expiry
ALTER TABLE public.legacy_league_team_invites
  ADD COLUMN IF NOT EXISTS invite_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days');

CREATE UNIQUE INDEX IF NOT EXISTS legacy_league_team_invites_invite_token_uidx
  ON public.legacy_league_team_invites(invite_token);

-- Backfill any historical NULL/duplicate tokens (safety; default covers new rows)
UPDATE public.legacy_league_team_invites SET invite_token = gen_random_uuid() WHERE invite_token IS NULL;

-- 2) Per-invite claim RPC: bulletproof email + capacity + idempotent
CREATE OR REPLACE FUNCTION public.claim_legacy_league_invite_by_token(
  _user_id uuid, _invite_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_reg RECORD;
  v_count integer;
  v_user_email text;
BEGIN
  IF _user_id IS NULL OR _invite_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_args');
  END IF;

  SELECT * INTO v_inv FROM public.legacy_league_team_invites WHERE invite_token = _invite_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_invite');
  END IF;

  IF v_inv.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_revoked');
  END IF;

  IF v_inv.expires_at < now() AND v_inv.status <> 'joined' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_expired');
  END IF;

  SELECT lower(email) INTO v_user_email FROM auth.users WHERE id = _user_id;
  IF v_user_email IS NULL OR lower(v_inv.email) <> v_user_email THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch',
      'invited_email', v_inv.email);
  END IF;

  SELECT * INTO v_reg FROM public.legacy_league_team_registrations WHERE id = v_inv.team_registration_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_found');
  END IF;
  IF v_reg.payment_status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_paid');
  END IF;

  -- Idempotent: already on this team → succeed
  IF EXISTS (SELECT 1 FROM public.legacy_league_team_members
             WHERE team_registration_id = v_reg.id AND user_id = _user_id) THEN
    PERFORM public.promote_legacy_team_member(v_reg.id, _user_id);
    UPDATE public.legacy_league_team_invites
       SET status = 'joined', claimed_user_id = _user_id, claimed_at = COALESCE(claimed_at, now())
     WHERE id = v_inv.id AND status <> 'joined';
    RETURN jsonb_build_object('ok', true, 'already_member', true,
      'league_id', v_reg.league_id, 'team_registration_id', v_reg.id, 'team_name', v_reg.team_name);
  END IF;

  -- On a different team in the same league → block
  IF EXISTS (SELECT 1 FROM public.legacy_league_team_members
             WHERE league_id = v_reg.league_id AND user_id = _user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_on_other_team');
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.legacy_league_team_members WHERE team_registration_id = v_reg.id;
  IF v_count >= v_reg.team_size THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_full');
  END IF;

  BEGIN
    INSERT INTO public.legacy_league_team_members
      (team_registration_id, league_id, user_id, role, joined_via)
    VALUES (v_reg.id, v_reg.league_id, _user_id, 'member', 'invite');
  EXCEPTION WHEN unique_violation THEN
    -- concurrent claim; treat as success
    NULL;
  END;

  PERFORM public.promote_legacy_team_member(v_reg.id, _user_id);

  UPDATE public.legacy_league_team_invites
     SET status = 'joined', claimed_user_id = _user_id, claimed_at = now()
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true,
    'league_id', v_reg.league_id, 'team_registration_id', v_reg.id, 'team_name', v_reg.team_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_legacy_league_invite_by_token(uuid, uuid) TO authenticated, service_role;

-- 3) Harden the existing share-token claim: require email-match for NEW members
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
  v_has_invite boolean;
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

  -- Already on the team → idempotent success (captain re-clicks own link)
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

  -- Require this user to have a pending invite matching their email
  SELECT EXISTS (
    SELECT 1 FROM public.legacy_league_team_invites
     WHERE team_registration_id = v_reg.id
       AND status IN ('pending','joined')
       AND v_user_email IS NOT NULL
       AND lower(email) = v_user_email
  ) INTO v_has_invite;
  IF NOT v_has_invite THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_invited');
  END IF;

  IF EXISTS (SELECT 1 FROM public.legacy_league_team_members
             WHERE league_id = v_reg.league_id AND user_id = _user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_on_other_team');
  END IF;

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

-- 4) Admin/captain helpers for the admin Teams panel
CREATE OR REPLACE FUNCTION public.admin_list_legacy_team_invites(_caller uuid, _league_id uuid)
RETURNS TABLE (
  id uuid, team_registration_id uuid, email text, status text,
  invited_at timestamptz, claimed_at timestamptz, expires_at timestamptz,
  invite_token uuid, team_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_site_admin(_caller) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT i.id, i.team_registration_id, i.email, i.status,
           i.created_at, i.claimed_at, i.expires_at, i.invite_token, r.team_name
      FROM public.legacy_league_team_invites i
      JOIN public.legacy_league_team_registrations r ON r.id = i.team_registration_id
     WHERE i.league_id = _league_id
     ORDER BY i.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_legacy_team_invites(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_revoke_legacy_invite(_caller uuid, _invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
BEGIN
  SELECT * INTO v_inv FROM public.legacy_league_team_invites WHERE id = _invite_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_inv.status = 'joined' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_joined');
  END IF;
  IF NOT public.is_admin_or_site_admin(_caller) AND v_inv.invited_by <> _caller THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.legacy_league_team_invites SET status = 'revoked' WHERE id = _invite_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_legacy_invite(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_rotate_legacy_invite(_caller uuid, _invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_new uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_inv FROM public.legacy_league_team_invites WHERE id = _invite_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF NOT public.is_admin_or_site_admin(_caller) AND v_inv.invited_by <> _caller THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.legacy_league_team_invites
     SET invite_token = v_new,
         expires_at = now() + interval '30 days',
         status = CASE WHEN status = 'revoked' THEN 'pending' ELSE status END
   WHERE id = _invite_id;
  RETURN jsonb_build_object('ok', true, 'invite_token', v_new);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rotate_legacy_invite(uuid, uuid) TO authenticated, service_role;
