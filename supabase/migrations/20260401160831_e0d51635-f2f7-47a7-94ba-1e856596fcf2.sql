CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_apple_user_id text;
  v_existing_profile_id uuid;
BEGIN
  -- Extract Apple user ID (sub) from provider identity
  v_apple_user_id := (
    SELECT (identity_data->>'sub')
    FROM auth.identities
    WHERE user_id = NEW.id AND provider = 'apple'
    LIMIT 1
  );

  -- Check if a pre-registered or admin-registered profile exists with this email (user_id IS NULL)
  IF NEW.email IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email AND user_id IS NULL) THEN
    -- Get the profile id (used as identifier in member_hours etc. for admin-registered users)
    SELECT id INTO v_existing_profile_id
    FROM public.profiles
    WHERE email = NEW.email AND user_id IS NULL
    LIMIT 1;

    -- Update the profile to link with auth user
    UPDATE public.profiles
    SET user_id = NEW.id,
        display_name = COALESCE(display_name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        email = NEW.email,
        apple_user_id = COALESCE(v_apple_user_id, apple_user_id),
        updated_at = now()
    WHERE id = v_existing_profile_id;

    -- Cascade: update related tables that used profile.id as user_id
    UPDATE public.member_hours SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.hours_transactions SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.points_transactions SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
    UPDATE public.notifications SET user_id = NEW.id WHERE user_id = v_existing_profile_id;
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