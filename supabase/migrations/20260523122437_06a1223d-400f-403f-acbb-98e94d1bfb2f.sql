
-- 1. Hide calendar_email column on bays + bay_config from non-admins
REVOKE SELECT (calendar_email) ON public.bays FROM anon, authenticated;
REVOKE SELECT (calendar_email) ON public.bay_config FROM anon, authenticated;
GRANT SELECT (calendar_email) ON public.bays TO service_role;
GRANT SELECT (calendar_email) ON public.bay_config TO service_role;

-- 2. qc_entries: drop overly permissive SELECT, scope to admins + owner (by phone match on profile)
DROP POLICY IF EXISTS "Authenticated can view qc entries" ON public.qc_entries;

CREATE POLICY "qc entries owner select"
ON public.qc_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.phone IS NOT NULL
      AND p.phone = qc_entries.phone
  )
);

-- (admin SELECT is already covered by the existing "qc entries admin all" policy with cmd=ALL)

-- 3. league_teams / league_team_members: remove TO public bypass policies, replace with proper scoping
DROP POLICY IF EXISTS "Service role full access on league_teams" ON public.league_teams;
DROP POLICY IF EXISTS "Service role full access on league_team_members" ON public.league_team_members;

CREATE POLICY "league_teams service role"
ON public.league_teams
FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "league_team_members service role"
ON public.league_team_members
FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- 4. booking-ics bucket: owner + admin SELECT only (path convention: <user_id>/<...>)
CREATE POLICY "booking-ics owner select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'booking-ics'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.is_admin_or_site_admin(auth.uid())
  )
);
