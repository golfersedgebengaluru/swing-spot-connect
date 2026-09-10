CREATE OR REPLACE FUNCTION public.record_revenue(
  p_source_ref text,
  p_transaction_type text,
  p_amount numeric,
  p_description text,
  p_city text DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_booking_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_hours_transaction_id uuid DEFAULT NULL,
  p_gateway_name text DEFAULT NULL,
  p_revenue_date date DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_guest_email text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_staff boolean := false;
  v_currency text;
  v_city text;
  v_id uuid;
BEGIN
  IF p_source_ref IS NULL OR btrim(p_source_ref) = '' THEN
    RAISE EXCEPTION 'record_revenue: source_ref is required';
  END IF;
  IF p_transaction_type IS NULL OR btrim(p_transaction_type) = '' THEN
    RAISE EXCEPTION 'record_revenue: transaction_type is required';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'record_revenue: amount must be zero or positive';
  END IF;

  IF p_amount = 0 THEN
    RETURN NULL;
  END IF;

  IF v_uid IS NOT NULL THEN
    v_is_staff := public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'site_admin');
    IF NOT v_is_staff
       AND NOT (p_transaction_type = 'product_order' AND p_user_id = v_uid) THEN
      RAISE EXCEPTION 'record_revenue: not authorised';
    END IF;
  END IF;

  SELECT id INTO v_id FROM public.revenue_transactions WHERE source_ref = p_source_ref;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- City is mandatory for money: recover it from the booking, the bay or the
  -- member's preferred city before giving up, then fail loudly.
  v_city := NULLIF(btrim(COALESCE(p_city, '')), '');
  IF v_city IS NULL AND p_booking_id IS NOT NULL THEN
    SELECT NULLIF(btrim(COALESCE(bk.city, bay.city, '')), '')
      INTO v_city
      FROM public.bookings bk
      LEFT JOIN public.bays bay ON bay.id = bk.bay_id
     WHERE bk.id = p_booking_id;
  END IF;
  IF v_city IS NULL AND p_user_id IS NOT NULL THEN
    SELECT NULLIF(btrim(COALESCE(pr.preferred_city, '')), '')
      INTO v_city
      FROM public.profiles pr
     WHERE pr.user_id = p_user_id OR pr.id = p_user_id
     ORDER BY (pr.user_id = p_user_id) DESC
     LIMIT 1;
  END IF;
  IF v_city IS NULL THEN
    RAISE EXCEPTION 'record_revenue: city is required for a paid transaction (source_ref %)', p_source_ref;
  END IF;

  v_currency := COALESCE(
    NULLIF(btrim(COALESCE(p_currency, '')), ''),
    (SELECT b.currency FROM public.bays b
      WHERE b.city = v_city AND b.currency IS NOT NULL
      ORDER BY b.sort_order NULLS LAST LIMIT 1),
    'INR'
  );

  INSERT INTO public.revenue_transactions (
    source_ref, transaction_type, amount, currency, city, description, status,
    user_id, booking_id, product_id, hours_transaction_id, gateway_name,
    revenue_date, guest_name, guest_email, metadata
  ) VALUES (
    btrim(p_source_ref), p_transaction_type, p_amount, v_currency, v_city,
    COALESCE(p_description, ''), 'confirmed',
    p_user_id, p_booking_id, p_product_id, p_hours_transaction_id, p_gateway_name,
    p_revenue_date, p_guest_name, p_guest_email, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (source_ref) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.revenue_transactions WHERE source_ref = btrim(p_source_ref);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_revenue(
  text, text, numeric, text, text, text, uuid, uuid, uuid, uuid, text, date, text, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_revenue(
  text, text, numeric, text, text, text, uuid, uuid, uuid, uuid, text, date, text, text, jsonb
) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_revenue(
  text, text, numeric, text, text, text, uuid, uuid, uuid, uuid, text, date, text, text, jsonb
) TO authenticated, service_role;