
-- 1. Add vendor support to advance_transactions
ALTER TABLE public.advance_transactions
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'customer';

-- Make customer_id nullable (it was NOT NULL before)
ALTER TABLE public.advance_transactions
  ALTER COLUMN customer_id DROP NOT NULL;

-- Drop any prior version of the constraint, then re-add
ALTER TABLE public.advance_transactions
  DROP CONSTRAINT IF EXISTS advance_tx_entity_check;

ALTER TABLE public.advance_transactions
  ADD CONSTRAINT advance_tx_entity_check CHECK (
    (entity_type = 'customer' AND customer_id IS NOT NULL AND vendor_id IS NULL)
    OR
    (entity_type = 'vendor' AND vendor_id IS NOT NULL AND customer_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_advance_tx_vendor ON public.advance_transactions(vendor_id) WHERE vendor_id IS NOT NULL;

-- 2. Helper: vendor advance balance
CREATE OR REPLACE FUNCTION public.get_vendor_advance_balance(p_vendor_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN transaction_type = 'credit' THEN amount ELSE -amount END
  ), 0)
  FROM public.advance_transactions
  WHERE vendor_id = p_vendor_id;
$$;

-- 3. Mark expense as settled (add settlement tracking columns on expenses)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS settled_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_settled boolean NOT NULL DEFAULT false;

-- 4. RLS: existing policies on advance_transactions should already allow admins; ensure vendor rows are covered.
-- We re-create a permissive admin policy if missing.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='advance_transactions' AND policyname='Admins manage vendor advances'
  ) THEN
    CREATE POLICY "Admins manage vendor advances" ON public.advance_transactions
      FOR ALL TO authenticated
      USING (public.is_admin_or_site_admin(auth.uid()) AND public.has_city_access(auth.uid(), city))
      WITH CHECK (public.is_admin_or_site_admin(auth.uid()) AND public.has_city_access(auth.uid(), city));
  END IF;
END $$;
