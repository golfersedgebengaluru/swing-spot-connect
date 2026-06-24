ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS gst_mode text NOT NULL DEFAULT 'none' CHECK (gst_mode IN ('none','inclusive','exclusive')),
  ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sac_code text NOT NULL DEFAULT '9996';

ALTER TABLE public.legacy_league_team_registrations
  ADD COLUMN IF NOT EXISTS gst_mode text,
  ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS sac_code text,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS gst_amount numeric(10,2);

ALTER TABLE public.pending_legacy_league_team_registrations
  ADD COLUMN IF NOT EXISTS gst_mode text,
  ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS sac_code text,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS gst_amount numeric(10,2);