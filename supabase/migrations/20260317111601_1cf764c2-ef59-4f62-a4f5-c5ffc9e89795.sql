
-- Create bays table (replaces bay_config for per-bay management)
CREATE TABLE public.bays (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city text NOT NULL,
  name text NOT NULL,
  calendar_email text,
  open_time text NOT NULL DEFAULT '09:00',
  close_time text NOT NULL DEFAULT '22:00',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bays ENABLE ROW LEVEL SECURITY;

-- Bays viewable by authenticated users
CREATE POLICY "Bays viewable by authenticated" ON public.bays
  FOR SELECT TO authenticated USING (true);

-- Admins can manage bays
CREATE POLICY "Admins can manage bays" ON public.bays
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add updated_at trigger
CREATE TRIGGER update_bays_updated_at
  BEFORE UPDATE ON public.bays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add bay_id to bookings (nullable initially for backward compat)
ALTER TABLE public.bookings ADD COLUMN bay_id uuid REFERENCES public.bays(id);

-- Migrate existing bay_config data into bays table (one bay per city)
INSERT INTO public.bays (city, name, calendar_email, open_time, close_time, is_active)
SELECT city, city || ' Bay #1', calendar_email, open_time, close_time, is_active
FROM public.bay_config;

-- Link existing bookings to bays by city
UPDATE public.bookings b
SET bay_id = bays.id
FROM public.bays bays
WHERE b.city = bays.city;
