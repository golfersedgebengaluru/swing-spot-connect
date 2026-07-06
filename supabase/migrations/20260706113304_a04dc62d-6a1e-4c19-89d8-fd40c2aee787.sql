
-- Par sets: add course_name
ALTER TABLE public.league_par_sets ADD COLUMN IF NOT EXISTS course_name text;
UPDATE public.league_par_sets SET course_name = name WHERE course_name IS NULL OR course_name = '';
ALTER TABLE public.league_par_sets ALTER COLUMN course_name SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS league_par_sets_unique_course_software
  ON public.league_par_sets(league_id, course_name, software);

-- Locations: add software, backfill from par_set_id when present
ALTER TABLE public.league_locations ADD COLUMN IF NOT EXISTS software text;
UPDATE public.league_locations l
   SET software = ps.software
  FROM public.league_par_sets ps
 WHERE l.par_set_id = ps.id
   AND (l.software IS NULL OR l.software = '');
UPDATE public.league_locations SET software = 'TGC' WHERE software IS NULL OR software = '';
ALTER TABLE public.league_locations ALTER COLUMN software SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'league_locations_software_check'
  ) THEN
    ALTER TABLE public.league_locations
      ADD CONSTRAINT league_locations_software_check CHECK (software IN ('TGC','GSPro','Other'));
  END IF;
END $$;

-- Rounds: add course_name (nullable; par lookup falls back to round.par_per_hole if unset)
ALTER TABLE public.league_rounds ADD COLUMN IF NOT EXISTS course_name text;

-- Drop legacy per-location par set link
ALTER TABLE public.league_locations DROP COLUMN IF EXISTS par_set_id;
