REVOKE EXECUTE ON FUNCTION public.promote_legacy_team_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_legacy_team_member(uuid, uuid) TO service_role;