-- Coach <-> Student assignment table.
-- Uses profiles.id (not auth user_id) so it works for both registered users
-- and pre-registered/walk-in profiles.
CREATE TABLE public.coach_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by UUID,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enforce: one coach per student (the requested 1:N relationship).
CREATE UNIQUE INDEX idx_coach_students_unique_student
  ON public.coach_students(student_profile_id) WHERE is_active = true;

CREATE INDEX idx_coach_students_coach ON public.coach_students(coach_id);

ALTER TABLE public.coach_students ENABLE ROW LEVEL SECURITY;

-- Admins / site-admins manage all
CREATE POLICY "Admins manage coach-student links"
  ON public.coach_students FOR ALL
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

-- A coach can view their own roster
CREATE POLICY "Coaches view their own students"
  ON public.coach_students FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.coaches c
      WHERE c.id = coach_students.coach_id AND c.user_id = auth.uid()
    )
  );

-- A registered student can view their own assignment
CREATE POLICY "Students view their own coach"
  ON public.coach_students FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = coach_students.student_profile_id AND p.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_coach_students_updated_at
  BEFORE UPDATE ON public.coach_students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();