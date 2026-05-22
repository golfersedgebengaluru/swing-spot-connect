
-- 1. consent_log (append-only audit)
CREATE TABLE public.consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  consent_type text NOT NULL CHECK (consent_type IN ('tos','privacy','marketing_email','marketing_whatsapp')),
  granted boolean NOT NULL,
  policy_version text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_consent_log_user ON public.consent_log(user_id, consent_type, created_at DESC);
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own consent" ON public.consent_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all consent" ON public.consent_log FOR SELECT TO authenticated USING (public.is_admin_or_site_admin(auth.uid()));
CREATE POLICY "Authenticated can insert own consent" ON public.consent_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Anon can insert consent at signup" ON public.consent_log FOR INSERT TO anon WITH CHECK (user_id IS NULL);

-- 2. policy_versions
CREATE TABLE public.policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  version text NOT NULL,
  content text NOT NULL,
  summary text,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES auth.users(id),
  UNIQUE (slug, version)
);
CREATE INDEX idx_policy_versions_slug ON public.policy_versions(slug, published_at DESC);
ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read policy versions" ON public.policy_versions FOR SELECT USING (true);
CREATE POLICY "Admins manage policy versions" ON public.policy_versions FOR ALL TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

-- 3. dsar_requests
CREATE TABLE public.dsar_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  file_size_bytes int,
  error text
);
CREATE INDEX idx_dsar_user ON public.dsar_requests(user_id, requested_at DESC);
ALTER TABLE public.dsar_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own DSAR" ON public.dsar_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all DSAR" ON public.dsar_requests FOR SELECT TO authenticated USING (public.is_admin_or_site_admin(auth.uid()));

-- 4. deletion_requests
CREATE TABLE public.deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled','failed')),
  error text
);
CREATE INDEX idx_deletion_status ON public.deletion_requests(status, requested_at DESC);
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own deletion" ON public.deletion_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage deletions" ON public.deletion_requests FOR ALL TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

-- 5. grievance_tickets (due_at maintained via trigger, not generated col)
CREATE TABLE public.grievance_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  name text,
  phone text,
  category text NOT NULL CHECK (category IN ('data_access','data_correction','data_deletion','consent_withdrawal','complaint','other')),
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  response text,
  responded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  due_at timestamptz
);
CREATE INDEX idx_grievance_status ON public.grievance_tickets(status, created_at DESC);
CREATE INDEX idx_grievance_user ON public.grievance_tickets(user_id) WHERE user_id IS NOT NULL;
ALTER TABLE public.grievance_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can file grievance" ON public.grievance_tickets FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "Users view own grievances" ON public.grievance_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all grievances" ON public.grievance_tickets FOR SELECT TO authenticated USING (public.is_admin_or_site_admin(auth.uid()));
CREATE POLICY "Admins update grievances" ON public.grievance_tickets FOR UPDATE TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()))
  WITH CHECK (public.is_admin_or_site_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_grievance_due_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.created_at IS NULL THEN NEW.created_at := now(); END IF;
  NEW.due_at := NEW.created_at + interval '30 days';
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_grievance_due_at BEFORE INSERT ON public.grievance_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_grievance_due_at();

-- 6. needs_reconsent helper
CREATE OR REPLACE FUNCTION public.needs_reconsent(_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH latest AS (
    SELECT slug, MAX(published_at) AS max_pub, (ARRAY_AGG(version ORDER BY published_at DESC))[1] AS version
    FROM public.policy_versions
    WHERE slug IN ('privacy','terms')
    GROUP BY slug
  ),
  user_consent AS (
    SELECT consent_type, MAX(created_at) AS last_consent
    FROM public.consent_log
    WHERE user_id = _user_id AND granted = true AND consent_type IN ('privacy','tos')
    GROUP BY consent_type
  )
  SELECT jsonb_build_object(
    'needs_reconsent', EXISTS (
      SELECT 1 FROM latest l
      LEFT JOIN user_consent uc
        ON (l.slug = 'privacy' AND uc.consent_type = 'privacy')
        OR (l.slug = 'terms' AND uc.consent_type = 'tos')
      WHERE uc.last_consent IS NULL OR l.max_pub > uc.last_consent
    ),
    'latest_privacy_version', (SELECT version FROM latest WHERE slug = 'privacy'),
    'latest_terms_version', (SELECT version FROM latest WHERE slug = 'terms')
  );
$$;

-- 7. record_consent helper
CREATE OR REPLACE FUNCTION public.record_consent(
  _consent_type text,
  _granted boolean,
  _policy_version text DEFAULT NULL,
  _email text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF _consent_type NOT IN ('tos','privacy','marketing_email','marketing_whatsapp') THEN
    RAISE EXCEPTION 'Invalid consent_type';
  END IF;
  INSERT INTO public.consent_log (user_id, email, consent_type, granted, policy_version, user_agent)
  VALUES (auth.uid(), _email, _consent_type, _granted, _policy_version, _user_agent)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.needs_reconsent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_consent(text, boolean, text, text, text) TO authenticated, anon;
