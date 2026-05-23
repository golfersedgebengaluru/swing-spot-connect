
-- =========================================================
-- 1. PROFILES: block anonymous reads
-- =========================================================
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- =========================================================
-- 2. QC_ENTRIES: drop public read
-- =========================================================
DROP POLICY IF EXISTS "qc entries public read" ON public.qc_entries;
CREATE POLICY "Authenticated can view qc entries"
  ON public.qc_entries FOR SELECT
  TO authenticated
  USING (true);

-- =========================================================
-- 3. COUPONS: stop anon from reading discount structure
-- =========================================================
DROP POLICY IF EXISTS "Everyone can view active coupons" ON public.coupons;
CREATE POLICY "Authenticated can view active coupons"
  ON public.coupons FOR SELECT
  TO authenticated
  USING (is_active = true);

-- =========================================================
-- 4. COUPON_REDEMPTIONS: tighten WITH CHECK
-- =========================================================
DROP POLICY IF EXISTS "Anon can insert redemptions" ON public.coupon_redemptions;
DROP POLICY IF EXISTS "Authenticated can insert redemptions" ON public.coupon_redemptions;

CREATE POLICY "Guests can insert their own redemptions"
  ON public.coupon_redemptions FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL AND session_id IS NOT NULL);

CREATE POLICY "Users can insert their own redemptions"
  ON public.coupon_redemptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =========================================================
-- 5. BAYS / BAY_CONFIG: hide calendar_email from anon
-- =========================================================
REVOKE SELECT (calendar_email) ON public.bays FROM anon;
REVOKE SELECT (calendar_email) ON public.bay_config FROM anon;

-- =========================================================
-- 6. PRODUCTS: hide cost/inventory fields from anon
-- =========================================================
REVOKE SELECT (cost_price, reorder_level, reorder_quantity, opening_stock)
  ON public.products FROM anon;

-- =========================================================
-- 7. LEGACY_LEAGUE_TEAM_REGISTRATIONS: restrict broad read
-- =========================================================
DROP POLICY IF EXISTS "authenticated read minimal legacy team counts"
  ON public.legacy_league_team_registrations;

CREATE POLICY "Admins and captains can view legacy team registrations"
  ON public.legacy_league_team_registrations FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_site_admin(auth.uid())
    OR captain_user_id = auth.uid()
  );

-- =========================================================
-- 8. LEAGUE BAY BLOCKS / BOOKINGS / COMPETITIONS / ROUNDS
--    Restrict to admins + members of relevant league
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can view bay blocks" ON public.league_bay_blocks;
CREATE POLICY "Admins and franchise admins can view bay blocks"
  ON public.league_bay_blocks FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_site_admin(auth.uid())
    OR public.has_league_role(auth.uid(), tenant_id, 'franchise_admin')
  );

DROP POLICY IF EXISTS "Authenticated can view bay bookings" ON public.league_bay_bookings;
CREATE POLICY "Admins and league members can view bay bookings"
  ON public.league_bay_bookings FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_site_admin(auth.uid())
    OR public.has_league_role(auth.uid(), tenant_id, 'franchise_admin')
    OR booked_by = auth.uid()
    OR auth.uid() = ANY (players)
  );

DROP POLICY IF EXISTS "Authenticated users can view league competitions" ON public.league_competitions;
CREATE POLICY "Admins and league members can view league competitions"
  ON public.league_competitions FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_site_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_competitions.league_id
        AND public.has_league_role(auth.uid(), l.tenant_id, 'franchise_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.league_players lp
      WHERE lp.league_id = league_competitions.league_id
        AND lp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view league rounds" ON public.league_rounds;
CREATE POLICY "Admins and league members can view league rounds"
  ON public.league_rounds FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_site_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_rounds.league_id
        AND public.has_league_role(auth.uid(), l.tenant_id, 'franchise_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.league_players lp
      WHERE lp.league_id = league_rounds.league_id
        AND lp.user_id = auth.uid()
    )
  );

-- =========================================================
-- 9. INVOICE-ASSETS BUCKET: make private + restrict reads
-- =========================================================
UPDATE storage.buckets SET public = false WHERE id = 'invoice-assets';

DROP POLICY IF EXISTS "Invoice assets are publicly readable" ON storage.objects;

CREATE POLICY "Admins can read invoice assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-assets'
    AND public.is_admin_or_site_admin(auth.uid())
  );

CREATE POLICY "Customers can read their own invoice assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-assets'
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.customer_user_id = auth.uid()
        AND (
          storage.objects.name LIKE '%' || i.id::text || '%'
          OR storage.objects.name LIKE '%' || i.invoice_number || '%'
        )
    )
  );
