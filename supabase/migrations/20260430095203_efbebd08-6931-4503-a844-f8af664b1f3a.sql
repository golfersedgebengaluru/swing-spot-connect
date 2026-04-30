-- 1) Backfill: grant 'coach' role to anyone currently in coaches roster but missing the role
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT c.user_id, 'coach'::app_role
FROM public.coaches c
WHERE c.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = c.user_id AND ur.role = 'coach'
  );

-- 2) Trigger: keep user_roles in sync when a coach is inserted
CREATE OR REPLACE FUNCTION public.sync_coach_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'coach'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coaches_sync_role ON public.coaches;
CREATE TRIGGER trg_coaches_sync_role
AFTER INSERT ON public.coaches
FOR EACH ROW EXECUTE FUNCTION public.sync_coach_role();