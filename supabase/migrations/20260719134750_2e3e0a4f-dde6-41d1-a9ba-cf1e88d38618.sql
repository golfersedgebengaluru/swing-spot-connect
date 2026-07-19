CREATE TABLE public.bay_hours_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bay_id uuid NOT NULL REFERENCES public.bays(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time time,
  close_time time,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (bay_id, day_of_week)
);

GRANT SELECT ON public.bay_hours_overrides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bay_hours_overrides TO authenticated;
GRANT ALL ON public.bay_hours_overrides TO service_role;

ALTER TABLE public.bay_hours_overrides ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_bay_hours_overrides_bay ON public.bay_hours_overrides (bay_id, day_of_week);

CREATE POLICY "Bay hours overrides viewable by everyone"
  ON public.bay_hours_overrides FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage bay_hours_overrides"
  ON public.bay_hours_overrides FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins can manage city bay_hours_overrides"
  ON public.bay_hours_overrides FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'site_admin'::app_role) AND
    EXISTS (SELECT 1 FROM public.bays WHERE bays.id = bay_hours_overrides.bay_id AND has_city_access(auth.uid(), bays.city))
  )
  WITH CHECK (
    has_role(auth.uid(), 'site_admin'::app_role) AND
    EXISTS (SELECT 1 FROM public.bays WHERE bays.id = bay_hours_overrides.bay_id AND has_city_access(auth.uid(), bays.city))
  );