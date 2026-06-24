-- Bulletproof guest booking de-duplication v2.
-- Replaces timestamp-heuristic claim with explicit claimed/loser semantics.
-- Cleans up the Nidhi duplicate (order_T56UdzLqBEyppr).

CREATE OR REPLACE FUNCTION public.try_claim_pending_guest_booking(_order_id text)
RETURNS TABLE(claimed boolean, current_status text, existing_booking_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_booking_id uuid;
BEGIN
  -- Atomic CAS: only the caller that actually performs the UPDATE gets claimed=true.
  UPDATE public.pending_guest_bookings
     SET status = 'processing', updated_at = now()
   WHERE razorpay_order_id = _order_id
     AND status IN ('pending','awaiting_payment','webhook_error','signature_failed','processing_failed')
  RETURNING status INTO v_status;

  IF FOUND THEN
    claimed := true;
    current_status := v_status;
    existing_booking_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Loser path: surface the booking the winner created (if any) for client redirect.
  SELECT p.status INTO v_status
    FROM public.pending_guest_bookings p
   WHERE p.razorpay_order_id = _order_id;

  SELECT rt.booking_id INTO v_booking_id
    FROM public.revenue_transactions rt
   WHERE rt.gateway_order_ref = _order_id
     AND rt.transaction_type = 'guest_booking'
   LIMIT 1;

  claimed := false;
  current_status := COALESCE(v_status, 'not_found');
  existing_booking_id := v_booking_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.try_claim_pending_guest_booking(text) FROM public;
GRANT EXECUTE ON FUNCTION public.try_claim_pending_guest_booking(text) TO service_role;

-- Cleanup: delete the duplicate Nidhi booking (no revenue tied to it).
-- Orphan Google Calendar event jjo8dl64eihf2ld74j3p6rre98 must be removed manually.
DELETE FROM public.bookings
 WHERE id = '59323226-d762-4880-82cc-8ea9005e4d97'
   AND NOT EXISTS (
     SELECT 1 FROM public.revenue_transactions rt WHERE rt.booking_id = '59323226-d762-4880-82cc-8ea9005e4d97'
   );
