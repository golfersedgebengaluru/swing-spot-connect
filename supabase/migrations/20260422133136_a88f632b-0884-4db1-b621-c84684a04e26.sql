-- Replace permissive ALL policies with explicit per-action policies

DROP POLICY IF EXISTS "manage league cities" ON public.league_cities;
CREATE POLICY "insert league cities" ON public.league_cities FOR INSERT
  WITH CHECK (public.is_franchise_or_site_admin(auth.uid(), tenant_id));
CREATE POLICY "update league cities" ON public.league_cities FOR UPDATE
  USING (public.is_franchise_or_site_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_franchise_or_site_admin(auth.uid(), tenant_id));
CREATE POLICY "delete league cities" ON public.league_cities FOR DELETE
  USING (public.is_franchise_or_site_admin(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "manage league locations" ON public.league_locations;
CREATE POLICY "insert league locations" ON public.league_locations FOR INSERT
  WITH CHECK (public.is_franchise_or_site_admin(auth.uid(), tenant_id));
CREATE POLICY "update league locations" ON public.league_locations FOR UPDATE
  USING (public.is_franchise_or_site_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_franchise_or_site_admin(auth.uid(), tenant_id));
CREATE POLICY "delete league locations" ON public.league_locations FOR DELETE
  USING (public.is_franchise_or_site_admin(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "manage league bay mappings" ON public.league_bay_mappings;
CREATE POLICY "insert league bay mappings" ON public.league_bay_mappings FOR INSERT
  WITH CHECK (public.is_franchise_or_site_admin(auth.uid(), tenant_id));
CREATE POLICY "delete league bay mappings" ON public.league_bay_mappings FOR DELETE
  USING (public.is_franchise_or_site_admin(auth.uid(), tenant_id));
