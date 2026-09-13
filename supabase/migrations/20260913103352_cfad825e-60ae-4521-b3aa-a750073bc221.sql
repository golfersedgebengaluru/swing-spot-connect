DROP FUNCTION IF EXISTS public.claim_rate_limit_attempt(text, text, integer, integer);

CREATE TABLE IF NOT EXISTS public.rate_limit_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  action TEXT NOT NULL,
  attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON TABLE public.rate_limit_attempts TO service_role;
REVOKE ALL ON TABLE public.rate_limit_attempts FROM anon;
REVOKE ALL ON TABLE public.rate_limit_attempts FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_rate_limit_attempts_lookup
  ON public.rate_limit_attempts (identifier, action, attempted_at);

ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;