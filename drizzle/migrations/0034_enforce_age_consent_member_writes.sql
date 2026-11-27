CREATE OR REPLACE FUNCTION public.get_age_consent_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.member_age_consents;
  v_terms record;
  v_privacy record;
  v_staff boolean;
  v_needs_policies boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;

  v_staff := public.is_admin_or_site_admin(v_uid) OR public.has_role(v_uid, 'coach');
  SELECT * INTO v_row FROM public.member_age_consents WHERE user_id = v_uid;
  SELECT version, published_at INTO v_terms FROM public.policy_versions WHERE slug = 'terms' ORDER BY published_at DESC LIMIT 1;
  SELECT version, published_at INTO v_privacy FROM public.policy_versions WHERE slug = 'privacy' ORDER BY published_at DESC LIMIT 1;

  v_needs_policies := NOT (
    EXISTS (SELECT 1 FROM public.consent_log WHERE user_id = v_uid AND consent_type = 'tos' AND granted = true AND policy_version = v_terms.version AND created_at >= v_terms.published_at)
    AND EXISTS (SELECT 1 FROM public.consent_log WHERE user_id = v_uid AND consent_type = 'privacy' AND granted = true AND policy_version = v_privacy.version AND created_at >= v_privacy.published_at)
  );

  RETURN jsonb_build_object(
    'state', CASE WHEN v_staff THEN 'staff' WHEN v_row.user_id IS NULL THEN 'incomplete' ELSE v_row.state END,
    'needs_completion', CASE WHEN v_staff THEN false WHEN v_row.user_id IS NULL THEN true WHEN v_row.state IN ('adult', 'approved') THEN v_needs_policies ELSE true END,
    'can_use_member_features', CASE WHEN v_staff THEN true WHEN v_row.state IN ('adult', 'approved') THEN NOT v_needs_policies ELSE false END,
    'declared_adult', v_row.declared_adult,
    'parent_email', v_row.parent_email,
    'email_delivery_status', v_row.email_delivery_status,
    'parent_expires_at', v_row.parent_expires_at,
    'resend_available_at', CASE WHEN v_row.parent_last_sent_at IS NULL THEN NULL ELSE v_row.parent_last_sent_at + interval '60 seconds' END,
    'terms_version', v_terms.version,
    'privacy_version', v_privacy.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.member_age_consent_allows_writes(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN true; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id AND NOT public.caller_may_inspect_other_users() THEN
    RETURN false;
  END IF;
  IF public.is_admin_or_site_admin(_user_id) OR public.has_role(_user_id, 'coach') THEN RETURN true; END IF;

  SELECT c.state IN ('adult', 'approved')
    AND EXISTS (
      SELECT 1 FROM public.consent_log l
      JOIN public.policy_versions p ON p.version = l.policy_version AND p.slug = 'terms'
      WHERE l.user_id = c.user_id AND l.consent_type = 'tos' AND l.granted = true
        AND l.created_at >= p.published_at
        AND p.published_at = (SELECT max(published_at) FROM public.policy_versions WHERE slug = 'terms')
    )
    AND EXISTS (
      SELECT 1 FROM public.consent_log l
      JOIN public.policy_versions p ON p.version = l.policy_version AND p.slug = 'privacy'
      WHERE l.user_id = c.user_id AND l.consent_type = 'privacy' AND l.granted = true
        AND l.created_at >= p.published_at
        AND p.published_at = (SELECT max(published_at) FROM public.policy_versions WHERE slug = 'privacy')
    )
  INTO v_allowed
  FROM public.member_age_consents c WHERE c.user_id = _user_id;
  RETURN COALESCE(v_allowed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_member_age_consent_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  v_member := CASE
    WHEN TG_TABLE_NAME = 'coaching_sessions' THEN (to_jsonb(NEW)->>'student_user_id')::uuid
    ELSE (to_jsonb(NEW)->>'user_id')::uuid
  END;
  IF v_member IS DISTINCT FROM auth.uid() THEN RETURN NEW; END IF;
  IF NOT public.member_age_consent_allows_writes(v_member) THEN
    RAISE EXCEPTION 'Please complete the age and policy check in your account before continuing' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_member_age_consent_insert ON public.bookings;
CREATE TRIGGER enforce_member_age_consent_insert BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.enforce_member_age_consent_insert();
DROP TRIGGER IF EXISTS enforce_member_age_consent_insert ON public.coaching_sessions;
CREATE TRIGGER enforce_member_age_consent_insert BEFORE INSERT ON public.coaching_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_member_age_consent_insert();
DROP TRIGGER IF EXISTS enforce_member_age_consent_insert ON public.orders;
CREATE TRIGGER enforce_member_age_consent_insert BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_member_age_consent_insert();
DROP TRIGGER IF EXISTS enforce_member_age_consent_insert ON public.community_posts;
CREATE TRIGGER enforce_member_age_consent_insert BEFORE INSERT ON public.community_posts FOR EACH ROW EXECUTE FUNCTION public.enforce_member_age_consent_insert();
DROP TRIGGER IF EXISTS enforce_member_age_consent_insert ON public.league_players;
CREATE TRIGGER enforce_member_age_consent_insert BEFORE INSERT ON public.league_players FOR EACH ROW EXECUTE FUNCTION public.enforce_member_age_consent_insert();

REVOKE ALL ON FUNCTION public.enforce_member_age_consent_insert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_member_age_consent_insert() TO service_role;
