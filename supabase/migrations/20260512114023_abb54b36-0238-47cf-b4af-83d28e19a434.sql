ALTER TABLE public.quick_competitions
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS uld_sets_per_player integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS uld_shots_per_set integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS uld_set_duration_seconds integer NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS uld_max_offline numeric,
  ADD COLUMN IF NOT EXISTS uld_logo_url text,
  ADD COLUMN IF NOT EXISTS uld_location_logo_url text;

ALTER TABLE public.quick_competitions
  DROP CONSTRAINT IF EXISTS quick_competitions_format_check;
ALTER TABLE public.quick_competitions
  ADD CONSTRAINT quick_competitions_format_check CHECK (format IN ('standard','uld'));

ALTER TABLE public.quick_competition_attempts
  ADD COLUMN IF NOT EXISTS set_number integer,
  ADD COLUMN IF NOT EXISTS shot_number integer,
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;