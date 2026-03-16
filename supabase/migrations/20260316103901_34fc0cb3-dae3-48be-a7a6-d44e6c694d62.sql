
-- Add preferred_city to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_city text;

-- Bay configuration per city
CREATE TABLE public.bay_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL UNIQUE,
  calendar_email text,
  open_time text NOT NULL DEFAULT '09:00',
  close_time text NOT NULL DEFAULT '22:00',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bay_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bay config viewable by authenticated" ON public.bay_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage bay_config" ON public.bay_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Bookings table
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  city text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  calendar_event_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookings" ON public.bookings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookings" ON public.bookings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bookings" ON public.bookings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all bookings" ON public.bookings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default bay configs
INSERT INTO public.bay_config (city, calendar_email, open_time, close_time)
VALUES 
  ('Chennai', 'golfersedgechennai@gmail.com', '09:00', '22:00'),
  ('Bengaluru', 'golfersedgebengaluru@gmail.com', '09:00', '22:00');

-- Trigger for updated_at
CREATE TRIGGER update_bay_config_updated_at BEFORE UPDATE ON public.bay_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
