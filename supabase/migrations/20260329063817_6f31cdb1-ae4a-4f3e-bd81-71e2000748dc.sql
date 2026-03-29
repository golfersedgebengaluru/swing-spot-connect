
-- Allow admins to insert into admin_config
CREATE POLICY "Admins can insert admin_config" ON admin_config 
FOR INSERT TO authenticated 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed GST profile and invoice config keys
INSERT INTO admin_config (key, value) 
SELECT k, v FROM (VALUES 
  ('gst_legal_name', ''),
  ('gst_gstin', ''),
  ('gst_address', ''),
  ('gst_state', ''),
  ('gst_state_code', ''),
  ('invoice_prefix', 'INV'),
  ('invoice_start_number', '1')
) AS t(k, v)
WHERE NOT EXISTS (SELECT 1 FROM admin_config WHERE key = t.k);

-- Add GST fields to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'product';
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sac_code text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_rate numeric NOT NULL DEFAULT 0;

-- Add service link to bay_pricing
ALTER TABLE bay_pricing ADD COLUMN IF NOT EXISTS service_product_id uuid REFERENCES products(id);

-- Invoices table
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  financial_year_id uuid REFERENCES financial_years(id),
  customer_user_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_gstin text,
  customer_state text,
  customer_state_code text,
  business_name text NOT NULL,
  business_gstin text NOT NULL,
  business_address text,
  business_state text,
  business_state_code text,
  subtotal numeric NOT NULL DEFAULT 0,
  cgst_total numeric NOT NULL DEFAULT 0,
  sgst_total numeric NOT NULL DEFAULT 0,
  igst_total numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'issued',
  invoice_type text NOT NULL DEFAULT 'invoice',
  credit_note_for uuid REFERENCES invoices(id),
  payment_method text,
  revenue_transaction_id uuid REFERENCES revenue_transactions(id),
  city text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invoices" ON invoices 
FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'admin'::app_role)) 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own invoices" ON invoices 
FOR SELECT TO authenticated 
USING (auth.uid() = customer_user_id);

-- Invoice line items
CREATE TABLE invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  item_type text NOT NULL DEFAULT 'service',
  hsn_code text,
  sac_code text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  gst_rate numeric NOT NULL DEFAULT 0,
  cgst_amount numeric NOT NULL DEFAULT 0,
  sgst_amount numeric NOT NULL DEFAULT 0,
  igst_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  product_id uuid REFERENCES products(id),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invoice_line_items" ON invoice_line_items 
FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'admin'::app_role)) 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own invoice line items" ON invoice_line_items 
FOR SELECT TO authenticated 
USING (EXISTS (
  SELECT 1 FROM invoices 
  WHERE invoices.id = invoice_line_items.invoice_id 
  AND invoices.customer_user_id = auth.uid()
));

-- Invoice sequences (per GSTIN per financial year)
CREATE TABLE invoice_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gstin text NOT NULL,
  financial_year_id uuid NOT NULL REFERENCES financial_years(id),
  prefix text NOT NULL DEFAULT 'INV',
  last_number integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(gstin, financial_year_id)
);

ALTER TABLE invoice_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invoice_sequences" ON invoice_sequences 
FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'admin'::app_role)) 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Atomic function to get next invoice number
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_gstin text, p_fy_id uuid, p_prefix text DEFAULT 'INV', p_start integer DEFAULT 1)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
  v_fy_label text;
BEGIN
  INSERT INTO invoice_sequences (gstin, financial_year_id, prefix, last_number)
  VALUES (p_gstin, p_fy_id, p_prefix, p_start)
  ON CONFLICT (gstin, financial_year_id)
  DO UPDATE SET last_number = invoice_sequences.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_next;

  SELECT label INTO v_fy_label FROM financial_years WHERE id = p_fy_id;

  RETURN p_prefix || '/' || COALESCE(v_fy_label, '') || '/' || LPAD(v_next::text, 4, '0');
END;
$$;
