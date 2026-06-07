-- Lock down calendar_email column on bays and bay_config
-- Step 1: Revoke SELECT on calendar_email column from anon and authenticated.
-- (INSERT/UPDATE remain so admin RLS policies can still write the column.)
REVOKE SELECT (calendar_email) ON public.bays FROM anon, authenticated;
REVOKE SELECT (calendar_email) ON public.bay_config FROM anon, authenticated;

-- Step 2: Re-grant SELECT on all OTHER columns so existing public reads keep working.
-- Postgres column-level GRANT requires explicit column lists.
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

-- Step 3: Security-definer RPC so admins/site_admins can still read calendar_email
-- for the BayConfig UI. Service role keeps direct table access (bypasses RLS/grants).
CREATE OR REPLACE FUNCTION public.admin_get_bay_calendar_emails()
RETURNS TABLE(bay_id uuid, calendar_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.calendar_email
  FROM public.bays b
  WHERE
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'site_admin'::app_role)
      AND public.has_city_access(auth.uid(), b.city)
    );
$$;

REVOKE ALL ON FUNCTION public.admin_get_bay_calendar_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_bay_calendar_emails() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_bay_config_calendar_emails()
RETURNS TABLE(city text, calendar_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bc.city, bc.calendar_email
  FROM public.bay_config bc
  WHERE
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'site_admin'::app_role)
      AND public.has_city_access(auth.uid(), bc.city)
    );
$$;

REVOKE ALL ON FUNCTION public.admin_get_bay_config_calendar_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_bay_config_calendar_emails() TO authenticated;