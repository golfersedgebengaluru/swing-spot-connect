
-- Email preferences per user
CREATE TABLE public.email_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  booking_confirmed boolean NOT NULL DEFAULT true,
  booking_cancelled boolean NOT NULL DEFAULT true,
  booking_rescheduled boolean NOT NULL DEFAULT true,
  points_earned boolean NOT NULL DEFAULT true,
  points_redeemed boolean NOT NULL DEFAULT true,
  league_updates boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email preferences"
ON public.email_preferences FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own email preferences"
ON public.email_preferences FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email preferences"
ON public.email_preferences FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage email preferences"
ON public.email_preferences FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Email log table
CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recipient_email text NOT NULL,
  template text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  resend_id text,
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email_log"
ON public.email_log FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own email_log"
ON public.email_log FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Rate limiting function
CREATE OR REPLACE FUNCTION public.check_email_rate_limit(p_user_id uuid, p_max_per_hour integer DEFAULT 3)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT count(*) FROM public.email_log
    WHERE user_id = p_user_id
      AND status = 'sent'
      AND created_at > now() - interval '1 hour'
  ) < p_max_per_hour;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_email_preferences_updated_at
BEFORE UPDATE ON public.email_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_log_updated_at
BEFORE UPDATE ON public.email_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for rate limiting queries
CREATE INDEX idx_email_log_user_created ON public.email_log(user_id, created_at);
CREATE INDEX idx_email_log_status ON public.email_log(status);
