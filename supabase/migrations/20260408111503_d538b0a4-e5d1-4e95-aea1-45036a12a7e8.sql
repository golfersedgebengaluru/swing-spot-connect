
-- 1. Create advance_transactions table
CREATE TABLE public.advance_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  transaction_type TEXT NOT NULL DEFAULT 'credit',
  source_type TEXT NOT NULL DEFAULT 'manual_deposit',
  source_id UUID,
  description TEXT,
  city TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- 2. Enable RLS
ALTER TABLE public.advance_transactions ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
CREATE POLICY "Admins can manage advance_transactions"
  ON public.advance_transactions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins can manage city advance_transactions"
  ON public.advance_transactions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city))
  WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Users can view own advance_transactions"
  ON public.advance_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = customer_id);

-- 4. Add credit_note_disposition column to invoices
ALTER TABLE public.invoices ADD COLUMN credit_note_disposition TEXT;

-- 5. Function to get advance balance for a customer
CREATE OR REPLACE FUNCTION public.get_advance_balance(p_customer_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN transaction_type = 'credit' THEN amount ELSE -amount END
  ), 0)
  FROM public.advance_transactions
  WHERE customer_id = p_customer_id;
$$;
