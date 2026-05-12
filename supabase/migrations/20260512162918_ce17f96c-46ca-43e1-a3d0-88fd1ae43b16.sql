-- Phase 1: Categories support for Quick Competitions

-- 1. Add categories_enabled + category_winners to quick_competitions
ALTER TABLE public.quick_competitions
  ADD COLUMN IF NOT EXISTS categories_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_winners jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. New table: quick_competition_categories
CREATE TABLE IF NOT EXISTS public.quick_competition_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.quick_competitions(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS quick_competition_categories_comp_name_idx
  ON public.quick_competition_categories (competition_id, lower(name));

CREATE INDEX IF NOT EXISTS quick_competition_categories_comp_idx
  ON public.quick_competition_categories (competition_id);

ALTER TABLE public.quick_competition_categories ENABLE ROW LEVEL SECURITY;

-- Mirror access rules from quick_competition_players (tenant-scoped via parent comp)
CREATE POLICY "Categories are viewable by everyone"
  ON public.quick_competition_categories
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage categories"
  ON public.quick_competition_categories
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'site_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'site_admin'::app_role)
  );

-- 3. Add category_id to quick_competition_players
ALTER TABLE public.quick_competition_players
  ADD COLUMN IF NOT EXISTS category_id uuid
    REFERENCES public.quick_competition_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quick_competition_players_category_idx
  ON public.quick_competition_players (category_id);

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_competition_categories;