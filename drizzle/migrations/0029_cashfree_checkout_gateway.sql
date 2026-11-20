-- Cashfree alongside Razorpay: each city picks exactly one gateway for new online checkouts.
ALTER TABLE public.payment_gateways ADD COLUMN IF NOT EXISTS use_for_checkout boolean NOT NULL DEFAULT false;

UPDATE public.payment_gateways SET use_for_checkout = true
 WHERE name = 'razorpay' AND is_active AND city IS NOT NULL AND tenant_id IS NULL
   AND coalesce(btrim(api_key), '') <> '' AND coalesce(btrim(api_secret), '') <> '';

ALTER TABLE public.payment_gateways ADD CONSTRAINT payment_gateways_checkout_ready CHECK (
  NOT use_for_checkout OR (
    is_active AND city IS NOT NULL AND tenant_id IS NULL AND name IN ('razorpay', 'cashfree')
    AND coalesce(btrim(api_key), '') <> '' AND coalesce(btrim(api_secret), '') <> ''
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_gateways_one_checkout_per_city ON public.payment_gateways (city) WHERE use_for_checkout;
COMMENT ON COLUMN public.payment_gateways.use_for_checkout IS 'This city gateway takes new online checkouts (bookings, hour packages). Other active gateways still verify and refund the payments they took.';

-- Every checkout remembers the gateway it was started on; razorpay_order_id holds that gateway's order id.
ALTER TABLE public.pending_bookings ADD COLUMN IF NOT EXISTS payment_gateway text NOT NULL DEFAULT 'razorpay'
  CONSTRAINT pending_bookings_payment_gateway_check CHECK (payment_gateway IN ('razorpay', 'cashfree'));
ALTER TABLE public.pending_guest_bookings ADD COLUMN IF NOT EXISTS payment_gateway text NOT NULL DEFAULT 'razorpay'
  CONSTRAINT pending_guest_bookings_payment_gateway_check CHECK (payment_gateway IN ('razorpay', 'cashfree'));
ALTER TABLE public.pending_purchases ADD COLUMN IF NOT EXISTS payment_gateway text NOT NULL DEFAULT 'razorpay'
  CONSTRAINT pending_purchases_payment_gateway_check CHECK (payment_gateway IN ('razorpay', 'cashfree'));
COMMENT ON COLUMN public.pending_bookings.razorpay_order_id IS 'Order id at the gateway named in payment_gateway (legacy column name).';
COMMENT ON COLUMN public.pending_guest_bookings.razorpay_order_id IS 'Order id at the gateway named in payment_gateway (legacy column name).';
COMMENT ON COLUMN public.pending_purchases.razorpay_order_id IS 'Order id at the gateway named in payment_gateway (legacy column name).';

-- Service-only switch, called by manage-payment-gateway after it authorizes the caller.
CREATE OR REPLACE FUNCTION public.set_checkout_gateway(_gateway_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v public.payment_gateways;
BEGIN
  SELECT * INTO v FROM public.payment_gateways WHERE id = _gateway_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gateway not found'; END IF;
  IF v.city IS NULL OR v.tenant_id IS NOT NULL THEN RAISE EXCEPTION 'Only a city payment account can take online payments'; END IF;
  IF v.name NOT IN ('razorpay', 'cashfree') THEN RAISE EXCEPTION 'This gateway cannot take online payments'; END IF;
  IF NOT v.is_active THEN RAISE EXCEPTION 'Switch this gateway on first'; END IF;
  IF coalesce(btrim(v.api_key), '') = '' OR coalesce(btrim(v.api_secret), '') = '' THEN
    RAISE EXCEPTION 'Save this gateway''s keys first';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('checkout_gateway:' || v.city));
  PERFORM 1 FROM public.payment_gateways WHERE city = v.city AND tenant_id IS NULL FOR UPDATE;
  UPDATE public.payment_gateways SET use_for_checkout = false, updated_at = now()
   WHERE city = v.city AND tenant_id IS NULL AND use_for_checkout AND id <> v.id;
  UPDATE public.payment_gateways SET use_for_checkout = true, updated_at = now() WHERE id = v.id;
  RETURN v.city;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_checkout_gateway(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_checkout_gateway(uuid) TO service_role;

-- Online hour purchases record the gateway that took the money (was always 'razorpay').
CREATE OR REPLACE FUNCTION public.complete_hour_purchase(p_user_id uuid, p_hours integer, p_amount numeric, p_currency text, p_order_id text, p_payment_id text, p_description text, p_city text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_htxn_id uuid;
  v_rev_id uuid;
  v_existing_rev_id uuid;
  v_existing_htxn_id uuid;
  v_months integer;
  v_label text;
  v_gateway text;
  v_sale public.revenue_transactions;
BEGIN
  -- Race-safe finalization: webhooks, the confirm step and the cron reconciler can
  -- fire the same payment in parallel. Hours must never be credited twice.
  PERFORM 1 FROM public.pending_purchases
    WHERE razorpay_order_id = p_order_id
    FOR UPDATE;

  SELECT rt.id, rt.hours_transaction_id
    INTO v_existing_rev_id, v_existing_htxn_id
  FROM public.revenue_transactions rt
  WHERE rt.gateway_payment_ref = p_payment_id
  LIMIT 1;

  IF v_existing_rev_id IS NOT NULL THEN
    UPDATE public.pending_purchases
      SET status = 'completed',
          hours_transaction_id = COALESCE(hours_transaction_id, v_existing_htxn_id),
          revenue_transaction_id = COALESCE(revenue_transaction_id, v_existing_rev_id),
          updated_at = now()
      WHERE razorpay_order_id = p_order_id
        AND status IS DISTINCT FROM 'completed';
    RETURN jsonb_build_object(
      'hours_transaction_id', v_existing_htxn_id,
      'revenue_transaction_id', v_existing_rev_id,
      'already_completed', true
    );
  END IF;

  INSERT INTO public.member_hours (user_id, hours_purchased, hours_used)
  VALUES (p_user_id, p_hours, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET hours_purchased = member_hours.hours_purchased + p_hours,
      updated_at = now();

  INSERT INTO public.hours_transactions (user_id, type, hours, note)
  VALUES (p_user_id, 'purchase', p_hours, p_description)
  RETURNING id INTO v_htxn_id;

  SELECT membership_validity_months, package_label, payment_gateway INTO v_months, v_label, v_gateway
    FROM public.pending_purchases WHERE razorpay_order_id = p_order_id;

  INSERT INTO public.revenue_transactions (
    transaction_type, amount, currency, user_id,
    hours_transaction_id, gateway_name,
    gateway_order_ref, gateway_payment_ref,
    description, status, city
  ) VALUES (
    'payment', p_amount, p_currency, p_user_id,
    v_htxn_id, coalesce(v_gateway, 'razorpay'),
    p_order_id, p_payment_id,
    p_description, 'confirmed', p_city
  ) RETURNING id INTO v_rev_id;

  -- A package with a validity period is a membership: record its term. Hours were added above.
  IF v_months IS NOT NULL THEN
    SELECT * INTO v_sale FROM public.revenue_transactions WHERE id = v_rev_id;
    PERFORM public.create_membership_record(
      p_user_id, v_sale.city, coalesce(nullif(v_label,''), p_description), v_sale.product_id, v_rev_id, NULL,
      coalesce(v_sale.revenue_date, (v_sale.created_at AT TIME ZONE 'Asia/Kolkata')::date), p_amount, v_months,
      NULL, p_hours, NULL, false);
  END IF;

  UPDATE public.pending_purchases
  SET status = 'completed',
      hours_transaction_id = v_htxn_id,
      revenue_transaction_id = v_rev_id,
      updated_at = now()
  WHERE razorpay_order_id = p_order_id;

  RETURN jsonb_build_object(
    'hours_transaction_id', v_htxn_id,
    'revenue_transaction_id', v_rev_id,
    'already_completed', false
  );
END;
$function$;