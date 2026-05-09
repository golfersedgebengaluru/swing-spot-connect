
CREATE TABLE public.quick_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'm' CHECK (unit IN ('m', 'yd')),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 999),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  sponsor_enabled boolean NOT NULL DEFAULT false,
  sponsor_logo_url text,
  longest_winner_player_id uuid,
  longest_winner_value numeric,
  straightest_winner_player_id uuid,
  straightest_winner_value numeric,
  longest_card_url text,
  straightest_card_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quick_comp_tenant ON public.quick_competitions(tenant_id, created_at DESC);

CREATE TABLE public.quick_competition_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.quick_competitions(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_qc_players_comp ON public.quick_competition_players(competition_id);

CREATE TABLE public.quick_competition_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.quick_competitions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.quick_competition_players(id) ON DELETE CASCADE,
  distance numeric NOT NULL CHECK (distance >= 0),
  offline numeric NOT NULL CHECK (offline >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_qc_attempts_comp ON public.quick_competition_attempts(competition_id, created_at);
CREATE INDEX idx_qc_attempts_player ON public.quick_competition_attempts(player_id);

CREATE TABLE public.quick_competition_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.quick_competitions(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_qc_audit_comp ON public.quick_competition_audit(competition_id, created_at DESC);

CREATE TRIGGER trg_qc_updated
BEFORE UPDATE ON public.quick_competitions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.quick_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_competition_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_competition_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_competition_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qc public read" ON public.quick_competitions FOR SELECT USING (true);
CREATE POLICY "qc players public read" ON public.quick_competition_players FOR SELECT USING (true);
CREATE POLICY "qc attempts public read" ON public.quick_competition_attempts FOR SELECT USING (true);

CREATE POLICY "qc admin all"
ON public.quick_competitions FOR ALL
TO authenticated
USING (public.is_franchise_or_site_admin(auth.uid(), tenant_id))
WITH CHECK (public.is_franchise_or_site_admin(auth.uid(), tenant_id));

CREATE POLICY "qc players admin all"
ON public.quick_competition_players FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.quick_competitions c WHERE c.id = competition_id AND public.is_franchise_or_site_admin(auth.uid(), c.tenant_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.quick_competitions c WHERE c.id = competition_id AND public.is_franchise_or_site_admin(auth.uid(), c.tenant_id)));

CREATE POLICY "qc attempts admin all"
ON public.quick_competition_attempts FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.quick_competitions c WHERE c.id = competition_id AND public.is_franchise_or_site_admin(auth.uid(), c.tenant_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.quick_competitions c WHERE c.id = competition_id AND public.is_franchise_or_site_admin(auth.uid(), c.tenant_id)));

CREATE POLICY "qc audit admin read"
ON public.quick_competition_audit FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.quick_competitions c WHERE c.id = competition_id AND public.is_franchise_or_site_admin(auth.uid(), c.tenant_id)));

CREATE POLICY "qc audit admin insert"
ON public.quick_competition_audit FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.quick_competitions c WHERE c.id = competition_id AND public.is_franchise_or_site_admin(auth.uid(), c.tenant_id)));

INSERT INTO storage.buckets (id, name, public)
VALUES ('quick-comp-sponsors', 'quick-comp-sponsors', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "qc sponsor public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'quick-comp-sponsors');

CREATE POLICY "qc sponsor admin upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'quick-comp-sponsors' AND public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "qc sponsor admin update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'quick-comp-sponsors' AND public.is_admin_or_site_admin(auth.uid()));

CREATE POLICY "qc sponsor admin delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'quick-comp-sponsors' AND public.is_admin_or_site_admin(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_competitions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_competition_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_competition_attempts;
