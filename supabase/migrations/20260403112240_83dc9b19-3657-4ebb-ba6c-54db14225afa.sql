
CREATE OR REPLACE FUNCTION public.increment_user_points(p_user_id uuid, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_total integer;
BEGIN
  UPDATE profiles
  SET points = COALESCE(points, 0) + p_delta,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING points INTO v_new_total;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  RETURN v_new_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_user_points_safe(p_user_id uuid, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
  v_new_total integer;
BEGIN
  SELECT COALESCE(points, 0) INTO v_current
  FROM profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  IF v_current < p_delta THEN
    RAISE EXCEPTION 'Insufficient points: have %, need %', v_current, p_delta;
  END IF;

  UPDATE profiles
  SET points = v_current - p_delta,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING points INTO v_new_total;

  RETURN v_new_total;
END;
$$;
