CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_apple_user_id text;
  v_existing_profile_id uuid;
  v_old_user_id uuid;
BEGIN
  -- Extract Apple user ID (sub) from provider identity
  v_apple_user_id := (
    SELECT (identity_data->>'sub')
    FROM auth.identities
    WHERE user_id = NEW.id AND provider = 'apple'
    LIMIT 1
  );

  -- Check if a pre-registered profile exists with this email (user_id IS NULL)
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email AND user_id IS NULL) THEN
    UPDATE public.profiles
    SET user_id = NEW.id,
        display_name = COALESCE(display_name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        email = NEW.email,
        apple_user_id = COALESCE(v_apple_user_id, apple_user_id),
        updated_at = now()
    WHERE email = NEW.email AND user_id IS NULL;
  -- Check if an admin-registered profile exists with this email (has a generated user_id, not linked to auth)
  ELSIF NEW.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.email = NEW.email
      AND p.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p.user_id)
  ) THEN
    -- Get the old generated user_id so we can cascade updates
    SELECT p.id, p.user_id INTO v_existing_profile_id, v_old_user_id
    FROM public.profiles p
    WHERE p.email = NEW.email
      AND p.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p.user_id)
    LIMIT 1;

    -- Update the profile to use the real auth user_id
    UPDATE public.profiles
    SET user_id = NEW.id,
        display_name = COALESCE(display_name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        email = NEW.email,
        apple_user_id = COALESCE(v_apple_user_id, apple_user_id),
        updated_at = now()
    WHERE id = v_existing_profile_id;

    -- Cascade user_id change to related tables
    UPDATE public.member_hours SET user_id = NEW.id WHERE user_id = v_old_user_id;
    UPDATE public.hours_transactions SET user_id = NEW.id WHERE user_id = v_old_user_id;
    UPDATE public.points_transactions SET user_id = NEW.id WHERE user_id = v_old_user_id;
    UPDATE public.notifications SET user_id = NEW.id WHERE user_id = v_old_user_id;
  ELSE
    INSERT INTO public.profiles (user_id, display_name, email, apple_user_id)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      NEW.email,
      v_apple_user_id
    );
  END IF;
  RETURN NEW;
END;
$function$;