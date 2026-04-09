-- Table to capture silent background job failures for visibility and retry.
-- Used by edge functions to log non-fatal errors (email sends, loyalty point awards,
-- calendar sync side effects) that would otherwise be silently swallowed.

CREATE TABLE IF NOT EXISTS public.background_job_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL,          -- e.g. 'email', 'loyalty_points', 'calendar_event'
  entity_type TEXT,                -- e.g. 'booking', 'order'
  entity_id TEXT,                  -- related record ID
  error_message TEXT NOT NULL,
  context JSONB DEFAULT '{}',      -- additional context (user_id, city, etc.)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_bgfail_job_type
  ON public.background_job_failures (job_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bgfail_unresolved
  ON public.background_job_failures (created_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.background_job_failures ENABLE ROW LEVEL SECURITY;

-- Admins and site admins can view and resolve failures
CREATE POLICY "Admins can view background job failures"
  ON public.background_job_failures FOR SELECT
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can update background job failures"
  ON public.background_job_failures FOR UPDATE
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));
