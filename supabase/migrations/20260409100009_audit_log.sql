-- Audit log: tracks admin writes to critical tables so there is an immutable
-- record of who changed what and when. Triggered automatically via DB triggers.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  changed_by UUID REFERENCES auth.users(id),   -- NULL for service-role operations
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,                      -- stringified PK of the changed row
  operation TEXT NOT NULL,                      -- INSERT | UPDATE | DELETE
  old_values JSONB,                             -- NULL for INSERT
  new_values JSONB,                             -- NULL for DELETE
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
  ON public.audit_log (table_name, record_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
  ON public.audit_log (changed_by, changed_at DESC)
  WHERE changed_by IS NOT NULL;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can query the audit log; no one can modify it (immutable append-only)
CREATE POLICY "Admins can read audit log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

-- ─── Trigger function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_log (
    changed_by,
    table_name,
    record_id,
    operation,
    old_values,
    new_values
  ) VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    CASE
      WHEN TG_OP = 'DELETE' THEN (OLD.id)::text
      ELSE (NEW.id)::text
    END,
    TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN NULL; -- AFTER trigger, return value is ignored
END;
$$;

-- ─── Apply triggers to critical admin-managed tables ───────────────────────

-- user_roles
CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- payment_gateways (sensitive — API keys)
CREATE TRIGGER audit_payment_gateways
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- bay_pricing
CREATE TRIGGER audit_bay_pricing
  AFTER INSERT OR UPDATE OR DELETE ON public.bay_pricing
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- admin_config
CREATE TRIGGER audit_admin_config
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_config
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- bookings (status changes by admins)
CREATE TRIGGER audit_bookings
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.audit_log_trigger();

-- invoices
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
