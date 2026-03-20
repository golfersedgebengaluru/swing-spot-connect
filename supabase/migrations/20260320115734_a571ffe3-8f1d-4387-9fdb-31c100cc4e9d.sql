
-- Bay session pricing: weekday/weekend × individual/couple/group
CREATE TABLE public.bay_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  day_type text NOT NULL DEFAULT 'weekday', -- 'weekday' or 'weekend'
  session_type text NOT NULL DEFAULT 'individual', -- 'individual', 'couple', 'group'
  label text NOT NULL DEFAULT '',
  price_per_hour numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(city, day_type, session_type)
);

ALTER TABLE public.bay_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage bay_pricing" ON public.bay_pricing
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Bay pricing viewable by everyone" ON public.bay_pricing
  FOR SELECT TO public
  USING (true);

-- Hour packages: 5, 10, 25 with configurable pricing
CREATE TABLE public.hour_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hours integer NOT NULL,
  label text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hour_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage hour_packages" ON public.hour_packages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Hour packages viewable by everyone" ON public.hour_packages
  FOR SELECT TO public
  USING (true);
