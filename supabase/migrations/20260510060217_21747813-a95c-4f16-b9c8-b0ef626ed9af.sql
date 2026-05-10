
ALTER TABLE public.quick_competitions
  ADD COLUMN entry_type text NOT NULL DEFAULT 'free' CHECK (entry_type IN ('free','paid')),
  ADD COLUMN entry_fee numeric(10,2),
  ADD COLUMN entry_currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN refunds_allowed boolean NOT NULL DEFAULT false;

CREATE TABLE public.qc_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.quick_competitions(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.quick_competition_players(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  phone text NOT NULL,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  razorpay_order_id text,
  razorpay_payment_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','failed')),
  refund_id text,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, phone)
);
CREATE INDEX idx_qc_entries_comp ON public.qc_entries(competition_id, created_at DESC);
CREATE INDEX idx_qc_entries_order ON public.qc_entries(razorpay_order_id);

CREATE TRIGGER trg_qc_entries_updated
BEFORE UPDATE ON public.qc_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.qc_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qc entries public read"
ON public.qc_entries FOR SELECT
USING (true);

CREATE POLICY "qc entries public insert"
ON public.qc_entries FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quick_competitions c
    WHERE c.id = competition_id
      AND c.entry_type = 'paid'
      AND c.status = 'active'
  )
);

CREATE POLICY "qc entries admin all"
ON public.qc_entries FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.quick_competitions c WHERE c.id = competition_id AND public.is_franchise_or_site_admin(auth.uid(), c.tenant_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.quick_competitions c WHERE c.id = competition_id AND public.is_franchise_or_site_admin(auth.uid(), c.tenant_id)));

ALTER PUBLICATION supabase_realtime ADD TABLE public.qc_entries;
