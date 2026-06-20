DROP POLICY IF EXISTS "users read own qc memberships" ON public.qc_only_admins;

CREATE POLICY "admins site admins and owners read qc memberships"
ON public.qc_only_admins
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'site_admin'::public.app_role)
);