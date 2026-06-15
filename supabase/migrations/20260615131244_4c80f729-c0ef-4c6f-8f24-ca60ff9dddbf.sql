
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
  v_max_existing integer;
  v_candidate text;
  v_attempts integer := 0;
BEGIN
  IF p_doc_type NOT IN ('tax_invoice','proforma','credit_note','debit_note','receipt') THEN
    RAISE EXCEPTION 'Invalid doc_type: %', p_doc_type;
  END IF;

  -- Recycled pool first
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

  SELECT label INTO v_fy_label FROM financial_years WHERE id = p_fy_id;

  -- Highest trailing number already in invoices for this gstin/fy/prefix
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(invoice_number, '^.*/([0-9]+)$', '\1'), '')::int
  ), 0)
  INTO v_max_existing
  FROM invoices
  WHERE COALESCE(business_gstin,'') = COALESCE(p_gstin,'')
    AND financial_year_id = p_fy_id
    AND invoice_number LIKE (p_prefix || '/%')
    AND invoice_number ~ '/[0-9]+$';

  LOOP
    v_attempts := v_attempts + 1;

    -- Upsert sequence, syncing to max existing so generated # never collides
    INSERT INTO invoice_sequences (gstin, financial_year_id, prefix, last_number, doc_type)
    VALUES (
      p_gstin, p_fy_id, p_prefix,
      GREATEST(p_start, v_max_existing + 1),
      p_doc_type
    )
    ON CONFLICT (gstin, financial_year_id, doc_type)
    DO UPDATE SET
      last_number = GREATEST(invoice_sequences.last_number, v_max_existing) + 1,
      prefix = EXCLUDED.prefix,
      updated_at = now()
    RETURNING last_number INTO v_next;

    v_candidate := p_prefix || '/' || COALESCE(v_fy_label, '') || '/' || LPAD(v_next::text, 4, '0');

    -- Collision safety: if somehow already taken, bump max & retry
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_number = v_candidate) THEN
      RETURN v_candidate;
    END IF;

    v_max_existing := v_next;

    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Could not allocate unique invoice number after % attempts (last candidate: %)',
        v_attempts, v_candidate;
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_next_invoice_number(text, uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_invoice_number(text, uuid, text, integer, text) TO authenticated, service_role;
