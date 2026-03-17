
-- Fix the handle_new_user trigger to always populate email
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if a pre-registered profile exists with this email
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email AND user_id IS NULL) THEN
    UPDATE public.profiles
    SET user_id = NEW.id,
        display_name = COALESCE(display_name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        email = NEW.email,
        updated_at = now()
    WHERE email = NEW.email AND user_id IS NULL;
  ELSE
    INSERT INTO public.profiles (user_id, display_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email);
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill missing emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.email IS NULL OR p.email = '');
