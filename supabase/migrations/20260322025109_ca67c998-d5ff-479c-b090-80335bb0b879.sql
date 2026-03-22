
-- Add apple_user_id column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS apple_user_id text UNIQUE;

-- Update handle_new_user trigger to store Apple sub
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_apple_user_id text;
BEGIN
  -- Extract Apple user ID (sub) from provider identity
  v_apple_user_id := (
    SELECT (identity_data->>'sub')
    FROM auth.identities
    WHERE user_id = NEW.id AND provider = 'apple'
    LIMIT 1
  );

  -- Check if a pre-registered profile exists with this email
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email AND user_id IS NULL) THEN
    UPDATE public.profiles
    SET user_id = NEW.id,
        display_name = COALESCE(display_name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        email = NEW.email,
        apple_user_id = COALESCE(v_apple_user_id, apple_user_id),
        updated_at = now()
    WHERE email = NEW.email AND user_id IS NULL;
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
