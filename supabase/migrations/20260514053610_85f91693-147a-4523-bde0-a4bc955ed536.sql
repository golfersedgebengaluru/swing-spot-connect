
CREATE POLICY "view league cities for landing leagues"
ON public.league_cities FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.leagues l
  WHERE l.id = league_cities.league_id
    AND l.status = 'active'
    AND l.show_on_landing = true
));

CREATE POLICY "view league locations for landing leagues"
ON public.league_locations FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.leagues l
  WHERE l.id = league_locations.league_id
    AND l.status = 'active'
    AND l.show_on_landing = true
));
