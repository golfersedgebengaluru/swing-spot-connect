
-- 1. Add weekly_off_days to bays
ALTER TABLE public.bays ADD COLUMN weekly_off_days integer[] NOT NULL DEFAULT '{}'::integer[];

-- 2. Create bay_holidays table
CREATE TABLE public.bay_holidays (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bay_id uuid REFERENCES public.bays(id) ON DELETE CASCADE,
  city text NOT NULL,
  holiday_date date NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bay_holidays ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_bay_holidays_city_date ON public.bay_holidays (city, holiday_date);
CREATE INDEX idx_bay_holidays_bay_date ON public.bay_holidays (bay_id, holiday_date);

CREATE POLICY "Bay holidays viewable by everyone"
  ON public.bay_holidays FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage bay_holidays"
  ON public.bay_holidays FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins can manage city bay_holidays"
  ON public.bay_holidays FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city))
  WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

-- 3. Create bay_peak_hours table
CREATE TABLE public.bay_peak_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bay_id uuid NOT NULL REFERENCES public.bays(id) ON DELETE CASCADE,
  day_of_week integer, -- 0=Sunday..6=Saturday, NULL=default for all days
  peak_start time NOT NULL,
  peak_end time NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bay_peak_hours ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_bay_peak_hours_bay ON public.bay_peak_hours (bay_id, day_of_week);

CREATE POLICY "Bay peak hours viewable by everyone"
  ON public.bay_peak_hours FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage bay_peak_hours"
  ON public.bay_peak_hours FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins can manage city bay_peak_hours"
  ON public.bay_peak_hours FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'site_admin'::app_role) AND
    EXISTS (SELECT 1 FROM public.bays WHERE bays.id = bay_peak_hours.bay_id AND has_city_access(auth.uid(), bays.city))
  )
  WITH CHECK (
    has_role(auth.uid(), 'site_admin'::app_role) AND
    EXISTS (SELECT 1 FROM public.bays WHERE bays.id = bay_peak_hours.bay_id AND has_city_access(auth.uid(), bays.city))
  );

-- 4. Migrate existing peak_start/peak_end data into bay_peak_hours as defaults
INSERT INTO public.bay_peak_hours (bay_id, day_of_week, peak_start, peak_end, sort_order)
SELECT id, NULL, COALESCE(peak_start, '17:00'), COALESCE(peak_end, '21:00'), 0
FROM public.bays;
