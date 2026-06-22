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
BEGIN
  -- ── Race-safe finalization ──
  -- Multiple finalizers (browser confirm-hour-purchase, razorpay-webhook,
  -- reconcile-pending-payments cron, Razorpay duplicate webhooks) can fire
  -- the same payment_id in parallel. We must NEVER double-credit hours.
  --
  -- Step 1: Take a row lock on the pending_purchases row so concurrent
  -- finalizers serialize through this function for the same order_id.
  PERFORM 1 FROM public.pending_purchases
    WHERE razorpay_order_id = p_order_id
    FOR UPDATE;

  -- Step 2: Idempotency guard. revenue_transactions.gateway_payment_ref is
  -- UNIQUE — if a sibling already inserted, we return the existing ids and
  -- do NOT touch member_hours / hours_transactions a second time.
  SELECT rt.id, rt.hours_transaction_id
    INTO v_existing_rev_id, v_existing_htxn_id
  FROM public.revenue_transactions rt
  WHERE rt.gateway_payment_ref = p_payment_id
  LIMIT 1;

  IF v_existing_rev_id IS NOT NULL THEN
    -- Defensive: ensure pending_purchases reflects completion even if the
    -- winning finalizer failed to update it before crashing.
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

  -- 1. Upsert member_hours
  INSERT INTO public.member_hours (user_id, hours_purchased, hours_used)
  VALUES (p_user_id, p_hours, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET hours_purchased = member_hours.hours_purchased + p_hours,
      updated_at = now();

  -- 2. Log hours transaction
  INSERT INTO public.hours_transactions (user_id, type, hours, note)
  VALUES (p_user_id, 'purchase', p_hours, p_description)
  RETURNING id INTO v_htxn_id;

  -- 3. Record revenue transaction. The UNIQUE (gateway_payment_ref) constraint
  -- is our final safety net — if a concurrent finalizer slipped past the lock
  -- (e.g. cron under load), the second insert raises 23505 and the whole
  -- transaction rolls back, preserving idempotency.
  INSERT INTO public.revenue_transactions (
    transaction_type, amount, currency, user_id,
    hours_transaction_id, gateway_name,
    gateway_order_ref, gateway_payment_ref,
    description, status, city
  ) VALUES (
    'payment', p_amount, p_currency, p_user_id,
    v_htxn_id, 'razorpay',
    p_order_id, p_payment_id,
    p_description, 'confirmed', p_city
  ) RETURNING id INTO v_rev_id;

  -- 4. Update pending_purchases
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