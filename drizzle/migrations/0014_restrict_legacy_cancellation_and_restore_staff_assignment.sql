REVOKE ALL ON FUNCTION public.cancel_booking_with_clawback(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_with_clawback(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.grant_site_admin_with_cities(p_user_id uuid, p_cities text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id IS NULL OR p_cities IS NULL OR cardinality(p_cities) = 0 THEN
    RAISE EXCEPTION 'User and at least one city are required';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_cities) c WHERE c IS NULL OR btrim(c) = '' OR NOT EXISTS (SELECT 1 FROM public.bays b WHERE b.city = c)) THEN
    RAISE EXCEPTION 'Every assigned city must exist';
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES(p_user_id, 'site_admin') ON CONFLICT(user_id, role) DO NOTHING;
  DELETE FROM public.site_admin_cities WHERE user_id = p_user_id;
  INSERT INTO public.site_admin_cities(user_id, city) SELECT p_user_id, c FROM (SELECT DISTINCT unnest(p_cities) AS c) cities;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_site_admin_with_cities(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_site_admin_with_cities(uuid, text[]) TO service_role;