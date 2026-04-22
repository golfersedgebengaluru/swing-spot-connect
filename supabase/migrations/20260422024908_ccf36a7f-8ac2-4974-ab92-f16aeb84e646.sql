ALTER TABLE public.bays
  ADD COLUMN IF NOT EXISTS extended_open_time time,
  ADD COLUMN IF NOT EXISTS extended_close_time time,
  ADD COLUMN IF NOT EXISTS extended_hours_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS extended_hours_access boolean NOT NULL DEFAULT false;