
-- Table to track gifted/complimentary rewards assigned to members
CREATE TABLE public.gifted_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  reward_name TEXT NOT NULL,
  reward_description TEXT,
  gift_type TEXT NOT NULL DEFAULT 'manual',
  trigger_event TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  gifted_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  redeemed_at TIMESTAMP WITH TIME ZONE
);

-- Auto-gift rules table (e.g., "first signup gets a golf ball")
CREATE TABLE public.auto_gift_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  reward_name TEXT NOT NULL,
  reward_description TEXT,
  trigger_event TEXT NOT NULL DEFAULT 'signup',
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_per_user INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS for gifted_rewards
ALTER TABLE public.gifted_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage gifted_rewards" ON public.gifted_rewards FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins can manage gifted_rewards" ON public.gifted_rewards FOR ALL TO authenticated
  USING (is_admin_or_site_admin(auth.uid()))
  WITH CHECK (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Users can view own gifted_rewards" ON public.gifted_rewards FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- RLS for auto_gift_rules
ALTER TABLE public.auto_gift_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage auto_gift_rules" ON public.auto_gift_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins can manage auto_gift_rules" ON public.auto_gift_rules FOR ALL TO authenticated
  USING (is_admin_or_site_admin(auth.uid()))
  WITH CHECK (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Auto gift rules viewable by authenticated" ON public.auto_gift_rules FOR SELECT TO authenticated
  USING (true);
