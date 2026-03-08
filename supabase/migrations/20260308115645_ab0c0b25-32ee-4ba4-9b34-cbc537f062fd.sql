
-- Events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  time_start TEXT,
  time_end TEXT,
  location TEXT,
  spots_total INTEGER DEFAULT 0,
  spots_taken INTEGER DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'social',
  prize TEXT,
  price TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Products table (beverages + merchandise)
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'other',
  type TEXT NOT NULL DEFAULT 'beverage',
  image_url TEXT,
  badge TEXT,
  sizes TEXT[],
  colors TEXT[],
  in_stock BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Rewards table
CREATE TABLE public.rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  points_cost INTEGER NOT NULL DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Earn methods table
CREATE TABLE public.earn_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  method TEXT NOT NULL,
  points_label TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'star',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS policies: public read, admin write (for now all authenticated can write)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earn_methods ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Events are viewable by everyone" ON public.events FOR SELECT USING (true);
CREATE POLICY "Products are viewable by everyone" ON public.products FOR SELECT USING (true);
CREATE POLICY "Rewards are viewable by everyone" ON public.rewards FOR SELECT USING (true);
CREATE POLICY "Earn methods are viewable by everyone" ON public.earn_methods FOR SELECT USING (true);

-- Authenticated users can manage (we'll add proper admin roles later)
CREATE POLICY "Authenticated users can insert events" ON public.events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update events" ON public.events FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete events" ON public.events FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products" ON public.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete products" ON public.products FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert rewards" ON public.rewards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update rewards" ON public.rewards FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete rewards" ON public.rewards FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert earn_methods" ON public.earn_methods FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update earn_methods" ON public.earn_methods FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete earn_methods" ON public.earn_methods FOR DELETE TO authenticated USING (true);

-- Updated_at triggers
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rewards_updated_at BEFORE UPDATE ON public.rewards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
