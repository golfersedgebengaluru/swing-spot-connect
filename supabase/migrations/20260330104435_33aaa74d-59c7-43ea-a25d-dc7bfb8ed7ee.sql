
-- Add new columns to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS unit_of_measure text NOT NULL DEFAULT 'Each',
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_stock integer,
  ADD COLUMN IF NOT EXISTS reorder_level integer,
  ADD COLUMN IF NOT EXISTS reorder_quantity integer,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS bookable boolean NOT NULL DEFAULT false;

-- Create product_categories table
CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- RLS: viewable by everyone, manageable by admins
CREATE POLICY "Product categories viewable by everyone" ON public.product_categories
  FOR SELECT TO public USING (true);

CREATE POLICY "Admins can insert product_categories" ON public.product_categories
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update product_categories" ON public.product_categories
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete product_categories" ON public.product_categories
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Seed default categories
INSERT INTO public.product_categories (name, sort_order) VALUES
  ('Food & Beverage', 1),
  ('Equipment', 2),
  ('Apparel', 3),
  ('Bay Usage', 4),
  ('Coaching', 5),
  ('Other', 6)
ON CONFLICT (name) DO NOTHING;
