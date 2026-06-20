
-- Helper: does this user have site_admin access to a given city
CREATE OR REPLACE FUNCTION public.site_admin_has_city(_user_id uuid, _city text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _city IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.site_admin_cities
    WHERE user_id = _user_id AND city = _city
  );
$$;

-- ===== tenants: scope site_admin visibility to tenants tied to their cities =====
DROP POLICY IF EXISTS "Site admins can manage tenants" ON public.tenants;

CREATE POLICY "Platform admins manage all tenants"
ON public.tenants
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins manage tenants in their cities"
ON public.tenants
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND city IS NOT NULL
  AND public.site_admin_has_city(auth.uid(), city)
)
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role)
  AND city IS NOT NULL
  AND public.site_admin_has_city(auth.uid(), city)
);

-- ===== qc_only_admins: same scoping for SELECT =====
DROP POLICY IF EXISTS "admins site admins and owners read qc memberships" ON public.qc_only_admins;

CREATE POLICY "owners and admins read qc memberships"
ON public.qc_only_admins
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'site_admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = qc_only_admins.tenant_id
        AND t.city IS NOT NULL
        AND public.site_admin_has_city(auth.uid(), t.city)
    )
  )
);
