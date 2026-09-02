-- 1) Structural guarantee: one 'invoice' per revenue transaction.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_revenue_txn
  ON public.invoices (revenue_transaction_id)
  WHERE revenue_transaction_id IS NOT NULL AND invoice_type = 'invoice';

-- 2) Manual Create-Invoice flow owns its own invoice; the trigger must not race it.
CREATE OR REPLACE FUNCTION public.trg_auto_create_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Rows written by the manual "Create Invoice" admin flow are flagged; that
  -- flow inserts its own fully itemised invoice (with discounts, multiple line
  -- items, chosen numbering), so auto-generating one here produced duplicates.
  IF COALESCE(NEW.metadata->>'manual_invoice', '') = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed'
     AND COALESCE(NEW.amount, 0) > 0
     AND NEW.transaction_type IN (
       'guest_booking', 'payment', 'booking', 'purchase',
       'product_order', 'league_registration', 'qc_entry'
     ) THEN
    PERFORM public.auto_create_invoice_for_revenue(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Serialise + make the generator race-proof.
CREATE OR REPLACE FUNCTION public.auto_create_invoice_for_revenue(p_revenue_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rev RECORD;
  v_profile RECORD;
  v_fy RECORD;
  v_existing uuid;
  v_invoice_number text;
  v_invoice_id uuid;
  v_gst_rate numeric;
  v_taxable numeric;
  v_total_gst numeric;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_igst numeric := 0;
  v_seq_gstin text;
  v_gst_registered boolean;
  v_customer_user_id uuid;
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
  v_booking RECORD;
  v_item_name text;
  v_billing_status text;
  v_has_product boolean := false;
  v_product_id uuid;
  v_product_name text;
  v_product_gst_rate numeric;
  v_product_hsn_code text;
  v_product_sac_code text;
  v_product_item_type text;
  v_hsn_code text;
  v_sac_code text;
  v_item_type text;
  v_category text;
BEGIN
  SELECT * INTO v_rev FROM public.revenue_transactions WHERE id = p_revenue_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_rev.transaction_type = 'refund' OR COALESCE(v_rev.amount, 0) <= 0 OR v_rev.status <> 'confirmed' THEN
    RETURN NULL;
  END IF;

  IF v_rev.booking_id IS NOT NULL THEN
    SELECT billing_status INTO v_billing_status FROM public.bookings WHERE id = v_rev.booking_id;
    IF v_billing_status = 'deferred' THEN RETURN NULL; END IF;
  END IF;

  -- Serialise concurrent callers for this revenue row so the existence check
  -- below cannot be bypassed by a parallel transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_revenue_id::text, 0));

  SELECT id INTO v_existing FROM public.invoices
   WHERE revenue_transaction_id = p_revenue_id AND invoice_type = 'invoice'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF v_rev.city IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_profile FROM public.gst_profiles WHERE city = v_rev.city;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_fy FROM public.financial_years
   WHERE is_active = true AND city = v_rev.city LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_fy FROM public.financial_years
     WHERE is_active = true AND city IS NULL LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_gst_registered := COALESCE(v_profile.is_gst_registered, true)
                      AND COALESCE(NULLIF(btrim(v_profile.gstin), ''), '') <> ''
                      AND v_profile.gstin !~ '^0+$';
  v_seq_gstin := CASE WHEN v_gst_registered THEN v_profile.gstin ELSE 'NOGST-' || v_rev.city END;

  v_product_id := v_rev.product_id;

  IF v_product_id IS NULL THEN
    BEGIN
      v_product_id := NULLIF(v_rev.metadata->>'product_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_product_id := NULL;
    END;
  END IF;

  IF v_product_id IS NULL AND v_rev.booking_id IS NOT NULL THEN
    SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = v_rev.booking_id;
    IF FOUND AND v_booking.session_type IS NOT NULL THEN
      SELECT bp.service_product_id
        INTO v_product_id
        FROM public.bay_pricing bp
       WHERE bp.city = v_rev.city
         AND bp.session_type = v_booking.session_type
         AND bp.service_product_id IS NOT NULL
       LIMIT 1;
    END IF;
  END IF;

  IF v_product_id IS NOT NULL THEN
    SELECT id, name, gst_rate, hsn_code, sac_code, item_type
      INTO v_product_id, v_product_name, v_product_gst_rate,
           v_product_hsn_code, v_product_sac_code, v_product_item_type
      FROM public.products
     WHERE id = v_product_id;
    IF FOUND THEN
      v_has_product := true;
    ELSE
      RAISE WARNING 'auto_create_invoice_for_revenue(%): referenced product_id not found; falling back to profile defaults', p_revenue_id;
    END IF;
  END IF;

  IF v_has_product THEN
    v_gst_rate  := COALESCE(v_product_gst_rate, v_profile.default_service_gst_rate, 18);
    v_hsn_code  := v_product_hsn_code;
    v_sac_code  := COALESCE(v_product_sac_code, v_profile.default_sac_code);
    v_item_type := COALESCE(v_product_item_type, 'service');
  ELSE
    v_gst_rate  := COALESCE(v_profile.default_service_gst_rate, 18);
    v_hsn_code  := NULL;
    v_sac_code  := v_profile.default_sac_code;
    v_item_type := 'service';
  END IF;

  IF NOT v_gst_registered THEN
    v_gst_rate  := 0;
    v_taxable   := v_rev.amount;
    v_total_gst := 0;
    v_cgst      := 0;
    v_sgst      := 0;
    v_igst      := 0;
  ELSE
    v_taxable   := round((v_rev.amount / (1 + v_gst_rate / 100))::numeric, 2);
    v_total_gst := round((v_rev.amount - v_taxable)::numeric, 2);
    v_cgst      := round((v_total_gst / 2)::numeric, 2);
    v_sgst      := round((v_total_gst - v_cgst)::numeric, 2);
    v_igst      := 0;
  END IF;

  v_customer_user_id := v_rev.user_id;
  IF v_customer_user_id IS NOT NULL THEN
    SELECT display_name, email, phone INTO v_customer_name, v_customer_email, v_customer_phone
      FROM public.profiles
     WHERE user_id = v_customer_user_id OR id = v_customer_user_id
     ORDER BY (user_id = v_customer_user_id) DESC
     LIMIT 1;
  END IF;
  IF v_customer_name  IS NULL THEN v_customer_name  := COALESCE(v_rev.guest_name, 'Customer'); END IF;
  IF v_customer_email IS NULL THEN v_customer_email := v_rev.guest_email; END IF;
  IF v_customer_phone IS NULL THEN v_customer_phone := v_rev.guest_phone; END IF;

  IF v_has_product AND v_product_name IS NOT NULL THEN
    v_item_name := v_product_name;
  ELSIF v_rev.transaction_type IN ('guest_booking','payment') THEN
    v_item_name := COALESCE(v_rev.description, 'Bay booking');
  ELSE
    v_item_name := COALESCE(v_rev.description, 'Service');
  END IF;

  v_category := CASE
    WHEN v_rev.booking_id IS NOT NULL THEN 'booking'
    WHEN v_rev.transaction_type = 'league_registration' THEN 'league'
    WHEN v_rev.transaction_type = 'qc_entry' THEN 'competition'
    WHEN v_rev.transaction_type = 'product_order' THEN 'shop'
    ELSE 'purchase'
  END;

  v_invoice_number := public.get_next_invoice_number(
    v_seq_gstin, v_fy.id,
    COALESCE(v_profile.invoice_prefix, 'INV'),
    COALESCE(v_profile.invoice_start_number, 1)
  );

  INSERT INTO public.invoices (
    invoice_number, invoice_date, financial_year_id,
    customer_user_id, customer_name, customer_email, customer_phone,
    business_name, business_gstin, business_address, business_state, business_state_code,
    subtotal, cgst_total, sgst_total, igst_total, total,
    status, invoice_type, payment_method, revenue_transaction_id,
    city, invoice_category, payment_reference, amount_paid, payment_status, due_date
  ) VALUES (
    v_invoice_number, COALESCE(v_rev.created_at::date, CURRENT_DATE), v_fy.id,
    v_customer_user_id, v_customer_name, v_customer_email, v_customer_phone,
    v_profile.legal_name,
    CASE WHEN v_gst_registered THEN v_profile.gstin ELSE '' END,
    v_profile.address, v_profile.state, v_profile.state_code,
    v_taxable, v_cgst, v_sgst, v_igst, v_rev.amount,
    'issued', 'invoice', COALESCE(v_rev.gateway_name, 'razorpay'), v_rev.id,
    v_rev.city,
    v_category,
    v_rev.gateway_payment_ref, v_rev.amount, 'paid',
    COALESCE(v_rev.created_at::date, CURRENT_DATE)
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_line_items (
    invoice_id, item_name, item_type, hsn_code, sac_code, product_id,
    quantity, unit_price, gst_rate,
    cgst_amount, sgst_amount, igst_amount, line_total, sort_order
  ) VALUES (
    v_invoice_id, v_item_name, v_item_type, v_hsn_code, v_sac_code,
    CASE WHEN v_has_product THEN v_product_id ELSE NULL END,
    1, v_rev.amount, v_gst_rate,
    v_cgst, v_sgst, v_igst, v_rev.amount, 0
  );

  IF v_rev.booking_id IS NOT NULL THEN
    UPDATE public.bookings SET invoice_id = v_invoice_id
     WHERE id = v_rev.booking_id AND invoice_id IS NULL;
  END IF;

  RETURN v_invoice_id;
EXCEPTION
  WHEN unique_violation THEN
    -- Another writer won the race (e.g. the manual flow inserted its own
    -- invoice for this revenue row). Return theirs; never create a second.
    SELECT id INTO v_existing FROM public.invoices
     WHERE revenue_transaction_id = p_revenue_id AND invoice_type = 'invoice'
     LIMIT 1;
    RETURN v_existing;
  WHEN OTHERS THEN
    RAISE WARNING 'auto_create_invoice_for_revenue(%) failed: %', p_revenue_id, SQLERRM;
    RETURN NULL;
END;
$function$;