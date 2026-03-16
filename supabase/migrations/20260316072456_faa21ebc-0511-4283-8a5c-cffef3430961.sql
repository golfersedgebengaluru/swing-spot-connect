-- Add email column to profiles for pre-registration mapping
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Update the handle_new_user trigger to claim pre-registered profiles by email
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Check if a pre-registered profile exists with this email
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email AND user_id IS NULL) THEN
    UPDATE public.profiles
    SET user_id = NEW.id,
        display_name = COALESCE(display_name, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        updated_at = now()
    WHERE email = NEW.email AND user_id IS NULL;
  ELSE
    INSERT INTO public.profiles (user_id, display_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

-- Make user_id nullable for pre-registered profiles
ALTER TABLE public.profiles ALTER COLUMN user_id DROP NOT NULL;