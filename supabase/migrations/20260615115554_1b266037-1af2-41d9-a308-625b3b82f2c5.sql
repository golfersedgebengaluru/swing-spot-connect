-- Restore correct get_next_invoice_number; previous migration referenced columns that don't exist.
DROP FUNCTION IF EXISTS public.get_next_invoice_number(text, uuid, text, integer);
DROP FUNCTION IF EXISTS public.get_next_invoice_number(text, uuid, text, integer, text);

CREATE OR REPLACE FUNCTION public.get_next_invoice_number(
  p_gstin text,
  p_fy_id uuid,
  p_prefix text DEFAULT 'INV',
  p_start integer DEFAULT 1,
  p_doc_type text DEFAULT 'tax_invoice'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recycled record;
  v_next integer;
  v_fy_label text;
BEGIN
  IF p_doc_type NOT IN ('tax_invoice','proforma','credit_note','debit_note','receipt') THEN
    RAISE EXCEPTION 'Invalid doc_type: %', p_doc_type;
  END IF;

  SELECT id, number, invoice_number_text INTO v_recycled
  FROM recycled_invoice_numbers
  WHERE gstin = p_gstin
    AND financial_year_id = p_fy_id
    AND prefix = p_prefix
    AND doc_type = p_doc_type
  ORDER BY number ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_recycled.id IS NOT NULL THEN
    DELETE FROM recycled_invoice_numbers WHERE id = v_recycled.id;
    RETURN v_recycled.invoice_number_text;
  END IF;

  INSERT INTO invoice_sequences (gstin, financial_year_id, prefix, last_number, doc_type)
  VALUES (p_gstin, p_fy_id, p_prefix, p_start, p_doc_type)
  ON CONFLICT (gstin, financial_year_id, doc_type)
  DO UPDATE SET last_number = invoice_sequences.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_next;

  SELECT label INTO v_fy_label FROM financial_years WHERE id = p_fy_id;

  RETURN p_prefix || '/' || COALESCE(v_fy_label, '') || '/' || LPAD(v_next::text, 4, '0');
END;
$$;