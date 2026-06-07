-- The earlier column REVOKE was masked by a pre-existing table-level GRANT
-- SELECT on bays/bay_config to anon/authenticated. Drop the table-level grant
-- and re-issue an explicit column list that excludes calendar_email.

REVOKE SELECT ON public.bays FROM anon, authenticated;
REVOKE SELECT ON public.bay_config FROM anon, authenticated;

GRANT SELECT (
  id, city, name, sort_order, is_active, open_time, close_time,
  coaching_mode, coaching_hours, coaching_cancellation_refund_hours,
  currency, peak_start, peak_end, weekly_off_days,
  extended_open_time, extended_close_time, extended_hours_enabled,
  created_at, updated_at
) ON public.bays TO anon, authenticated;

GRANT SELECT (
  id, city, open_time, close_time, is_active, cancellation_fee_pct,
  created_at, updated_at
) ON public.bay_config TO anon, authenticated;

-- service_role keeps full access for edge functions
GRANT ALL ON public.bays TO service_role;
GRANT ALL ON public.bay_config TO service_role;