
-- League activity feed items
CREATE TABLE public.league_feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- score_submitted, score_confirmed, player_joined, round_closed, team_created, leaderboard_change
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_league_feed_league ON public.league_feed_items(league_id, created_at DESC);
CREATE INDEX idx_league_feed_tenant ON public.league_feed_items(tenant_id);

ALTER TABLE public.league_feed_items ENABLE ROW LEVEL SECURITY;

-- Players in the league can read feed items for their league
CREATE POLICY "Players can view their league feed"
  ON public.league_feed_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.league_players lp
      WHERE lp.league_id = league_feed_items.league_id
        AND lp.user_id = auth.uid()
    )
    OR public.is_admin_or_site_admin(auth.uid())
    OR public.has_league_role(auth.uid(), league_feed_items.tenant_id, 'franchise_admin')
    OR public.has_league_role(auth.uid(), league_feed_items.tenant_id, 'league_admin')
  );

-- Only service role inserts (via edge function)
CREATE POLICY "Service role inserts feed items"
  ON public.league_feed_items FOR INSERT TO service_role
  WITH CHECK (true);

-- League feed reactions (emoji reactions on feed items)
CREATE TABLE public.league_feed_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id UUID NOT NULL REFERENCES public.league_feed_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL DEFAULT '👏',
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(feed_item_id, user_id, emoji)
);

CREATE INDEX idx_feed_reactions_item ON public.league_feed_reactions(feed_item_id);
CREATE INDEX idx_feed_reactions_tenant ON public.league_feed_reactions(tenant_id);

ALTER TABLE public.league_feed_reactions ENABLE ROW LEVEL SECURITY;

-- Players can view reactions for feed items they can see
CREATE POLICY "Players can view reactions"
  ON public.league_feed_reactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.league_feed_items fi
      JOIN public.league_players lp ON lp.league_id = fi.league_id AND lp.user_id = auth.uid()
      WHERE fi.id = league_feed_reactions.feed_item_id
    )
    OR public.is_admin_or_site_admin(auth.uid())
  );

-- Players can insert their own reactions
CREATE POLICY "Players can react"
  ON public.league_feed_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.league_feed_items fi
      JOIN public.league_players lp ON lp.league_id = fi.league_id AND lp.user_id = auth.uid()
      WHERE fi.id = league_feed_reactions.feed_item_id
    )
  );

-- Players can remove their own reactions
CREATE POLICY "Players can unreact"
  ON public.league_feed_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Service role can insert feed items and reactions
CREATE POLICY "Service role inserts reactions"
  ON public.league_feed_reactions FOR INSERT TO service_role
  WITH CHECK (true);
