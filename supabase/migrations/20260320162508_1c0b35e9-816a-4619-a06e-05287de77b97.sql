
-- Allow public/anonymous users to read bays (needed for public booking)
DROP POLICY IF EXISTS "Bays viewable by authenticated" ON public.bays;
CREATE POLICY "Bays viewable by everyone"
  ON public.bays FOR SELECT
  TO public
  USING (true);

-- Allow public/anonymous users to read bay_config
DROP POLICY IF EXISTS "Bay config viewable by authenticated" ON public.bay_config;
CREATE POLICY "Bay config viewable by everyone"
  ON public.bay_config FOR SELECT
  TO public
  USING (true);
