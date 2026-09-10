CREATE OR REPLACE FUNCTION public.backfill_invoice_line_tax_codes(
  _from_date date,
  _to_date date,
  _city text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF _from_date IS NULL OR _to_date IS NULL THEN
    RAISE EXCEPTION 'from_date and to_date are required';
  END IF;

  WITH updated AS (
    UPDATE public.invoice_line_items li
    SET hsn_code = NULLIF(btrim(p.hsn_code), ''),
        sac_code = NULLIF(btrim(p.sac_code), '')
    FROM public.invoices i, public.products p
    WHERE li.invoice_id = i.id
      AND li.product_id = p.id
      AND i.invoice_date >= _from_date
      AND i.invoice_date <= _to_date
      AND (_city IS NULL OR i.city = _city)
      AND COALESCE(NULLIF(btrim(li.hsn_code), ''), NULLIF(btrim(li.sac_code), '')) IS NULL
      AND COALESCE(NULLIF(btrim(p.hsn_code), ''), NULLIF(btrim(p.sac_code), '')) IS NOT NULL
    RETURNING li.id
  )
  SELECT count(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_invoice_line_tax_codes(date, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_invoice_line_tax_codes(date, date, text) TO service_role;

DROP FUNCTION IF EXISTS public.backfill_invoice_line_tax_codes(date, date);