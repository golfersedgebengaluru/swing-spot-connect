-- Signed-out visitors could still call the sale recorder because Postgres grants
-- EXECUTE to PUBLIC by default, which an anon-only REVOKE does not remove.
REVOKE ALL ON FUNCTION public.record_revenue(
  text, text, numeric, text, text, text, uuid, uuid, uuid, uuid, text, date, text, text, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_revenue(
  text, text, numeric, text, text, text, uuid, uuid, uuid, uuid, text, date, text, text, jsonb
) TO authenticated, service_role;