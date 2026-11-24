CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_apple_user_id text;
  v_existing_profile_id uuid;
  v_dup record;
  v_merged_points integer := 0;
  v_signup_phone text := NULLIF(btrim(NEW.raw_user_meta_data->>'phone'), '');
BEGIN
  v_apple_user_id := (
    SELECT (identity_data->>'sub')
    FROM auth.identities
    WHERE user_id = NEW.id AND provider = 'apple'
    LIMIT 1
  );

  IF NEW.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE LOWER(email) = LOWER(NEW.email) AND user_id IS NULL
  ) THEN

    SELECT id INTO v_existing_profile_id
    FROM public.profiles
    WHERE LOWER(email) = LOWER(NEW.email) AND user_id IS NULL
    ORDER BY updated_at DESC
    LIMIT 1;

    FOR v_dup IN
      SELECT id, COALESCE(points, 0) as pts
      FROM public.profiles
      WHERE LOWER(email) = LOWER(NEW.email)
        AND user_id IS NULL
        AND id != v_existing_profile_id
    LOOP
      v_merged_points := v_merged_points + v_dup.pts;

      UPDATE public.member_hours SET user_id = v_existing_profile_id WHERE user_id = v_dup.id;
      UPDATE public.hours_transactions SET user_id = v_existing_profile_id WHERE user_id = v_dup.id;
      UPDATE public.points_transactions SET user_id = v_existing_profile_id WHERE user_id = v_dup.id;
      UPDATE public.notifications SET user_id = v_existing_profile_id WHERE user_id = v_dup.id;
      UPDATE public.bookings SET user_id = v_existing_profile_id WHERE user_id = v_dup.id;
      UPDATE public.orders SET user_id = v_existing_profile_id WHERE user_id = v_dup.id;
      UPDATE public.revenue_transactions SET user_id = v_existing_profile_id WHERE user_id = v_dup.id;
      UPDATE public.invoices SET customer_user_id = v_existing_profile_id WHERE customer_user_id = v_dup.id;
      UPDATE public.gifted_rewards SET user_id = v_existing_profile_id WHERE user_id = v_dup.id;
      UPDATE public.email_preferences SET user_id = v_existing_profile_id WHERE user_id = v_dup.id;
      UPDATE public.email_log SET user_id = v_existing_profile_id WHERE user_id = v_dup.id;
      UPDATE public.community_posts SET user_id = v_existing_profile_id WHERE user_id = v_dup.id;

      DELETE FROM public.profiles WHERE id = v_dup.id;
    END LOOP;

    -- A phone staff already recorded wins over the sign-up value
    UPDATE public.profiles
    SET user_id = NEW.id,
        display_name = COALESCE(display_name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        email = NEW.email,
        phone = COALESCE(NULLIF(btrim(phone), ''), v_signup_phone),
        apple_user_id = COALESCE(v_apple_user_id, apple_user_id),
        points = COALESCE(points, 0) + v_merged_points,
        user_type = CASE
          WHEN user_type IN ('guest', 'non-registered') THEN 'registered'
          ELSE user_type
        END,
        updated_at = now()
    WHERE id = v_existing_profile_id;

    UPDATE public.member_hours SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.hours_transactions SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.points_transactions SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.notifications SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.bookings SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.orders SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.revenue_transactions SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.invoices SET customer_user_id = NEW.id WHERE customer_user_id = v_existing_profile_id;
    UPDATE public.gifted_rewards SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.email_preferences SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.email_log SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.community_posts SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
  ELSE
    INSERT INTO public.profiles (user_id, display_name, email, apple_user_id, phone)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      NEW.email,
      v_apple_user_id,
      v_signup_phone
    );
  END IF;
  RETURN NEW;
END;
$function$;