
-- Expense categories
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

-- Default categories
INSERT INTO public.expense_categories (name, sort_order) VALUES
  ('Staff & Payroll', 1),
  ('Utilities', 2),
  ('Maintenance & Repairs', 3),
  ('Consumables & Supplies', 4),
  ('Marketing', 5),
  ('Misc', 6),
  ('Other', 7);

-- Vendors
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  gstin text,
  category text,
  notes text,
  city text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- Expenses
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category_id uuid REFERENCES public.expense_categories(id),
  subtotal numeric NOT NULL DEFAULT 0,
  cgst_total numeric NOT NULL DEFAULT 0,
  sgst_total numeric NOT NULL DEFAULT 0,
  igst_total numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text,
  payment_reference text,
  bill_url text,
  city text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Expense line items
CREATE TABLE public.expense_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  hsn_code text,
  sac_code text,
  gst_rate numeric NOT NULL DEFAULT 0,
  cgst_amount numeric NOT NULL DEFAULT 0,
  sgst_amount numeric NOT NULL DEFAULT 0,
  igst_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  product_id uuid REFERENCES public.products(id),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_line_items ENABLE ROW LEVEL SECURITY;

-- Storage bucket for bill images
INSERT INTO storage.buckets (id, name, public) VALUES ('expense-bills', 'expense-bills', false);

-- RLS: expense_categories
CREATE POLICY "Expense categories viewable by admins" ON public.expense_categories FOR SELECT TO authenticated USING (is_admin_or_site_admin(auth.uid()));
CREATE POLICY "Admins can manage expense_categories" ON public.expense_categories FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Site admins can insert expense_categories" ON public.expense_categories FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));
CREATE POLICY "Site admins can update expense_categories" ON public.expense_categories FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'site_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));
CREATE POLICY "Site admins can delete expense_categories" ON public.expense_categories FOR DELETE TO authenticated USING (has_role(auth.uid(), 'site_admin'::app_role));

-- RLS: vendors (city-scoped)
CREATE POLICY "Admins can manage vendors" ON public.vendors FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Site admins can view city vendors" ON public.vendors FOR SELECT TO authenticated USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));
CREATE POLICY "Site admins can insert city vendors" ON public.vendors FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));
CREATE POLICY "Site admins can update city vendors" ON public.vendors FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city)) WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));
CREATE POLICY "Site admins can delete city vendors" ON public.vendors FOR DELETE TO authenticated USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

-- RLS: expenses (city-scoped)
CREATE POLICY "Admins can manage expenses" ON public.expenses FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Site admins can view city expenses" ON public.expenses FOR SELECT TO authenticated USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));
CREATE POLICY "Site admins can insert city expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));
CREATE POLICY "Site admins can update city expenses" ON public.expenses FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city)) WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));
CREATE POLICY "Site admins can delete city expenses" ON public.expenses FOR DELETE TO authenticated USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

-- RLS: expense_line_items (via expense join)
CREATE POLICY "Admins can manage expense_line_items" ON public.expense_line_items FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Site admins can view city expense_line_items" ON public.expense_line_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'site_admin'::app_role) AND EXISTS (SELECT 1 FROM expenses WHERE expenses.id = expense_line_items.expense_id AND has_city_access(auth.uid(), expenses.city)));
CREATE POLICY "Site admins can insert city expense_line_items" ON public.expense_line_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND EXISTS (SELECT 1 FROM expenses WHERE expenses.id = expense_line_items.expense_id AND has_city_access(auth.uid(), expenses.city)));
CREATE POLICY "Site admins can update city expense_line_items" ON public.expense_line_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'site_admin'::app_role) AND EXISTS (SELECT 1 FROM expenses WHERE expenses.id = expense_line_items.expense_id AND has_city_access(auth.uid(), expenses.city))) WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND EXISTS (SELECT 1 FROM expenses WHERE expenses.id = expense_line_items.expense_id AND has_city_access(auth.uid(), expenses.city)));
CREATE POLICY "Site admins can delete city expense_line_items" ON public.expense_line_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'site_admin'::app_role) AND EXISTS (SELECT 1 FROM expenses WHERE expenses.id = expense_line_items.expense_id AND has_city_access(auth.uid(), expenses.city)));

-- Storage RLS for expense-bills bucket
CREATE POLICY "Admins can upload expense bills" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'expense-bills' AND is_admin_or_site_admin(auth.uid()));
CREATE POLICY "Admins can view expense bills" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'expense-bills' AND is_admin_or_site_admin(auth.uid()));
CREATE POLICY "Admins can delete expense bills" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'expense-bills' AND is_admin_or_site_admin(auth.uid()));
