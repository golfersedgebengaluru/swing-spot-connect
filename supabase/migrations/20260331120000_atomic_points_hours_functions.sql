-- Atomic functions for points and hours to eliminate read-then-write race conditions.
-- These replace client-side SELECT + UPDATE patterns with single atomic DB operations.

-- Atomically increment a user's points balance.
-- Returns the new total. Safe to call concurrently.
CREATE OR REPLACE FUNCTION increment_user_points(p_user_id uuid, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_points integer;
BEGIN
  UPDATE profiles
  SET points = COALESCE(points, 0) + p_delta
  WHERE user_id = p_user_id
  RETURNING points INTO new_points;

  RETURN COALESCE(new_points, 0);
END;
$$;

-- Atomically decrement a user's points balance with balance check.
-- Raises an exception (surfaced as a 400-level error by PostgREST) if balance is insufficient.
-- Returns the new total.
CREATE OR REPLACE FUNCTION decrement_user_points_safe(p_user_id uuid, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_points integer;
  new_points integer;
BEGIN
  -- FOR UPDATE locks the row for the duration of this transaction,
  -- preventing concurrent reads of a stale balance.
  SELECT points INTO current_points
  FROM profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF COALESCE(current_points, 0) < p_delta THEN
    RAISE EXCEPTION 'Insufficient points: balance is %, need %',
      COALESCE(current_points, 0), p_delta;
  END IF;

  UPDATE profiles
  SET points = current_points - p_delta
  WHERE user_id = p_user_id
  RETURNING points INTO new_points;

  RETURN new_points;
END;
$$;

-- Atomic upsert for member_hours.
-- Creates the row on first purchase, or adds to hours_purchased atomically on subsequent ones.
-- Replaces the SELECT + UPDATE/INSERT pattern in the Razorpay payment handler.
CREATE OR REPLACE FUNCTION upsert_member_hours(p_user_id uuid, p_hours numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO member_hours (user_id, hours_purchased, hours_used)
  VALUES (p_user_id, p_hours, 0)
  ON CONFLICT (user_id) DO UPDATE
    SET hours_purchased = member_hours.hours_purchased + p_hours,
        updated_at      = now();
END;
$$;
