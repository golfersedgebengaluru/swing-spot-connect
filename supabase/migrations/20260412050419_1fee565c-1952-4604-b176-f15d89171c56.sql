
-- Enable btree_gist for exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── League Bay Bookings ──────────────────────────────────────
CREATE TABLE public.league_bay_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  bay_id UUID NOT NULL REFERENCES public.bays(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  booked_by UUID NOT NULL,
  booking_method TEXT NOT NULL DEFAULT 'player_self' CHECK (booking_method IN ('player_self', 'admin_assigned')),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  players UUID[] NOT NULL DEFAULT '{}',
  max_players INTEGER NOT NULL DEFAULT 4,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exclusion constraint: prevent double-booking same bay at overlapping times (confirmed only)
ALTER TABLE public.league_bay_bookings
  ADD CONSTRAINT no_overlapping_bay_bookings
  EXCLUDE USING gist (
    bay_id WITH =,
    tstzrange(scheduled_at, scheduled_end) WITH &&
  ) WHERE (status = 'confirmed');

-- Indexes
CREATE INDEX idx_lbb_league ON public.league_bay_bookings(league_id);
CREATE INDEX idx_lbb_bay ON public.league_bay_bookings(bay_id);
CREATE INDEX idx_lbb_tenant ON public.league_bay_bookings(tenant_id);
CREATE INDEX idx_lbb_scheduled ON public.league_bay_bookings(scheduled_at);

-- RLS
ALTER TABLE public.league_bay_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view bay bookings"
  ON public.league_bay_bookings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access league_bay_bookings"
  ON public.league_bay_bookings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── League Bay Blocks ────────────────────────────────────────
CREATE TABLE public.league_bay_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bay_id UUID NOT NULL REFERENCES public.bays(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  blocked_from TIMESTAMPTZ NOT NULL,
  blocked_to TIMESTAMPTZ NOT NULL,
  reason TEXT,
  blocked_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lbblocks_bay ON public.league_bay_blocks(bay_id);
CREATE INDEX idx_lbblocks_tenant ON public.league_bay_blocks(tenant_id);

ALTER TABLE public.league_bay_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view bay blocks"
  ON public.league_bay_blocks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access league_bay_blocks"
  ON public.league_bay_blocks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_league_bay_bookings_updated_at
  BEFORE UPDATE ON public.league_bay_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.league_bay_bookings;
