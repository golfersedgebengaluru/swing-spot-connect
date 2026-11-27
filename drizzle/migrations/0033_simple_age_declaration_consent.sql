CREATE TABLE public.member_age_consents (
  user_id uuid PRIMARY KEY,
  state text NOT NULL CHECK (state IN ('adult', 'parent_required', 'pending', 'approved', 'declined')),
  declared_adult boolean NOT NULL,
  terms_version text,
  privacy_version text,
  declaration_at timestamptz NOT NULL DEFAULT now(),
  parent_email text,
  parent_request_id uuid UNIQUE DEFAULT gen_random_uuid(),
  parent_token_hash text,
  parent_requested_at timestamptz,
  parent_expires_at timestamptz,
  parent_last_sent_at timestamptz,
  parent_decided_at timestamptz,
  email_delivery_status text CHECK (email_delivery_status IN ('pending', 'sent', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.member_age_consents TO service_role;
ALTER TABLE public.member_age_consents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.consent_log ADD COLUMN IF NOT EXISTS request_id uuid;

INSERT INTO public.member_age_consents (user_id, state, declared_adult, parent_email, parent_decided_at)
SELECT p.user_id, 'approved', false, p.parent_email, p.parent_consent_at
FROM public.profiles p
WHERE p.user_id IS NOT NULL AND p.parent_consent_status = 'approved'
ON CONFLICT (user_id) DO NOTHING;

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
    EXISTS (SELECT 1 FROM public.consent_log WHERE user_id = v_uid AND consent_type = 'tos' AND granted = true AND policy_version = v_terms.version)
    AND EXISTS (SELECT 1 FROM public.consent_log WHERE user_id = v_uid AND consent_type = 'privacy' AND granted = true AND policy_version = v_privacy.version)
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

CREATE OR REPLACE FUNCTION public.submit_age_declaration(
  _is_adult boolean,
  _accept_policies boolean,
  _marketing_opt_in boolean DEFAULT false,
  _user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.member_age_consents;
  v_state text;
  v_terms text;
  v_privacy text;
  v_email text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF _is_adult IS NULL OR _accept_policies IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Age declaration and policy acceptance are required';
  END IF;

  SELECT * INTO v_existing FROM public.member_age_consents WHERE user_id = v_uid FOR UPDATE;
  IF v_existing.user_id IS NOT NULL AND v_existing.declared_adult <> _is_adult THEN
    RAISE EXCEPTION 'The existing age declaration cannot be changed here';
  END IF;

  SELECT version INTO v_terms FROM public.policy_versions WHERE slug = 'terms' ORDER BY published_at DESC LIMIT 1;
  SELECT version INTO v_privacy FROM public.policy_versions WHERE slug = 'privacy' ORDER BY published_at DESC LIMIT 1;
  IF v_terms IS NULL OR v_privacy IS NULL THEN RAISE EXCEPTION 'Current policies are unavailable'; END IF;

  v_state := CASE
    WHEN _is_adult THEN 'adult'
    WHEN v_existing.state = 'approved' THEN 'approved'
    WHEN v_existing.state = 'pending' THEN 'pending'
    ELSE 'parent_required'
  END;

  INSERT INTO public.member_age_consents (
    user_id, state, declared_adult, terms_version, privacy_version, declaration_at
  ) VALUES (v_uid, v_state, _is_adult, v_terms, v_privacy, now())
  ON CONFLICT (user_id) DO UPDATE SET
    state = EXCLUDED.state,
    terms_version = EXCLUDED.terms_version,
    privacy_version = EXCLUDED.privacy_version,
    declaration_at = now(),
    updated_at = now();

  SELECT email INTO v_email FROM public.profiles WHERE user_id = v_uid;

  INSERT INTO public.consent_log (user_id, email, consent_type, granted, policy_version, user_agent)
  SELECT v_uid, v_email, 'tos', true, v_terms, _user_agent
  WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_log WHERE user_id = v_uid AND consent_type = 'tos' AND granted = true AND policy_version = v_terms
  );
  INSERT INTO public.consent_log (user_id, email, consent_type, granted, policy_version, user_agent)
  SELECT v_uid, v_email, 'privacy', true, v_privacy, _user_agent
  WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_log WHERE user_id = v_uid AND consent_type = 'privacy' AND granted = true AND policy_version = v_privacy
  );
  INSERT INTO public.consent_log (user_id, email, consent_type, granted, user_agent)
  VALUES (v_uid, v_email, 'marketing_email', CASE WHEN _is_adult THEN COALESCE(_marketing_opt_in, false) ELSE false END, _user_agent);

  IF _is_adult THEN
    UPDATE public.profiles SET parent_consent_status = 'not_required', updated_at = now() WHERE user_id = v_uid;
  END IF;

  RETURN public.get_age_consent_status();
END;
$$;

CREATE OR REPLACE FUNCTION public.create_parental_consent_request(_parent_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.member_age_consents;
  v_token text;
  v_request_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF _parent_email IS NULL OR position('@' IN btrim(_parent_email)) = 0 THEN
    RAISE EXCEPTION 'A valid parent or guardian email is required';
  END IF;

  SELECT * INTO v_row FROM public.member_age_consents WHERE user_id = v_uid FOR UPDATE;
  IF v_row.user_id IS NULL OR v_row.declared_adult OR v_row.state NOT IN ('parent_required', 'pending', 'declined') THEN
    RAISE EXCEPTION 'No parental consent request can be created for this account';
  END IF;
  IF v_row.parent_last_sent_at > now() - interval '60 seconds' THEN
    RAISE EXCEPTION 'Please wait 60 seconds before resending';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_request_id := gen_random_uuid();

  UPDATE public.member_age_consents SET
    state = 'pending',
    parent_email = lower(btrim(_parent_email)),
    parent_request_id = v_request_id,
    parent_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
    parent_requested_at = now(),
    parent_expires_at = now() + interval '48 hours',
    parent_decided_at = NULL,
    email_delivery_status = 'pending',
    updated_at = now()
  WHERE user_id = v_uid;

  UPDATE public.profiles SET
    parent_email = lower(btrim(_parent_email)),
    parent_consent_status = 'pending',
    parent_consent_token = NULL,
    parent_consent_at = NULL,
    updated_at = now()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('token', v_token, 'request_id', v_request_id, 'expires_at', now() + interval '48 hours');
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_parental_consent_email(_request_id uuid, _sent boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE public.member_age_consents SET
    email_delivery_status = CASE WHEN _sent THEN 'sent' ELSE 'failed' END,
    parent_last_sent_at = CASE WHEN _sent THEN now() ELSE parent_last_sent_at END,
    updated_at = now()
  WHERE parent_request_id = _request_id AND state = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_age_consent_request(_token text)
RETURNS TABLE(user_id uuid, display_name text, parent_email text, status text, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT p.user_id, p.display_name, c.parent_email, c.state, c.parent_expires_at
  FROM public.member_age_consents c
  JOIN public.profiles p ON p.user_id = c.user_id
  WHERE c.parent_token_hash = encode(extensions.digest(_token, 'sha256'), 'hex')
    AND c.state = 'pending'
    AND c.parent_expires_at > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.decide_age_consent_request(_token text, _approve boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.member_age_consents;
BEGIN
  SELECT * INTO v_row FROM public.member_age_consents
  WHERE parent_token_hash = encode(extensions.digest(_token, 'sha256'), 'hex')
    AND state = 'pending'
    AND parent_expires_at > now()
  FOR UPDATE;
  IF v_row.user_id IS NULL THEN RETURN false; END IF;

  UPDATE public.member_age_consents SET
    state = CASE WHEN _approve THEN 'approved' ELSE 'declined' END,
    parent_decided_at = now(),
    parent_token_hash = NULL,
    updated_at = now()
  WHERE user_id = v_row.user_id;

  UPDATE public.profiles SET
    parent_consent_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    parent_consent_at = now(),
    parent_consent_token = NULL,
    updated_at = now()
  WHERE user_id = v_row.user_id;

  INSERT INTO public.consent_log (
    user_id, email, consent_type, granted, policy_version, request_id
  ) VALUES (
    v_row.user_id, v_row.parent_email, 'parental_consent', _approve,
    jsonb_build_object('terms', v_row.terms_version, 'privacy', v_row.privacy_version)::text,
    v_row.parent_request_id
  );

  RETURN true;
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
  v_status jsonb;
BEGIN
  IF _user_id IS NULL THEN RETURN true; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id AND NOT public.caller_may_inspect_other_users() THEN
    RETURN false;
  END IF;
  IF public.is_admin_or_site_admin(_user_id) OR public.has_role(_user_id, 'coach') THEN RETURN true; END IF;

  SELECT jsonb_build_object('allowed', c.state IN ('adult', 'approved') AND
    EXISTS (SELECT 1 FROM public.consent_log l JOIN public.policy_versions p ON p.version = l.policy_version AND p.slug = 'terms' WHERE l.user_id = c.user_id AND l.consent_type = 'tos' AND l.granted = true AND p.published_at = (SELECT max(published_at) FROM public.policy_versions WHERE slug = 'terms')) AND
    EXISTS (SELECT 1 FROM public.consent_log l JOIN public.policy_versions p ON p.version = l.policy_version AND p.slug = 'privacy' WHERE l.user_id = c.user_id AND l.consent_type = 'privacy' AND l.granted = true AND p.published_at = (SELECT max(published_at) FROM public.policy_versions WHERE slug = 'privacy'))
  ) INTO v_status
  FROM public.member_age_consents c WHERE c.user_id = _user_id;
  RETURN COALESCE((v_status->>'allowed')::boolean, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_age_consent_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') AND (
    NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth OR
    NEW.parent_email IS DISTINCT FROM OLD.parent_email OR
    NEW.parent_consent_status IS DISTINCT FROM OLD.parent_consent_status OR
    NEW.parent_consent_token IS DISTINCT FROM OLD.parent_consent_token OR
    NEW.parent_consent_at IS DISTINCT FROM OLD.parent_consent_at
  ) THEN
    RAISE EXCEPTION 'Age and parental consent fields must be changed through the consent flow';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_profile_age_consent_fields ON public.profiles;
CREATE TRIGGER protect_profile_age_consent_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_age_consent_fields();

REVOKE ALL ON FUNCTION public.get_age_consent_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_age_declaration(boolean, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_parental_consent_request(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_parental_consent_email(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lookup_age_consent_request(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_age_consent_request(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.member_age_consent_allows_writes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.protect_profile_age_consent_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_age_consent_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_age_declaration(boolean, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_parental_consent_request(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_parental_consent_email(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.lookup_age_consent_request(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_age_consent_request(text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_age_consent_allows_writes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.protect_profile_age_consent_fields() TO service_role;
