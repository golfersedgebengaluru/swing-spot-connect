CREATE OR REPLACE FUNCTION public.configure_reconcile_cron_secret(p_secret text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  job_name text;
  configured_count integer := 0;
  schedule_expression text := concat('*/', 5, ' * * * *');
  schedule_command text;
BEGIN
  IF p_secret IS NULL OR length(p_secret) < 32 THEN
    RAISE EXCEPTION 'Invalid reconciliation secret';
  END IF;

  FOREACH job_name IN ARRAY ARRAY[
    'reconcile-pending-payments-every-5-min',
    'reconcile-pending-payments-every-5min'
  ]
  LOOP
    schedule_command := format(
      $command$
      SELECT net.http_post(
        url := 'https://epcuyrjsrbrybznqcfvl.supabase.co/functions/v1/reconcile-pending-payments',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwY3V5cmpzcmJyeWJ6bnFjZnZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NjAwMzksImV4cCI6MjA4ODUzNjAzOX0.S5B5Yihl4PdJVqA-_0Lrj30BtA_k21aoh7s-SlsM4Fw',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiZXBjdXlyanNyYnJ5YnpuY2Z2bCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcyOTYwMDM5LCJleHAiOjIwODg1MzYwMzl9.S5B5Yihl4PdJVqA-_0Lrj30BtA_k21aoh7s-SlsM4Fw',
          'x-reconcile-secret', %L
        ),
        body := '{}'::jsonb
      );
      $command$,
      p_secret
    );

    PERFORM cron.unschedule(job_name) WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = job_name
    );
    PERFORM cron.schedule(job_name, schedule_expression, schedule_command);
    configured_count := configured_count + 1;
  END LOOP;

  RETURN configured_count;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_reconcile_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_reconcile_cron_secret(text) TO sandbox_exec;