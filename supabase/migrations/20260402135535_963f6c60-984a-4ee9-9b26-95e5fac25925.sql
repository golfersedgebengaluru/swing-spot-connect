
-- 1. Earning Rules (event-driven points engine)
CREATE TABLE public.loyalty_earning_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  label text NOT NULL,
  base_rate numeric NOT NULL DEFAULT 0,
  rate_unit text NOT NULL DEFAULT 'per_100_spent',
  conditions jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Stackable Multipliers
CREATE TABLE public.loyalty_multipliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  multiplier numeric NOT NULL DEFAULT 1.0,
  condition_type text NOT NULL,
  condition_value jsonb NOT NULL DEFAULT '{}',
  is_stackable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Milestones (monthly + plan cycle)
CREATE TABLE public.loyalty_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  milestone_type text NOT NULL,
  threshold_hours numeric NOT NULL,
  bonus_points integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Special Bonuses (coaching follow-through etc.)
CREATE TABLE public.loyalty_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_type text NOT NULL,
  trigger_conditions jsonb NOT NULL DEFAULT '{}',
  bonus_type text NOT NULL DEFAULT 'percentage',
  bonus_value numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Loyalty Config (global key-value settings)
CREATE TABLE public.loyalty_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. User Progress Tracking (cached monthly/cycle state)
CREATE TABLE public.loyalty_user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  hours_logged numeric NOT NULL DEFAULT 0,
  milestones_achieved jsonb NOT NULL DEFAULT '[]',
  visit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_type, period_start)
);

-- 7. Extend points_transactions with audit fields
ALTER TABLE public.points_transactions
  ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES public.loyalty_earning_rules(id),
  ADD COLUMN IF NOT EXISTS multipliers_applied jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS base_points integer,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS event_metadata jsonb DEFAULT '{}';

-- 8. Extend rewards table with gating and caps
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS redemption_cap_per_day integer,
  ADD COLUMN IF NOT EXISTS usage_gate_percentage numeric,
  ADD COLUMN IF NOT EXISTS reward_type text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS reward_value numeric;

-- RLS for all new tables
ALTER TABLE public.loyalty_earning_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_multipliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_user_progress ENABLE ROW LEVEL SECURITY;

-- Admins full access on all loyalty tables
CREATE POLICY "Admins can manage loyalty_earning_rules" ON public.loyalty_earning_rules FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Site admins can manage loyalty_earning_rules" ON public.loyalty_earning_rules FOR ALL TO authenticated USING (is_admin_or_site_admin(auth.uid())) WITH CHECK (is_admin_or_site_admin(auth.uid()));
CREATE POLICY "Earning rules viewable by authenticated" ON public.loyalty_earning_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage loyalty_multipliers" ON public.loyalty_multipliers FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Site admins can manage loyalty_multipliers" ON public.loyalty_multipliers FOR ALL TO authenticated USING (is_admin_or_site_admin(auth.uid())) WITH CHECK (is_admin_or_site_admin(auth.uid()));
CREATE POLICY "Multipliers viewable by authenticated" ON public.loyalty_multipliers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage loyalty_milestones" ON public.loyalty_milestones FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Site admins can manage loyalty_milestones" ON public.loyalty_milestones FOR ALL TO authenticated USING (is_admin_or_site_admin(auth.uid())) WITH CHECK (is_admin_or_site_admin(auth.uid()));
CREATE POLICY "Milestones viewable by authenticated" ON public.loyalty_milestones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage loyalty_bonuses" ON public.loyalty_bonuses FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Site admins can manage loyalty_bonuses" ON public.loyalty_bonuses FOR ALL TO authenticated USING (is_admin_or_site_admin(auth.uid())) WITH CHECK (is_admin_or_site_admin(auth.uid()));
CREATE POLICY "Bonuses viewable by authenticated" ON public.loyalty_bonuses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage loyalty_config" ON public.loyalty_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Site admins can manage loyalty_config" ON public.loyalty_config FOR ALL TO authenticated USING (is_admin_or_site_admin(auth.uid())) WITH CHECK (is_admin_or_site_admin(auth.uid()));
CREATE POLICY "Config viewable by authenticated" ON public.loyalty_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage loyalty_user_progress" ON public.loyalty_user_progress FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Site admins can manage loyalty_user_progress" ON public.loyalty_user_progress FOR ALL TO authenticated USING (is_admin_or_site_admin(auth.uid())) WITH CHECK (is_admin_or_site_admin(auth.uid()));
CREATE POLICY "Users can view own progress" ON public.loyalty_user_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);
