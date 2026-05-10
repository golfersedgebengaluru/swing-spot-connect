
-- Add default GST rate column to gst_profiles for auto-invoicing
ALTER TABLE public.gst_profiles
  ADD COLUMN IF NOT EXISTS default_service_gst_rate numeric NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS default_sac_code text;

-- Auto-create a tax invoice for a confirmed revenue_transaction (idempotent).
-- Returns invoice_id, or NULL when skipped (no GST profile, amount<=0, deferred, refund, already exists, no FY).
CREATE OR REPLACE FUNCTION public.auto_create_invoice_for_revenue(p_revenue_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  SELECT * INTO v_rev FROM public.revenue_transactions WHERE id = p_revenue_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Skip refunds, zero/negative amounts, unconfirmed transactions
  IF v_rev.transaction_type = 'refund' OR COALESCE(v_rev.amount, 0) <= 0 OR v_rev.status <> 'confirmed' THEN
    RETURN NULL;
  END IF;

  -- Skip deferred (corporate) bookings — those are billed monthly
  IF v_rev.booking_id IS NOT NULL THEN
    SELECT billing_status INTO v_billing_status FROM public.bookings WHERE id = v_rev.booking_id;
    IF v_billing_status = 'deferred' THEN RETURN NULL; END IF;
  END IF;

  -- Idempotency: skip if an invoice already references this revenue txn
  SELECT id INTO v_existing FROM public.invoices
   WHERE revenue_transaction_id = p_revenue_id AND invoice_type = 'invoice'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  -- GST profile lookup (per city)
  IF v_rev.city IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_profile FROM public.gst_profiles WHERE city = v_rev.city;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Active financial year (city-specific first, then global)
  SELECT * INTO v_fy FROM public.financial_years
   WHERE is_active = true AND city = v_rev.city LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_fy FROM public.financial_years
     WHERE is_active = true AND city IS NULL LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_gst_registered := COALESCE(NULLIF(btrim(v_profile.gstin), ''), '') <> '' AND v_profile.gstin !~ '^0+$';
  v_seq_gstin := CASE WHEN v_gst_registered THEN v_profile.gstin ELSE 'NOGST-' || v_rev.city END;

  v_gst_rate := COALESCE(v_profile.default_service_gst_rate, 18);

  -- Reverse-calc taxable amount (price is gst-inclusive)
  v_taxable := round((v_rev.amount / (1 + v_gst_rate / 100))::numeric, 2);
  v_total_gst := round((v_rev.amount - v_taxable)::numeric, 2);

  -- Always intra-state for auto-invoicing (no customer GSTIN known)
  v_cgst := round((v_total_gst / 2)::numeric, 2);
  v_sgst := round((v_total_gst - v_cgst)::numeric, 2);

  -- Resolve customer details: prefer profile, fall back to revenue's guest fields
  v_customer_user_id := v_rev.user_id;
  IF v_customer_user_id IS NOT NULL THEN
    SELECT display_name, email, phone INTO v_customer_name, v_customer_email, v_customer_phone
      FROM public.profiles
     WHERE user_id = v_customer_user_id OR id = v_customer_user_id
     ORDER BY (user_id = v_customer_user_id) DESC
     LIMIT 1;
  END IF;
  IF v_customer_name IS NULL THEN v_customer_name := COALESCE(v_rev.guest_name, 'Customer'); END IF;
  IF v_customer_email IS NULL THEN v_customer_email := v_rev.guest_email; END IF;
  IF v_customer_phone IS NULL THEN v_customer_phone := v_rev.guest_phone; END IF;

  -- Item name from context
  IF v_rev.transaction_type = 'guest_booking' OR v_rev.transaction_type = 'payment' THEN
    v_item_name := COALESCE(v_rev.description, 'Bay booking');
  ELSE
    v_item_name := COALESCE(v_rev.description, 'Service');
  END IF;

  -- Generate invoice number
  v_invoice_number := public.get_next_invoice_number(
    v_seq_gstin, v_fy.id,
    COALESCE(v_profile.invoice_prefix, 'INV'),
    COALESCE(v_profile.invoice_start_number, 1)
  );

  -- Insert invoice
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
    CASE WHEN v_rev.booking_id IS NOT NULL THEN 'booking' ELSE 'purchase' END,
    v_rev.gateway_payment_ref, v_rev.amount, 'paid',
    COALESCE(v_rev.created_at::date, CURRENT_DATE)
  ) RETURNING id INTO v_invoice_id;

  -- Single line item
  INSERT INTO public.invoice_line_items (
    invoice_id, item_name, item_type, sac_code,
    quantity, unit_price, gst_rate,
    cgst_amount, sgst_amount, igst_amount, line_total, sort_order
  ) VALUES (
    v_invoice_id, v_item_name, 'service', v_profile.default_sac_code,
    1, v_rev.amount, v_gst_rate,
    v_cgst, v_sgst, v_igst, v_rev.amount, 0
  );

  -- Link booking → invoice if applicable
  IF v_rev.booking_id IS NOT NULL THEN
    UPDATE public.bookings SET invoice_id = v_invoice_id
     WHERE id = v_rev.booking_id AND invoice_id IS NULL;
  END IF;

  RETURN v_invoice_id;
EXCEPTION WHEN OTHERS THEN
  -- Never block the calling flow; surface in logs only
  RAISE WARNING 'auto_create_invoice_for_revenue(%) failed: %', p_revenue_id, SQLERRM;
  RETURN NULL;
END;
$$;

-- Backfill missing invoices for historical paid revenue
CREATE OR REPLACE FUNCTION public.backfill_missing_invoices()
RETURNS TABLE(revenue_id uuid, invoice_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_id uuid;
BEGIN
  FOR r IN
    SELECT rt.id
      FROM public.revenue_transactions rt
      LEFT JOIN public.invoices inv
             ON inv.revenue_transaction_id = rt.id AND inv.invoice_type = 'invoice'
     WHERE rt.status = 'confirmed'
       AND rt.amount > 0
       AND rt.transaction_type IN ('guest_booking', 'payment')
       AND inv.id IS NULL
     ORDER BY rt.created_at ASC
  LOOP
    v_id := public.auto_create_invoice_for_revenue(r.id);
    revenue_id := r.id;
    invoice_id := v_id;
    RETURN NEXT;
  END LOOP;
END;
$$;
