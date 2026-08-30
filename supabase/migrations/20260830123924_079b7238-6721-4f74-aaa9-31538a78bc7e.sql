-- 1. LIBRARY TABLES
CREATE TABLE public.coaching_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_categories TO authenticated;
GRANT ALL ON public.coaching_categories TO service_role;
ALTER TABLE public.coaching_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories readable by signed-in" ON public.coaching_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories managed by admins" ON public.coaching_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'site_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'site_admin'));

CREATE TABLE public.coaching_focuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category_id uuid REFERENCES public.coaching_categories(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_focuses TO authenticated;
GRANT ALL ON public.coaching_focuses TO service_role;
ALTER TABLE public.coaching_focuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "focuses readable by signed-in" ON public.coaching_focuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "focuses managed by admins" ON public.coaching_focuses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'site_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'site_admin'));

CREATE TABLE public.coaching_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category_id uuid REFERENCES public.coaching_categories(id),
  objective text,
  instructions text,
  recommended_reps text,
  video_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_drills TO authenticated;
GRANT ALL ON public.coaching_drills TO service_role;
ALTER TABLE public.coaching_drills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drills readable by signed-in" ON public.coaching_drills FOR SELECT TO authenticated USING (true);
CREATE POLICY "drills managed by admins" ON public.coaching_drills FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'site_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'site_admin'));

CREATE TABLE public.focus_drills (
  focus_id uuid NOT NULL REFERENCES public.coaching_focuses(id) ON DELETE CASCADE,
  drill_id uuid NOT NULL REFERENCES public.coaching_drills(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (focus_id, drill_id)
);
CREATE INDEX idx_focus_drills_drill ON public.focus_drills(drill_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.focus_drills TO authenticated;
GRANT ALL ON public.focus_drills TO service_role;
ALTER TABLE public.focus_drills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "focus_drills readable by signed-in" ON public.focus_drills FOR SELECT TO authenticated USING (true);
CREATE POLICY "focus_drills managed by admins" ON public.focus_drills FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'site_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'site_admin'));

-- 2. SESSION LINK TABLES (insert-only history)
CREATE TABLE public.session_focuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.coaching_sessions(id) ON DELETE CASCADE,
  focus_id uuid REFERENCES public.coaching_focuses(id),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, focus_id)
);
CREATE INDEX idx_session_focuses_focus ON public.session_focuses(focus_id);
GRANT SELECT, INSERT ON public.session_focuses TO authenticated;
GRANT ALL ON public.session_focuses TO service_role;
ALTER TABLE public.session_focuses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.session_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.coaching_sessions(id) ON DELETE CASCADE,
  drill_id uuid REFERENCES public.coaching_drills(id),
  focus_id uuid REFERENCES public.coaching_focuses(id),
  coach_note text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, drill_id),
  CONSTRAINT session_drills_note_len CHECK (coach_note IS NULL OR char_length(coach_note) <= 500)
);
CREATE INDEX idx_session_drills_drill ON public.session_drills(drill_id);
CREATE INDEX idx_session_drills_focus ON public.session_drills(focus_id);
GRANT SELECT, INSERT ON public.session_drills TO authenticated;
GRANT ALL ON public.session_drills TO service_role;
ALTER TABLE public.session_drills ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_coaching_session(_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coaching_sessions s
    WHERE s.id = _session_id
      AND (
        s.coach_user_id = auth.uid()
        OR s.student_user_id = auth.uid()
        OR s.coach_user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
        OR s.student_user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
        OR public.has_role(auth.uid(),'admin')
        OR public.has_role(auth.uid(),'site_admin')
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_write_coaching_session(_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coaching_sessions s
    WHERE s.id = _session_id
      AND (
        s.coach_user_id = auth.uid()
        OR s.coach_user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
        OR public.has_role(auth.uid(),'admin')
        OR public.has_role(auth.uid(),'site_admin')
      )
  )
$$;

CREATE POLICY "session_focuses readable by participants" ON public.session_focuses FOR SELECT TO authenticated
  USING (public.can_read_coaching_session(session_id));
CREATE POLICY "session_focuses insert by session coach" ON public.session_focuses FOR INSERT TO authenticated
  WITH CHECK (public.can_write_coaching_session(session_id));

CREATE POLICY "session_drills readable by participants" ON public.session_drills FOR SELECT TO authenticated
  USING (public.can_read_coaching_session(session_id));
CREATE POLICY "session_drills insert by session coach" ON public.session_drills FOR INSERT TO authenticated
  WITH CHECK (public.can_write_coaching_session(session_id));

-- 3. updated_at triggers
CREATE TRIGGER trg_coaching_categories_updated BEFORE UPDATE ON public.coaching_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coaching_focuses_updated BEFORE UPDATE ON public.coaching_focuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coaching_drills_updated BEFORE UPDATE ON public.coaching_drills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. SEED (idempotent)
INSERT INTO public.coaching_categories (name) VALUES
  ('Full Swing'), ('Ball Striking'), ('Short Game'), ('Putting')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.coaching_focuses (name, category_id)
SELECT f.name, c.id FROM (VALUES
  ('Ball Contact','Full Swing'),
  ('Tempo','Full Swing'),
  ('Rotation','Full Swing'),
  ('Balance','Full Swing'),
  ('Low Point','Ball Striking'),
  ('Impact','Ball Striking'),
  ('Chipping','Short Game'),
  ('Distance Control','Short Game'),
  ('Feel','Short Game'),
  ('Putting','Putting'),
  ('Start Line','Putting'),
  ('Face Control','Putting')
) AS f(name, cat)
JOIN public.coaching_categories c ON c.name = f.cat
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.coaching_drills (name, category_id, objective, instructions, recommended_reps)
SELECT d.name, c.id, d.objective, d.instructions, d.reps FROM (VALUES
  ('9-to-3 Half Swing','Full Swing',
   'Improve centred contact, control, tempo and body rotation.',
   'Make controlled swings from approximately 9 o''clock to 3 o''clock. Focus on solid ball contact, maintaining balance and rotating through to a controlled finish. Start with short irons and gradually increase speed.',
   '10-15 balls'),
  ('Tee-Behind-the-Ball','Ball Striking',
   'Improve low point control and ball-first contact.',
   'Place a tee in the ground a few inches behind the ball. Make swings that strike the ball without contacting the tee, encouraging a forward low point and clean impact.',
   '10-15 balls'),
  ('Feet-Together Swing','Full Swing',
   'Improve balance, tempo and centred strike.',
   'Stand with your feet together and make smooth, controlled swings. Keep your balance throughout and focus on a centred strike with a relaxed tempo.',
   '10-15 balls'),
  ('Landing-Spot Chipping','Short Game',
   'Improve distance control and feel around the green.',
   'Pick a landing spot short of the target and chip so the ball lands on that spot. Vary the landing spots and clubs to develop feel and distance control.',
   '10-20 chips'),
  ('Gate Putting Drill','Putting',
   'Improve putter-face control and starting line.',
   'Place two tees slightly wider than the putter head, creating a gate around the intended start line. Roll putts through the gate toward the target. Begin with short putts and increase the distance as control improves.',
   '10-20 putts')
) AS d(name, cat, objective, instructions, reps)
JOIN public.coaching_categories c ON c.name = d.cat
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.focus_drills (focus_id, drill_id)
SELECT f.id, dr.id FROM (VALUES
  ('9-to-3 Half Swing','Ball Contact'),
  ('9-to-3 Half Swing','Tempo'),
  ('9-to-3 Half Swing','Rotation'),
  ('9-to-3 Half Swing','Balance'),
  ('Tee-Behind-the-Ball','Ball Contact'),
  ('Tee-Behind-the-Ball','Low Point'),
  ('Tee-Behind-the-Ball','Impact'),
  ('Feet-Together Swing','Balance'),
  ('Feet-Together Swing','Tempo'),
  ('Feet-Together Swing','Ball Contact'),
  ('Landing-Spot Chipping','Chipping'),
  ('Landing-Spot Chipping','Distance Control'),
  ('Landing-Spot Chipping','Feel'),
  ('Gate Putting Drill','Putting'),
  ('Gate Putting Drill','Start Line'),
  ('Gate Putting Drill','Face Control')
) AS m(drill, focus)
JOIN public.coaching_drills dr ON dr.name = m.drill
JOIN public.coaching_focuses f ON f.name = m.focus
ON CONFLICT DO NOTHING;