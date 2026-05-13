
REVOKE EXECUTE ON FUNCTION public.claim_legacy_league_invites(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_legacy_league_invites(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_legacy_league_team_by_token(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_legacy_league_team_by_token(uuid, uuid) TO authenticated;
