CREATE TABLE public.units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can insert units_of_measure" ON public.units_of_measure FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update units_of_measure" ON public.units_of_measure FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete units_of_measure" ON public.units_of_measure FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Units of measure viewable by everyone" ON public.units_of_measure FOR SELECT TO public USING (true);

INSERT INTO public.units_of_measure (name, sort_order) VALUES
  ('Each', 1),
  ('Kg', 2),
  ('Litre', 3),
  ('Hour', 4),
  ('Session', 5);