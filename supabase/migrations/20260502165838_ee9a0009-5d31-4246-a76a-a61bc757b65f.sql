
-- Add jsonb array columns for multi-link support on coaching sessions
ALTER TABLE public.coaching_sessions
  ADD COLUMN IF NOT EXISTS onform_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sportsbox_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS superspeed_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS other_links jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill existing single-URL fields into new arrays (only where arrays are still empty)
UPDATE public.coaching_sessions
SET onform_links = jsonb_build_array(jsonb_build_object('url', onform_url, 'label', ''))
WHERE onform_url IS NOT NULL AND onform_url <> '' AND onform_links = '[]'::jsonb;

UPDATE public.coaching_sessions
SET sportsbox_links = jsonb_build_array(jsonb_build_object('url', sportsbox_url, 'label', ''))
WHERE sportsbox_url IS NOT NULL AND sportsbox_url <> '' AND sportsbox_links = '[]'::jsonb;

UPDATE public.coaching_sessions
SET superspeed_links = jsonb_build_array(jsonb_build_object('url', superspeed_url, 'label', ''))
WHERE superspeed_url IS NOT NULL AND superspeed_url <> '' AND superspeed_links = '[]'::jsonb;

UPDATE public.coaching_sessions
SET other_links = jsonb_build_array(jsonb_build_object('url', other_url, 'label', COALESCE(other_label, '')))
WHERE other_url IS NOT NULL AND other_url <> '' AND other_links = '[]'::jsonb;
