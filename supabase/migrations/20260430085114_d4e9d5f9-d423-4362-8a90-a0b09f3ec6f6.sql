CREATE TABLE public.coaches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  city TEXT NOT NULL,
  bio TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, city)
);
CREATE INDEX idx_coaches_user_id ON public.coaches(user_id);
CREATE INDEX idx_coaches_city ON public.coaches(city);
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.coaching_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_user_id UUID NOT NULL,
  student_user_id UUID NOT NULL,
  city TEXT NOT NULL,
  session_date DATE NOT NULL,
  notes TEXT,
  drills TEXT,
  progress_summary TEXT,
  onform_url TEXT,
  sportsbox_url TEXT,
  superspeed_url TEXT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coaching_sessions_student ON public.coaching_sessions(student_user_id, session_date DESC);
CREATE INDEX idx_coaching_sessions_coach ON public.coaching_sessions(coach_user_id, session_date DESC);
CREATE INDEX idx_coaching_sessions_city ON public.coaching_sessions(city);
ALTER TABLE public.coaching_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_coach(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'coach'
  )
$$;

CREATE POLICY "View active coaches" ON public.coaches FOR SELECT TO authenticated
USING (is_active = true OR public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins manage coaches" ON public.coaches FOR ALL TO authenticated
USING (public.has_city_access(auth.uid(), city))
WITH CHECK (public.has_city_access(auth.uid(), city));

CREATE POLICY "Students view own sessions" ON public.coaching_sessions FOR SELECT TO authenticated
USING (auth.uid() = student_user_id);

CREATE POLICY "Coaches view own sessions" ON public.coaching_sessions FOR SELECT TO authenticated
USING (auth.uid() = coach_user_id);

CREATE POLICY "Admins view all city sessions" ON public.coaching_sessions FOR SELECT TO authenticated
USING (public.has_city_access(auth.uid(), city));

CREATE POLICY "Coaches create own sessions" ON public.coaching_sessions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = coach_user_id AND public.is_coach(auth.uid()));

CREATE POLICY "Admins create sessions in city" ON public.coaching_sessions FOR INSERT TO authenticated
WITH CHECK (public.has_city_access(auth.uid(), city));

CREATE POLICY "Coaches update own sessions" ON public.coaching_sessions FOR UPDATE TO authenticated
USING (auth.uid() = coach_user_id)
WITH CHECK (auth.uid() = coach_user_id);

CREATE POLICY "Admins update city sessions" ON public.coaching_sessions FOR UPDATE TO authenticated
USING (public.has_city_access(auth.uid(), city))
WITH CHECK (public.has_city_access(auth.uid(), city));

CREATE POLICY "Coaches delete own sessions" ON public.coaching_sessions FOR DELETE TO authenticated
USING (auth.uid() = coach_user_id);

CREATE POLICY "Admins delete city sessions" ON public.coaching_sessions FOR DELETE TO authenticated
USING (public.has_city_access(auth.uid(), city));

CREATE TRIGGER update_coaches_updated_at
BEFORE UPDATE ON public.coaches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_coaching_sessions_updated_at
BEFORE UPDATE ON public.coaching_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();