ALTER TABLE public.bay_config
ADD COLUMN IF NOT EXISTS cancellation_fee_pct numeric NOT NULL DEFAULT 10
CHECK (cancellation_fee_pct >= 0 AND cancellation_fee_pct <= 100);