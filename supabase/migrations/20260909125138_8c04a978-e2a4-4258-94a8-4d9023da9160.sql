-- A partial unique index can't back ON CONFLICT (source_ref); a plain unique
-- index can, and still allows many rows with no source reference (NULLs are
-- always distinct in Postgres).
DROP INDEX IF EXISTS public.revenue_transactions_source_ref_key;
CREATE UNIQUE INDEX IF NOT EXISTS revenue_transactions_source_ref_key
  ON public.revenue_transactions (source_ref);