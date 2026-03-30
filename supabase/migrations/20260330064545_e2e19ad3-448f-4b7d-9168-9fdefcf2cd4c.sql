
-- Table to store recycled invoice numbers for reuse
CREATE TABLE public.recycled_invoice_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gstin text NOT NULL,
  financial_year_id uuid NOT NULL REFERENCES public.financial_years(id),
  prefix text NOT NULL DEFAULT 'INV',
  number integer NOT NULL,
  invoice_number_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recycled_invoice_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage recycled_invoice_numbers"
  ON public.recycled_invoice_numbers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Update get_next_invoice_number to check recycled pool first
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(
  p_gstin text, p_fy_id uuid, p_prefix text DEFAULT 'INV', p_start integer DEFAULT 1
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recycled record;
  v_next integer;
  v_fy_label text;
BEGIN
  -- Check for recycled numbers first (use the smallest available)
  SELECT id, number, invoice_number_text INTO v_recycled
  FROM recycled_invoice_numbers
  WHERE gstin = p_gstin AND financial_year_id = p_fy_id AND prefix = p_prefix
  ORDER BY number ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_recycled IS NOT NULL THEN
    DELETE FROM recycled_invoice_numbers WHERE id = v_recycled.id;
    RETURN v_recycled.invoice_number_text;
  END IF;

  -- No recycled number, increment as usual
  INSERT INTO invoice_sequences (gstin, financial_year_id, prefix, last_number)
  VALUES (p_gstin, p_fy_id, p_prefix, p_start)
  ON CONFLICT (gstin, financial_year_id)
  DO UPDATE SET last_number = invoice_sequences.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_next;

  SELECT label INTO v_fy_label FROM financial_years WHERE id = p_fy_id;

  RETURN p_prefix || '/' || COALESCE(v_fy_label, '') || '/' || LPAD(v_next::text, 4, '0');
END;
$$;
