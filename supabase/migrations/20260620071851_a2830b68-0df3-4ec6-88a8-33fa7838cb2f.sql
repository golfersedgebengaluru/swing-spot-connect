
ALTER TABLE public.qc_only_admins
  ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;

-- Allow site admins (city-scoped) to update / delete qc owner rows on tenants in their city
DROP POLICY IF EXISTS "site admins manage qc memberships in their cities" ON public.qc_only_admins;
CREATE POLICY "site admins manage qc memberships in their cities"
ON public.qc_only_admins
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = qc_only_admins.tenant_id
      AND t.city IS NOT NULL
      AND public.site_admin_has_city(auth.uid(), t.city)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = qc_only_admins.tenant_id
      AND t.city IS NOT NULL
      AND public.site_admin_has_city(auth.uid(), t.city)
  )
);
