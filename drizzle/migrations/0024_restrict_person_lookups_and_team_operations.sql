-- Lookups about a person (role, coach, city assignment, league tenants, age,
-- consent) answer only for the signed-in person themself, staff, or trusted
-- server code. Everyone else gets "no".
CREATE OR REPLACE FUNCTION public.caller_may_inspect_other_users()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.role(), '') NOT IN ('anon', 'authenticated')
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'site_admin')
      )
$$;
REVOKE ALL ON FUNCTION public.caller_may_inspect_other_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caller_may_inspect_other_users() TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN _user_id = auth.uid() OR public.caller_may_inspect_other_users() THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.is_coach(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN _user_id = auth.uid() OR public.caller_may_inspect_other_users() THEN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'coach'
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.site_admin_has_city(_user_id uuid, _city text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR _city IS NULL THEN false
    WHEN _user_id = auth.uid() OR public.caller_may_inspect_other_users() THEN EXISTS (
      SELECT 1 FROM public.site_admin_cities WHERE user_id = _user_id AND city = _city
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT tenant_id FROM public.league_roles
  WHERE user_id = _user_id
    AND (_user_id = auth.uid() OR public.caller_may_inspect_other_users())
$$;

CREATE OR REPLACE FUNCTION public.is_minor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN _user_id = auth.uid() OR public.caller_may_inspect_other_users() THEN COALESCE((
      SELECT public.age_years(date_of_birth) < 18 FROM public.profiles WHERE user_id = _user_id LIMIT 1
    ), false)
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.needs_reconsent(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF _user_id IS NULL OR NOT (_user_id = auth.uid() OR public.caller_may_inspect_other_users()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  WITH latest AS (
    SELECT slug, MAX(published_at) AS max_pub, (ARRAY_AGG(version ORDER BY published_at DESC))[1] AS version
    FROM public.policy_versions
    WHERE slug IN ('privacy', 'terms')
    GROUP BY slug
  ),
  user_consent AS (
    SELECT consent_type, MAX(created_at) AS last_consent
    FROM public.consent_log
    WHERE user_id = _user_id AND granted = true AND consent_type IN ('privacy', 'tos')
    GROUP BY consent_type
  )
  SELECT jsonb_build_object(
    'needs_reconsent', EXISTS (
      SELECT 1 FROM latest l
      LEFT JOIN user_consent uc
        ON (l.slug = 'privacy' AND uc.consent_type = 'privacy')
        OR (l.slug = 'terms' AND uc.consent_type = 'tos')
      WHERE uc.last_consent IS NULL OR l.max_pub > uc.last_consent
    ),
    'latest_privacy_version', (SELECT version FROM latest WHERE slug = 'privacy'),
    'latest_terms_version', (SELECT version FROM latest WHERE slug = 'terms')
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Advance balances follow the advance-transaction access rules of the caller
-- (staff for their cities, members for their own account).
ALTER FUNCTION public.get_advance_balance(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_vendor_advance_balance(uuid) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.get_advance_balance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_vendor_advance_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_advance_balance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_advance_balance(uuid) TO authenticated, service_role;

-- Legacy league team operations take the acting user as a parameter, so only
-- the league service (which verifies the signed-in user first) may call them.
REVOKE ALL ON FUNCTION public.promote_managed_team_member(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_managed_member_on_login(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_legacy_league_invites(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_legacy_league_team_by_token(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_legacy_league_invite_by_token(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_legacy_team_invites(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revoke_legacy_invite(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_rotate_legacy_invite(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_managed_team(uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_add_managed_member(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_managed_member(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_managed_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_team_registration(uuid, uuid, text, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_team_registration(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_managed_team_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_managed_member_on_login(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_legacy_league_invites(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_legacy_league_team_by_token(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_legacy_league_invite_by_token(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_legacy_team_invites(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_legacy_invite(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_rotate_legacy_invite(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_managed_team(uuid, uuid, uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_managed_member(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_managed_member(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_managed_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_team_registration(uuid, uuid, text, uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_team_registration(uuid, uuid) TO service_role;

-- Members create and change bookings only through the booking service, which
-- checks payment, hours and availability. Staff policies are unchanged.
DROP POLICY IF EXISTS "Users can insert own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;

-- Reward catalogue: everyone sees rewards that are on offer; staff see all.
DROP POLICY IF EXISTS "Rewards are viewable by everyone" ON public.rewards;
CREATE POLICY "Available rewards are viewable by everyone" ON public.rewards
  FOR SELECT TO anon, authenticated
  USING (is_available = true OR public.is_admin_or_site_admin(auth.uid()));

-- Automatic gift rules are staff configuration (staff policies remain).
DROP POLICY IF EXISTS "Auto gift rules viewable by authenticated" ON public.auto_gift_rules;

-- Cookie consent: a visitor records only their own choice.
DROP POLICY IF EXISTS "Anyone can record a cookie consent" ON public.cookie_consents;
CREATE POLICY "Visitors record their own cookie consent" ON public.cookie_consents
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND necessary = true
    AND ip_address IS NULL
    AND char_length(coalesce(session_id, '')) <= 100
    AND char_length(coalesce(policy_version, '')) <= 40
    AND char_length(coalesce(user_agent, '')) <= 1000
  );