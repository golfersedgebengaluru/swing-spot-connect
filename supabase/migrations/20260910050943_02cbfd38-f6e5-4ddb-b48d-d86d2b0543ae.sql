CREATE OR REPLACE FUNCTION public.validate_revenue_city_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount IS NOT NULL AND NEW.amount <> 0
     AND NULLIF(btrim(COALESCE(NEW.city, '')), '') IS NULL THEN
    RAISE EXCEPTION 'revenue_transactions: city is required for non-zero amounts (source_ref %)', COALESCE(NEW.source_ref, '(none)');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_revenue_city_before_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_revenue_city_before_insert() FROM anon;
REVOKE ALL ON FUNCTION public.validate_revenue_city_before_insert() FROM authenticated;