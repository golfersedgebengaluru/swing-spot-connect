-- ─────────────────────────────────────────────────────────────────────────────
-- Pass 3: one guarded writer for money leaving the business.
--
-- Refunds used to be inserted ad hoc by each cancellation path as POSITIVE
-- amounts with no unique key, which meant (a) any report that forgot to special
-- case transaction_type = 'refund' overstated income, and (b) a retried
-- cancellation could refund the same sale twice. They are now negative, keyed
-- and capped at the original sale.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_refund(
  p_source_ref text,
  p_original_transaction_id uuid,
  p_amount numeric,                       -- positive magnitude; stored negative
  p_description text,
  p_gateway_name text DEFAULT NULL,
  p_revenue_date date DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_orig public.revenue_transactions;
  v_already numeric;
  v_id uuid;
BEGIN
  IF p_source_ref IS NULL OR btrim(p_source_ref) = '' THEN
    RAISE EXCEPTION 'record_refund: source_ref is required';
  END IF;
  IF p_original_transaction_id IS NULL THEN
    RAISE EXCEPTION 'record_refund: original_transaction_id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'record_refund: amount must be a positive magnitude';
  END IF;

  -- Staff only. A NULL uid means the service role (webhooks, cron, edge fns).
  IF v_uid IS NOT NULL
     AND NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'site_admin')) THEN
    RAISE EXCEPTION 'record_refund: not authorised';
  END IF;

  -- Idempotent: replays resolve to the row that already exists.
  SELECT id INTO v_id FROM public.revenue_transactions WHERE source_ref = btrim(p_source_ref);
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Serialise concurrent refunds of the same sale so the cap below holds.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_original_transaction_id::text, 1));

  SELECT * INTO v_orig FROM public.revenue_transactions WHERE id = p_original_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_refund: original transaction % not found', p_original_transaction_id;
  END IF;
  IF v_orig.transaction_type = 'refund' THEN
    RAISE EXCEPTION 'record_refund: cannot refund a refund';
  END IF;
  IF COALESCE(v_orig.amount, 0) <= 0 THEN
    RAISE EXCEPTION 'record_refund: original transaction has nothing to refund';
  END IF;

  SELECT COALESCE(SUM(abs(amount)), 0) INTO v_already
    FROM public.revenue_transactions
   WHERE original_transaction_id = p_original_transaction_id
     AND transaction_type = 'refund'
     AND status = 'confirmed';

  IF v_already + p_amount > v_orig.amount + 0.01 THEN
    RAISE EXCEPTION 'record_refund: refund of % exceeds refundable balance % on transaction %',
      p_amount, GREATEST(v_orig.amount - v_already, 0), p_original_transaction_id;
  END IF;

  INSERT INTO public.revenue_transactions (
    source_ref, transaction_type, amount, currency, city, description, status,
    user_id, guest_name, guest_email, guest_phone,
    booking_id, product_id, original_transaction_id,
    gateway_name, revenue_date, metadata
  ) VALUES (
    btrim(p_source_ref), 'refund', -p_amount, v_orig.currency, v_orig.city,
    COALESCE(p_description, 'Refund'), 'confirmed',
    v_orig.user_id, v_orig.guest_name, v_orig.guest_email, v_orig.guest_phone,
    v_orig.booking_id, v_orig.product_id, p_original_transaction_id,
    COALESCE(p_gateway_name, v_orig.gateway_name), p_revenue_date,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (source_ref) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.revenue_transactions WHERE source_ref = btrim(p_source_ref);
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_refund(text, uuid, numeric, text, text, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_refund(text, uuid, numeric, text, text, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_refund(text, uuid, numeric, text, text, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund(text, uuid, numeric, text, text, date, jsonb) TO service_role;

-- New refunds must be signed money-out. Existing history is corrected by a
-- separate backfill; this guard is INSERT-only so that backfill can run.
CREATE OR REPLACE FUNCTION public.validate_revenue_refund_sign()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.transaction_type = 'refund' AND COALESCE(NEW.amount, 0) >= 0 THEN
    RAISE EXCEPTION 'revenue_transactions: a refund must be recorded as a negative amount (got %)', NEW.amount;
  END IF;
  IF NEW.transaction_type <> 'refund' AND COALESCE(NEW.amount, 0) < 0 THEN
    RAISE EXCEPTION 'revenue_transactions: only refunds may be negative (type %, amount %)', NEW.transaction_type, NEW.amount;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_revenue_refund_sign_before_insert ON public.revenue_transactions;
CREATE TRIGGER validate_revenue_refund_sign_before_insert
  BEFORE INSERT ON public.revenue_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_revenue_refund_sign();