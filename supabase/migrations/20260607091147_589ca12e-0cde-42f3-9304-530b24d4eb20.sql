
-- 1. Lock down products.cost_price at column level (admin-only via RPCs)
REVOKE SELECT (cost_price), INSERT (cost_price), UPDATE (cost_price)
  ON public.products FROM anon, authenticated;
GRANT  SELECT (cost_price), INSERT (cost_price), UPDATE (cost_price)
  ON public.products TO service_role;

-- 2. City-level cost-price visibility toggle (admin-controlled)
CREATE TABLE IF NOT EXISTS public.city_cost_price_access (
  city text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.city_cost_price_access TO authenticated;
GRANT ALL ON public.city_cost_price_access TO service_role;

ALTER TABLE public.city_cost_price_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage city cost price access" ON public.city_cost_price_access;
CREATE POLICY "Admins manage city cost price access"
  ON public.city_cost_price_access FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Site admins need to read whether their city is enabled (to decide UI)
DROP POLICY IF EXISTS "Site admins read their own city access" ON public.city_cost_price_access;
CREATE POLICY "Site admins read their own city access"
  ON public.city_cost_price_access FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    AND public.has_city_access(auth.uid(), city)
  );

-- 3. RPC: read cost prices (admin-all, site-admin-if-city-enabled)
CREATE OR REPLACE FUNCTION public.get_product_cost_prices(p_ids uuid[] DEFAULT NULL)
RETURNS TABLE(id uuid, cost_price numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.cost_price
  FROM public.products p
  WHERE (p_ids IS NULL OR p.id = ANY(p_ids))
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        public.has_role(auth.uid(), 'site_admin'::app_role)
        AND p.city IS NOT NULL
        AND public.has_city_access(auth.uid(), p.city)
        AND EXISTS (
          SELECT 1 FROM public.city_cost_price_access cca
          WHERE cca.city = p.city AND cca.enabled = true
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_product_cost_prices(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_cost_prices(uuid[]) TO authenticated;

-- 4. RPC: set cost price (same authorization as read)
CREATE OR REPLACE FUNCTION public.admin_set_product_cost_price(p_id uuid, p_cost numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_city text;
  v_allowed boolean := false;
BEGIN
  SELECT city INTO v_city FROM public.products WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    v_allowed := true;
  ELSIF public.has_role(auth.uid(), 'site_admin'::app_role)
    AND v_city IS NOT NULL
    AND public.has_city_access(auth.uid(), v_city)
    AND EXISTS (SELECT 1 FROM public.city_cost_price_access WHERE city = v_city AND enabled = true)
  THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized to edit cost price';
  END IF;

  UPDATE public.products SET cost_price = COALESCE(p_cost, 0), updated_at = now() WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_product_cost_price(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_product_cost_price(uuid, numeric) TO authenticated;
