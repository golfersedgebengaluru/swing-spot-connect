
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins can delete profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (is_admin_or_site_admin(auth.uid()));
