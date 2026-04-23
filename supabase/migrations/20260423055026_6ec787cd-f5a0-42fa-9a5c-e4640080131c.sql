-- Add par per hole to league_rounds
ALTER TABLE public.league_rounds
ADD COLUMN IF NOT EXISTS par_per_hole integer[] NOT NULL DEFAULT '{}'::integer[];

COMMENT ON COLUMN public.league_rounds.par_per_hole IS 'Par values per hole for this round (length matches league.scoring_holes when configured; empty if unset).';