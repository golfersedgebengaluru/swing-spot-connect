
-- Tenants: kind + display_name
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_kind_check CHECK (kind IN ('full','qc_only'));

-- payment_gateways: tenant_id + relax city
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.payment_gateways ALTER COLUMN city DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_gateways_tenant_name_uidx
  ON public.payment_gateways(tenant_id, name) WHERE tenant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.payment_gateways_scope_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.tenant_id IS NULL AND NEW.city IS NULL)
     OR (NEW.tenant_id IS NOT NULL AND NEW.city IS NOT NULL) THEN
    RAISE EXCEPTION 'payment_gateways must have exactly one of tenant_id or city';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payment_gateways_scope_trg ON public.payment_gateways;
CREATE TRIGGER payment_gateways_scope_trg
  BEFORE INSERT OR UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.payment_gateways_scope_check();

-- qc_only_admins
CREATE TABLE IF NOT EXISTS public.qc_only_admins (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qc_only_admins TO authenticated;
GRANT ALL ON public.qc_only_admins TO service_role;
ALTER TABLE public.qc_only_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own qc memberships"
  ON public.qc_only_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "platform admin manages qc memberships"
  ON public.qc_only_admins FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Helper: is this user an admin of this qc tenant?
CREATE OR REPLACE FUNCTION public.is_qc_tenant_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.qc_only_admins
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  );
$$;

-- RLS additions: QC tenant admins can manage their tenant's QC data
CREATE POLICY "qc tenant admin manages competitions"
  ON public.quick_competitions FOR ALL TO authenticated
  USING (public.is_qc_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_qc_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "qc tenant admin manages entries"
  ON public.qc_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quick_competitions c
                 WHERE c.id = qc_entries.competition_id
                   AND public.is_qc_tenant_admin(auth.uid(), c.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quick_competitions c
                      WHERE c.id = qc_entries.competition_id
                        AND public.is_qc_tenant_admin(auth.uid(), c.tenant_id)));

CREATE POLICY "qc tenant admin manages players"
  ON public.quick_competition_players FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quick_competitions c
                 WHERE c.id = quick_competition_players.competition_id
                   AND public.is_qc_tenant_admin(auth.uid(), c.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quick_competitions c
                      WHERE c.id = quick_competition_players.competition_id
                        AND public.is_qc_tenant_admin(auth.uid(), c.tenant_id)));

CREATE POLICY "qc tenant admin manages categories"
  ON public.quick_competition_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quick_competitions c
                 WHERE c.id = quick_competition_categories.competition_id
                   AND public.is_qc_tenant_admin(auth.uid(), c.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quick_competitions c
                      WHERE c.id = quick_competition_categories.competition_id
                        AND public.is_qc_tenant_admin(auth.uid(), c.tenant_id)));

CREATE POLICY "qc tenant admin manages attempts"
  ON public.quick_competition_attempts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quick_competitions c
                 WHERE c.id = quick_competition_attempts.competition_id
                   AND public.is_qc_tenant_admin(auth.uid(), c.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quick_competitions c
                      WHERE c.id = quick_competition_attempts.competition_id
                        AND public.is_qc_tenant_admin(auth.uid(), c.tenant_id)));

CREATE POLICY "qc tenant admin reads audit"
  ON public.quick_competition_audit FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quick_competitions c
                 WHERE c.id = quick_competition_audit.competition_id
                   AND public.is_qc_tenant_admin(auth.uid(), c.tenant_id)));

-- payment_gateways: tenant admins manage their tenant's gateway rows
CREATE POLICY "qc tenant admin manages gateways"
  ON public.payment_gateways FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_qc_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_qc_tenant_admin(auth.uid(), tenant_id));
