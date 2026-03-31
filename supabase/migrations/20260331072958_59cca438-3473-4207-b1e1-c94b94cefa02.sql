
-- Site admins can INSERT member_hours for users in their cities
CREATE POLICY "Site admins can manage member_hours"
ON public.member_hours
FOR ALL
TO authenticated
USING (is_admin_or_site_admin(auth.uid()))
WITH CHECK (is_admin_or_site_admin(auth.uid()));

-- Site admins can INSERT hours_transactions
CREATE POLICY "Site admins can manage hours_transactions"
ON public.hours_transactions
FOR ALL
TO authenticated
USING (is_admin_or_site_admin(auth.uid()))
WITH CHECK (is_admin_or_site_admin(auth.uid()));

-- Site admins can INSERT/UPDATE profiles (for pre-register, points updates)
CREATE POLICY "Site admins can insert profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Site admins can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_admin_or_site_admin(auth.uid()))
WITH CHECK (is_admin_or_site_admin(auth.uid()));

-- Site admins can INSERT points_transactions
CREATE POLICY "Site admins can manage points_transactions"
ON public.points_transactions
FOR ALL
TO authenticated
USING (is_admin_or_site_admin(auth.uid()))
WITH CHECK (is_admin_or_site_admin(auth.uid()));

-- Site admins can INSERT notifications (for sending alerts to users)
CREATE POLICY "Site admins can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_site_admin(auth.uid()));

-- Site admins can INSERT bookings for walk-in bookings
CREATE POLICY "Site admins can insert city bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));
