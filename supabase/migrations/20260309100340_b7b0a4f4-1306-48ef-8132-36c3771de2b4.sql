
-- Table to track member hours balance
CREATE TABLE public.member_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hours_purchased numeric NOT NULL DEFAULT 0,
  hours_used numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Transaction log for audit trail
CREATE TABLE public.hours_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('purchase', 'deduction', 'adjustment')),
  hours numeric NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.member_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hours_transactions ENABLE ROW LEVEL SECURITY;

-- RLS: Admins full access, users can view own
CREATE POLICY "Admins can manage member_hours" ON public.member_hours FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own hours" ON public.member_hours FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage hours_transactions" ON public.hours_transactions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own transactions" ON public.hours_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE TRIGGER update_member_hours_updated_at BEFORE UPDATE ON public.member_hours FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
