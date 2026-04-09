-- Fix overly permissive RLS write policies on events, products, rewards, earn_methods.
-- These were originally set to allow ANY authenticated user to insert/update/delete,
-- which means any logged-in user could corrupt business data.
-- Restricting to admin/site_admin only using existing is_admin_or_site_admin() helper.

-- ─── EVENTS ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can update events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can delete events" ON public.events;

CREATE POLICY "Admins can insert events"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can update events"
  ON public.events FOR UPDATE
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can delete events"
  ON public.events FOR DELETE
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

-- ─── PRODUCTS ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;

CREATE POLICY "Admins can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

-- ─── REWARDS ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert rewards" ON public.rewards;
DROP POLICY IF EXISTS "Authenticated users can update rewards" ON public.rewards;
DROP POLICY IF EXISTS "Authenticated users can delete rewards" ON public.rewards;

CREATE POLICY "Admins can insert rewards"
  ON public.rewards FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can update rewards"
  ON public.rewards FOR UPDATE
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can delete rewards"
  ON public.rewards FOR DELETE
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

-- ─── EARN_METHODS ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert earn_methods" ON public.earn_methods;
DROP POLICY IF EXISTS "Authenticated users can update earn_methods" ON public.earn_methods;
DROP POLICY IF EXISTS "Authenticated users can delete earn_methods" ON public.earn_methods;

CREATE POLICY "Admins can insert earn_methods"
  ON public.earn_methods FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can update earn_methods"
  ON public.earn_methods FOR UPDATE
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Admins can delete earn_methods"
  ON public.earn_methods FOR DELETE
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));
