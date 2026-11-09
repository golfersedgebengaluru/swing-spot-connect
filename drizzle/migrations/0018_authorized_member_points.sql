-- One authorized points operation for staff awards, staff redemptions and member self-redemptions.
CREATE OR REPLACE FUNCTION public.adjust_member_points(
  p_member_ref uuid,
  p_kind text,
  p_points integer,
  p_description text DEFAULT NULL,
  p_reward_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_staff boolean;
  v_profile public.profiles%ROWTYPE;
  v_reward public.rewards%ROWTYPE;
  v_current integer;
  v_total integer;
  v_description text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('allocation', 'redemption') THEN
    RAISE EXCEPTION 'Unsupported points action' USING ERRCODE = '22023';
  END IF;
  IF p_points IS NULL OR p_points <= 0 THEN
    RAISE EXCEPTION 'Points must be a positive whole number' USING ERRCODE = '22023';
  END IF;

  v_staff := COALESCE(public.is_admin_or_site_admin(v_actor), false);

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_member_ref FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_member_ref FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_kind = 'allocation' AND NOT v_staff THEN
    RAISE EXCEPTION 'Only staff can award points' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'redemption' AND NOT v_staff AND v_profile.user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'You can only redeem your own points' USING ERRCODE = '42501';
  END IF;

  v_current := COALESCE(v_profile.points, 0);

  IF p_kind = 'redemption' THEN
    IF p_reward_id IS NOT NULL THEN
      SELECT * INTO v_reward FROM public.rewards WHERE id = p_reward_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Reward not found' USING ERRCODE = 'P0002';
      END IF;
    END IF;
    IF NOT v_staff THEN
      IF p_reward_id IS NULL OR NOT COALESCE(v_reward.is_available, false) THEN
        RAISE EXCEPTION 'This reward is not available' USING ERRCODE = '22023';
      END IF;
      IF p_points <> v_reward.points_cost THEN
        RAISE EXCEPTION 'This reward''s points cost has changed. Refresh and try again.' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF v_current < p_points THEN
      RAISE EXCEPTION 'Insufficient points: have %, need %', v_current, p_points USING ERRCODE = '22023';
    END IF;
    v_total := v_current - p_points;
    v_description := 'Redeemed: ' || COALESCE(v_reward.name, NULLIF(btrim(p_description), ''), 'Reward');
  ELSE
    v_total := v_current + p_points;
    v_description := NULLIF(btrim(p_description), '');
  END IF;

  UPDATE public.profiles SET points = v_total, updated_at = now() WHERE id = v_profile.id;

  INSERT INTO public.points_transactions (user_id, type, points, description, reward_id, created_by)
  VALUES (p_member_ref, p_kind, p_points, v_description, p_reward_id, v_actor);

  RETURN jsonb_build_object('total_points', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_member_points(uuid, text, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_member_points(uuid, text, integer, text, uuid) TO authenticated, service_role;

-- Raw balance helpers are for backend jobs only.
REVOKE EXECUTE ON FUNCTION public.increment_user_points(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_user_points_safe(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_user_points(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrement_user_points_safe(uuid, integer) TO service_role;

-- Members cannot set their own balance by editing their profile.
CREATE OR REPLACE FUNCTION public.guard_profile_points()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND NOT COALESCE(public.is_admin_or_site_admin(auth.uid()), false) THEN
    IF TG_OP = 'INSERT' THEN
      NEW.points := 0;
    ELSIF NEW.points IS DISTINCT FROM OLD.points THEN
      RAISE EXCEPTION 'Points can only be changed through an authorized points action' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_points ON public.profiles;
CREATE TRIGGER guard_profile_points
BEFORE INSERT OR UPDATE OF points ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_points();