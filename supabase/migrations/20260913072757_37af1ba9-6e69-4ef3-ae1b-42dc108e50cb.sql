CREATE OR REPLACE FUNCTION public.configure_reconcile_cron_secret(p_secret text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF p_secret IS NULL OR length(p_secret) < 32 THEN
    RAISE EXCEPTION 'Invalid reconciliation secret';
  END IF;

  UPDATE cron.job
  SET command = regexp_replace(
    command,
    '}''::jsonb',
    ',"x-reconcile-secret":"' || replace(p_secret, '"', '\\"') || '"}''::jsonb',
    1,
    1
  )
  WHERE jobname IN (
    'reconcile-pending-payments-every-5-min',
    'reconcile-pending-payments-every-5min'
  )
  AND command NOT LIKE '%x-reconcile-secret%';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF (SELECT count(*) FROM cron.job WHERE jobname IN ('reconcile-pending-payments-every-5-min', 'reconcile-pending-payments-every-5min') AND command LIKE '%x-reconcile-secret%') <> 2 THEN
    RAISE EXCEPTION 'Expected both reconciliation schedules to carry the secret header';
  END IF;

  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_reconcile_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_reconcile_cron_secret(text) TO sandbox_exec;