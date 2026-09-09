-- The single-writer function de-duplicates sales on their source reference,
-- which needs a unique index to enforce. Without it a replayed webhook or a
-- retried save could book the same sale twice.
CREATE UNIQUE INDEX IF NOT EXISTS revenue_transactions_source_ref_key
  ON public.revenue_transactions (source_ref)
  WHERE source_ref IS NOT NULL;