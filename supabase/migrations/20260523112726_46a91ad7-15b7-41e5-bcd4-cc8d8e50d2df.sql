
-- ============ PROFILES: minor / parental consent fields ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS parent_email text,
  ADD COLUMN IF NOT EXISTS parent_consent_status text
    CHECK (parent_consent_status IN ('not_required','pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS parent_consent_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS parent_consent_at timestamptz;

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.age_years(_dob date)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _dob IS NULL THEN NULL
              ELSE EXTRACT(YEAR FROM AGE(CURRENT_DATE, _dob))::int END
$$;

CREATE OR REPLACE FUNCTION public.is_minor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.age_years(date_of_birth) < 18, false)
  FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- ============ COOKIE CONSENTS ============
CREATE TABLE IF NOT EXISTS public.cookie_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  necessary boolean NOT NULL DEFAULT true,
  analytics boolean NOT NULL DEFAULT false,
  marketing boolean NOT NULL DEFAULT false,
  policy_version text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_user ON public.cookie_consents(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cookie_consents_session ON public.cookie_consents(session_id);

ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record a cookie consent"
  ON public.cookie_consents FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Users can read their own cookie consents"
  ON public.cookie_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all cookie consents"
  ON public.cookie_consents FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ RETENTION RUNS ============
CREATE TABLE IF NOT EXISTS public.retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  rows_anonymised int NOT NULL DEFAULT 0,
  rows_purged_consent int NOT NULL DEFAULT 0,
  rows_purged_guests int NOT NULL DEFAULT 0,
  duration_ms int,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed','partial')),
  error text
);
ALTER TABLE public.retention_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view retention runs"
  ON public.retention_runs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============ NOMINATIONS ============
CREATE TABLE IF NOT EXISTS public.nominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nominee_name text NOT NULL,
  nominee_email text NOT NULL,
  nominee_phone text,
  relationship text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','invoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_nominations_active_per_user
  ON public.nominations(user_id) WHERE status = 'active';

ALTER TABLE public.nominations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own nominations select"
  ON public.nominations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users manage their own nominations insert"
  ON public.nominations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage their own nominations update"
  ON public.nominations FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage their own nominations delete"
  ON public.nominations FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read all nominations"
  ON public.nominations FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_nominations_updated_at
  BEFORE UPDATE ON public.nominations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Parental consent token lookup (public, for /parental-consent/:token) ============
CREATE OR REPLACE FUNCTION public.lookup_parental_consent_token(_token text)
RETURNS TABLE(user_id uuid, display_name text, parent_email text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id, display_name, parent_email, parent_consent_status
  FROM public.profiles
  WHERE parent_consent_token = _token
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.confirm_parental_consent(_token text, _approve boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.profiles
   WHERE parent_consent_token = _token AND parent_consent_status = 'pending' LIMIT 1;
  IF v_user IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.profiles
     SET parent_consent_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         parent_consent_at = now(),
         parent_consent_token = NULL
   WHERE user_id = v_user;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.lookup_parental_consent_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_parental_consent(text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.age_years(date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_minor(uuid) TO authenticated;
