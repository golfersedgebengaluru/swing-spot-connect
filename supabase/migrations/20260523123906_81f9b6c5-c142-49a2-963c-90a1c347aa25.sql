-- Re-grant SELECT on calendar_email to authenticated only.
-- Anonymous (anon) role remains revoked so calendar mailbox addresses are not exposed publicly.
GRANT SELECT (calendar_email) ON public.bays TO authenticated;
GRANT SELECT (calendar_email) ON public.bay_config TO authenticated;