SELECT cron.unschedule('reconcile-pending-payments-every-5-min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='reconcile-pending-payments-every-5-min');
SELECT cron.schedule(
  'reconcile-pending-payments-every-5-min',
  '*/5 * * * *',
  $$ select net.http_post(
    url:='https://epcuyrjsrbrybznqcfvl.supabase.co/functions/v1/reconcile-pending-payments',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwY3V5cmpzcmJyeWJ6bnFjZnZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NjAwMzksImV4cCI6MjA4ODUzNjAzOX0.S5B5Yihl4PdJVqA-_0Lrj30BtA_k21aoh7s-SlsM4Fw"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id; $$
);