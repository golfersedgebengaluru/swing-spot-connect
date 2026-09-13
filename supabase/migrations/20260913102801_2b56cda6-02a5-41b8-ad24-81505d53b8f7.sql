CREATE OR REPLACE FUNCTION public.claim_rate_limit_attempt(
  p_identifier text,
  p_action text,
  p_window_seconds integer,
  p_max_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt_count integer;
BEGIN
  IF p_identifier IS NULL OR length(p_identifier) = 0
     OR p_action IS NULL OR length(p_action) = 0
     OR p_window_seconds < 1 OR p_window_seconds > 86400
     OR p_max_attempts < 1 OR p_max_attempts > 1000 THEN
    RETURN false;
  END IF;

  -- Transaction-scoped: released automatically on commit or rollback.
  -- The lock, count, and insert all execute in this function's transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_action || ':' || p_identifier, 0));

  SELECT count(*)::integer
    INTO v_attempt_count
  FROM public.rate_limit_attempts
  WHERE identifier = p_identifier
    AND action = p_action
    AND attempted_at >= now() - make_interval(secs => p_window_seconds);

  IF v_attempt_count >= p_max_attempts THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_attempts (identifier, action)
  VALUES (p_identifier, p_action);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_rate_limit_attempt(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_rate_limit_attempt(text, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_rate_limit_attempt(text, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rate_limit_attempt(text, text, integer, integer) TO service_role;