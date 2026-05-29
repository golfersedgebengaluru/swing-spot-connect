ALTER TABLE public.quick_competitions
  ADD COLUMN IF NOT EXISTS logos_mode TEXT NOT NULL DEFAULT 'single'
  CHECK (logos_mode IN ('single', 'multi'));

-- Backfill ULD comps that already have both logos to 'multi'
UPDATE public.quick_competitions
  SET logos_mode = 'multi'
  WHERE format = 'uld' AND (uld_logo_url IS NOT NULL OR uld_location_logo_url IS NOT NULL);