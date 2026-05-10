-- Categories for Quick Competitions
CREATE TABLE public.quick_competition_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.quick_competitions(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX qc_categories_comp_name_uidx
  ON public.quick_competition_categories (competition_id, lower(name));
CREATE INDEX qc_categories_comp_idx
  ON public.quick_competition_categories (competition_id);

ALTER TABLE public.quick_competition_categories ENABLE ROW LEVEL SECURITY;

-- Mirror existing players-table policies: anyone can read (bay screen is public),
-- only authorized admins on the parent competition can write.
CREATE POLICY "qc_categories_select_public"
  ON public.quick_competition_categories FOR SELECT
  USING (true);

CREATE POLICY "qc_categories_admin_write"
  ON public.quick_competition_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.quick_competitions c
      WHERE c.id = competition_id
        AND public.is_franchise_or_site_admin(auth.uid(), c.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quick_competitions c
      WHERE c.id = competition_id
        AND public.is_franchise_or_site_admin(auth.uid(), c.tenant_id)
    )
  );

-- Player → category link (nullable = "Unassigned")
ALTER TABLE public.quick_competition_players
  ADD COLUMN category_id uuid REFERENCES public.quick_competition_categories(id) ON DELETE SET NULL;

CREATE INDEX qc_players_category_idx
  ON public.quick_competition_players (category_id);

-- Toggle + per-category winner storage on the competition
ALTER TABLE public.quick_competitions
  ADD COLUMN categories_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN category_winners jsonb;
