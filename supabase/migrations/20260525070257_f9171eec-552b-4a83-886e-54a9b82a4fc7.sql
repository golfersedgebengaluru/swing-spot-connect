
-- =========================================================
-- 1. Public profiles view (safe, no PII)
-- =========================================================
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT
  p.user_id,
  p.id              AS profile_id,
  p.display_name,
  p.avatar_url,
  p.handicap,
  p.total_rounds,
  p.points,
  p.preferred_city
FROM public.profiles p;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- =========================================================
-- 2. Coach -> Students contact view (display_name, email, phone only)
--    Only rows where the caller is the coach.
-- =========================================================
CREATE OR REPLACE VIEW public.coach_student_contacts
WITH (security_invoker = true) AS
SELECT
  cs.coach_id,
  cs.student_profile_id,
  p.id          AS profile_id,
  p.user_id,
  p.display_name,
  p.email,
  p.phone
FROM public.coach_students cs
JOIN public.coaches  c ON c.id = cs.coach_id
JOIN public.profiles p ON p.id = cs.student_profile_id
WHERE cs.is_active = true
  AND c.user_id = auth.uid();

GRANT SELECT ON public.coach_student_contacts TO authenticated;

-- =========================================================
-- 3. Student -> "My coach" contact view (display_name, email only)
-- =========================================================
CREATE OR REPLACE VIEW public.my_coach_contact
WITH (security_invoker = true) AS
SELECT
  cs.coach_id,
  cs.student_profile_id,
  c.user_id      AS coach_user_id,
  c.city         AS coach_city,
  cp.display_name AS coach_display_name,
  cp.email        AS coach_email
FROM public.coach_students cs
JOIN public.profiles sp ON sp.id = cs.student_profile_id
JOIN public.coaches  c  ON c.id  = cs.coach_id
JOIN public.profiles cp ON cp.user_id = c.user_id
WHERE cs.is_active = true
  AND sp.user_id = auth.uid();

GRANT SELECT ON public.my_coach_contact TO authenticated;

-- =========================================================
-- 4. Helper: is the calling user the coach of this student profile?
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_coach_of_student(_student_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_students cs
    JOIN public.coaches c ON c.id = cs.coach_id
    WHERE cs.student_profile_id = _student_profile_id
      AND cs.is_active = true
      AND c.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_coach_of_student(uuid) TO authenticated;

-- =========================================================
-- 5. Replace blanket SELECT policy on profiles
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins and site admins can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Coaches can read their assigned students"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_coach_of_student(id));

-- =========================================================
-- 6. Realtime: enable RLS and allow authenticated subscriptions.
--    Postgres changes payloads still respect source-table RLS.
-- =========================================================
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can subscribe to realtime" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);
