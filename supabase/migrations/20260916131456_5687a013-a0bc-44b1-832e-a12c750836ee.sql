ALTER TABLE public.qc_entries
  ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN guest_claim_hash text;

ALTER TABLE public.qc_entries
  ADD CONSTRAINT qc_entries_exactly_one_owner CHECK (
    (owner_id IS NOT NULL AND guest_claim_hash IS NULL)
    OR (owner_id IS NULL AND guest_claim_hash IS NOT NULL)
  );

CREATE INDEX idx_qc_entries_owner
  ON public.qc_entries(owner_id, competition_id)
  WHERE owner_id IS NOT NULL;

CREATE UNIQUE INDEX idx_qc_entries_guest_claim_hash
  ON public.qc_entries(guest_claim_hash)
  WHERE guest_claim_hash IS NOT NULL;

DROP POLICY IF EXISTS "qc entries owner select" ON public.qc_entries;
DROP POLICY IF EXISTS "qc entries public insert" ON public.qc_entries;

CREATE POLICY "qc entries authenticated owner select"
ON public.qc_entries
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

REVOKE ALL ON public.qc_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.qc_entries FROM authenticated;
GRANT SELECT ON public.qc_entries TO authenticated;
GRANT ALL ON public.qc_entries TO service_role;