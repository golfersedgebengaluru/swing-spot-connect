REVOKE EXECUTE ON FUNCTION public.can_read_coaching_session(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_write_coaching_session(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_read_coaching_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_coaching_session(uuid) TO authenticated, service_role;