DROP FUNCTION IF EXISTS public.get_next_invoice_number(text, uuid, text, integer);
DROP FUNCTION IF EXISTS public.get_next_invoice_number(text, uuid, text, integer, text);

CREATE OR REPLACE FUNCTION public.get_next_invoice_number(
  p_gstin text,
  p_fy_id uuid,
  p_prefix text,
  p_start integer,
  p_doc_type text DEFAULT 'INV'
)
RETURNS TABLE(invoice_number text, sequence_value integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recycled_number text;
  v_recycled_seq integer;
  v_next_seq integer;
  v_formatted text;
BEGIN
  SELECT rin.invoice_number, rin.sequence_value
    INTO v_recycled_number, v_recycled_seq
  FROM public.recycled_invoice_numbers rin
  WHERE rin.gstin = p_gstin
    AND rin.fy_id = p_fy_id
    AND COALESCE(rin.doc_type, 'INV') = COALESCE(p_doc_type, 'INV')
  ORDER BY rin.sequence_value ASC
  LIMIT 1;

  IF v_recycled_number IS NOT NULL THEN
    DELETE FROM public.recycled_invoice_numbers
     WHERE gstin = p_gstin
       AND fy_id = p_fy_id
       AND COALESCE(doc_type, 'INV') = COALESCE(p_doc_type, 'INV')
       AND invoice_number = v_recycled_number;
    invoice_number := v_recycled_number;
    sequence_value := v_recycled_seq;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.invoice_sequences (gstin, fy_id, doc_type, prefix, next_value)
  VALUES (p_gstin, p_fy_id, COALESCE(p_doc_type, 'INV'), p_prefix, GREATEST(p_start, 1) + 1)
  ON CONFLICT (gstin, fy_id, doc_type)
  DO UPDATE SET next_value = GREATEST(public.invoice_sequences.next_value, p_start) + 1,
                prefix = EXCLUDED.prefix,
                updated_at = now()
  RETURNING next_value - 1 INTO v_next_seq;

  v_formatted := p_prefix || lpad(v_next_seq::text, 4, '0');
  invoice_number := v_formatted;
  sequence_value := v_next_seq;
  RETURN NEXT;
END;
$$;