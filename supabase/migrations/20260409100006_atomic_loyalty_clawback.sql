-- Atomic stored procedure: mark a booking as cancelled and claw back its loyalty points
-- in a single transaction so partial state (cancelled booking, unreclaimed points) is impossible.
-- The edge function (calendar-sync) handles hours refund/revenue reversal separately,
-- as those require business-logic that's better kept in application code.
--
-- Column reference for points_transactions:
--   type TEXT ('allocation' | 'redemption'), points INTEGER, booking_id UUID,
--   event_type TEXT, reason TEXT

CREATE OR REPLACE FUNCTION public.cancel_booking_with_clawback(
  p_booking_id UUID,
  p_cancelled_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking RECORD;
  v_points_clawed_back INTEGER := 0;
BEGIN
  -- Lock the booking row for update to prevent race conditions
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Booking not found');
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('already_cancelled', true, 'booking_id', p_booking_id);
  END IF;

  -- Mark booking as cancelled
  UPDATE public.bookings
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_booking_id;

  -- Sum up allocation transactions linked to this booking
  SELECT COALESCE(SUM(points), 0) INTO v_points_clawed_back
  FROM public.points_transactions
  WHERE booking_id = p_booking_id
    AND type = 'allocation';

  IF v_points_clawed_back > 0 THEN
    -- Insert clawback (redemption) transaction
    INSERT INTO public.points_transactions (
      user_id, type, points, description, booking_id, created_by, event_type, reason
    )
    VALUES (
      v_booking.user_id,
      'redemption',
      v_points_clawed_back,
      'Points reversed: booking cancelled',
      p_booking_id,
      COALESCE(p_cancelled_by, v_booking.user_id),
      'cancellation_clawback',
      'Clawback for cancelled booking ' || p_booking_id::text
    );

    -- Decrement the user's points balance (floor at 0)
    UPDATE public.profiles
    SET points = GREATEST(0, COALESCE(points, 0) - v_points_clawed_back),
        updated_at = now()
    WHERE id = v_booking.user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'points_clawed_back', v_points_clawed_back
  );
END;
$$;

-- Only callable from service role (edge functions) — not from browser clients
REVOKE ALL ON FUNCTION public.cancel_booking_with_clawback(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_booking_with_clawback(UUID, UUID) FROM authenticated;
