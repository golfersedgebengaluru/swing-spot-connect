ALTER TABLE public.coaching_sessions
  ADD COLUMN IF NOT EXISTS other_url text,
  ADD COLUMN IF NOT EXISTS other_label text;