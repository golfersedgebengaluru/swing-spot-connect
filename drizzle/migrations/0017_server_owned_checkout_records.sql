-- Hours may only be credited by trusted payment processing.
REVOKE EXECUTE ON FUNCTION public.complete_hour_purchase(uuid, integer, numeric, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_hour_purchase(uuid, integer, numeric, text, text, text, text, text) TO service_role;

-- Guest checkout claims are made only by booking finalization.
REVOKE EXECUTE ON FUNCTION public.try_claim_pending_guest_booking(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_claim_pending_guest_booking(text) TO service_role;

-- Pending checkout records are created by order creation with server prices.
DROP POLICY IF EXISTS "Anyone can create pending guest bookings" ON public.pending_guest_bookings;
DROP POLICY IF EXISTS "Users can insert own pending_purchases" ON public.pending_purchases;
DROP POLICY IF EXISTS "Users manage own pending bookings" ON public.pending_bookings;
CREATE POLICY "Users view own pending bookings" ON public.pending_bookings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);