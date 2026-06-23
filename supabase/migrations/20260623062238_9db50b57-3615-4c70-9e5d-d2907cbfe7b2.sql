-- Bulletproof guest booking de-duplication.
-- Root cause: calendar-sync used a read-then-write guard (SELECT revenue_transactions
-- by gateway_order_ref → INSERT booking). Browser and webhook can pass the read
-- guard concurrently and both insert. This migration adds:
--   1. Atomic claim function on pending_guest_bookings (CAS on status).
--   2. Unique partial index on revenue_transactions.gateway_order_ref as DB-level
--      defence-in-depth across all gateway-finalized transaction types.
--   3. Cleanup of the existing duplicate booking from order_T4xhMfuuha8FBI.

-- 1) Atomic claim function for guest bookings
CREATE OR REPLACE FUNCTION public.claim_pending_guest_booking(_order_id text)
RETURNS public.pending_guest_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pending_guest_bookings%ROWTYPE;
BEGIN
  -- Try to atomically transition a finalizable row into 'processing'.
  -- Only one caller wins; others get 0 rows back.
  UPDATE public.pending_guest_bookings
     SET status = 'processing',
         updated_at = now()
   WHERE razorpay_order_id = _order_id
     AND status IN ('pending','awaiting_payment','webhook_error','signature_failed','processing_failed')
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- Already claimed/completed by another finalizer — return the current row
  -- (caller treats this as already_finalized and returns the existing booking).
  SELECT * INTO v_row
    FROM public.pending_guest_bookings
   WHERE razorpay_order_id = _order_id;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_guest_booking(text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_pending_guest_booking(text) TO service_role;

-- Helper to release a claim if downstream work fails, so retries / cron can finish.
CREATE OR REPLACE FUNCTION public.release_pending_guest_booking(_order_id text, _error text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.pending_guest_bookings
     SET status = 'webhook_error',
         error_message = COALESCE(_error, error_message),
         updated_at = now()
   WHERE razorpay_order_id = _order_id
     AND status = 'processing';
$$;
REVOKE ALL ON FUNCTION public.release_pending_guest_booking(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.release_pending_guest_booking(text, text) TO service_role;

-- 2) Clean up the existing duplicate (order_T4xhMfuuha8FBI):
--    keep the booking with the revenue_transactions row (ab3efd6f...),
--    delete the orphan duplicate (7a5f2399...). The orphan Google Calendar
--    event (dbf8i98fc17lge0lkqh4ubgubc) must be removed manually from
--    Google Calendar — no DB linkage exists to clean it programmatically.
DELETE FROM public.bookings
 WHERE id = '7a5f2399-8a20-4274-a2b8-cbd4c8eaeebf';

-- 3) Defence-in-depth: prevent two revenue rows for the same gateway order.
--    Partial index — only enforce when gateway_order_ref is set and for
--    gateway-finalized transaction types.
CREATE UNIQUE INDEX IF NOT EXISTS revenue_transactions_unique_gateway_order
  ON public.revenue_transactions (transaction_type, gateway_order_ref)
  WHERE gateway_order_ref IS NOT NULL
    AND transaction_type IN ('guest_booking','hour_purchase','league_team_registration','qc_entry','payment');
