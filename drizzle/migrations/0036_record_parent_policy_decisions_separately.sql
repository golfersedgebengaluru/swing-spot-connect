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
  ) VALUES
    (v_row.user_id, v_row.parent_email, 'tos', _approve, v_row.terms_version, v_row.parent_request_id),
    (v_row.user_id, v_row.parent_email, 'privacy', _approve, v_row.privacy_version, v_row.parent_request_id);

  RETURN true;
END;
$$;