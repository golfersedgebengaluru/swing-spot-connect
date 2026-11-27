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
    SELECT 1 FROM public.consent_log
    WHERE user_id = v_uid AND consent_type = 'tos' AND granted = true AND policy_version = v_terms
      AND created_at >= (SELECT max(published_at) FROM public.policy_versions WHERE slug = 'terms')
  );
  INSERT INTO public.consent_log (user_id, email, consent_type, granted, policy_version, user_agent)
  SELECT v_uid, v_email, 'privacy', true, v_privacy, _user_agent
  WHERE NOT EXISTS (
    SELECT 1 FROM public.consent_log
    WHERE user_id = v_uid AND consent_type = 'privacy' AND granted = true AND policy_version = v_privacy
      AND created_at >= (SELECT max(published_at) FROM public.policy_versions WHERE slug = 'privacy')
  );
  INSERT INTO public.consent_log (user_id, email, consent_type, granted, user_agent)
  VALUES (v_uid, v_email, 'marketing_email', CASE WHEN _is_adult THEN COALESCE(_marketing_opt_in, false) ELSE false END, _user_agent);

  IF _is_adult THEN
    UPDATE public.profiles SET parent_consent_status = 'not_required', updated_at = now() WHERE user_id = v_uid;
  END IF;

  RETURN public.get_age_consent_status();
END;
$$;
