-- Allow coaches to manage their own coach_students assignments
CREATE POLICY "Coaches manage their own students"
ON public.coach_students
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = coach_students.coach_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Coaches update their own students"
ON public.coach_students
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = coach_students.coach_id AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = coach_students.coach_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Coaches delete their own students"
ON public.coach_students
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = coach_students.coach_id AND c.user_id = auth.uid()
  )
);