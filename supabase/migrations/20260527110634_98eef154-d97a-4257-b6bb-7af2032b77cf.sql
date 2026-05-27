
-- 1) Backfill: ensure all emails are lowercased
UPDATE public.profiles
SET email = LOWER(email)
WHERE email IS NOT NULL AND email <> LOWER(email);

-- 2) Partial unique index: no two unlinked profiles can share an email
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unlinked_unique
  ON public.profiles (LOWER(email))
  WHERE user_id IS NULL AND email IS NOT NULL AND email <> '';

-- 3) Guard trigger: prevent creating/updating an unlinked profile with an email
-- that is already used by ANY other profile (linked or unlinked).
CREATE OR REPLACE FUNCTION public.prevent_duplicate_unlinked_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.email IS NOT NULL AND NEW.email <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE LOWER(email) = LOWER(NEW.email)
        AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'A member with email % already exists. Open their profile instead of creating a duplicate.', NEW.email
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_unlinked_profile_email ON public.profiles;
CREATE TRIGGER trg_prevent_duplicate_unlinked_profile_email
  BEFORE INSERT OR UPDATE OF email, user_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_unlinked_profile_email();
