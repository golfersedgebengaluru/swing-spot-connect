ALTER TABLE public.leagues
  ADD COLUMN peoria_adjustment_pct numeric NOT NULL DEFAULT 80,
  ADD COLUMN peoria_max_cap numeric NOT NULL DEFAULT 36;

ALTER TABLE public.leagues
  ADD CONSTRAINT leagues_peoria_adjustment_pct_check CHECK (peoria_adjustment_pct >= 0 AND peoria_adjustment_pct <= 100),
  ADD CONSTRAINT leagues_peoria_max_cap_check CHECK (peoria_max_cap >= 0);

COMMENT ON COLUMN public.leagues.peoria_adjustment_pct IS 'Percentage of the raw Peoria handicap actually applied (default 80). Applied before the max cap.';
COMMENT ON COLUMN public.leagues.peoria_max_cap IS 'Maximum Peoria handicap a player can receive after the adjustment factor (default 36).';