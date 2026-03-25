
CREATE TABLE public.offline_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offline_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage offline_payment_methods"
  ON public.offline_payment_methods FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Offline payment methods viewable by admins"
  ON public.offline_payment_methods FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.offline_payment_methods (label, sort_order) VALUES
  ('Cash', 1),
  ('Credit/Debit Card', 2),
  ('UPI', 3),
  ('Gift Card', 4);
