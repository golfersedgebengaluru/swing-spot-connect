-- Atomic stored procedure to grant site_admin role + city assignments in one transaction.
-- Replaces the previous two-step approach in the manage-roles edge function which could
-- leave partial state if the city insert failed after the role insert succeeded.

CREATE OR REPLACE FUNCTION public.grant_site_admin_with_cities(
  p_user_id UUID,
  p_cities TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert/update the role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'site_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Remove old city assignments
  DELETE FROM public.site_admin_cities WHERE user_id = p_user_id;

  -- Insert new city assignments
  INSERT INTO public.site_admin_cities (user_id, city)
  SELECT p_user_id, unnest(p_cities);
END;
$$;

-- Only service role (edge functions) should call this function
REVOKE ALL ON FUNCTION public.grant_site_admin_with_cities(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_site_admin_with_cities(UUID, TEXT[]) FROM authenticated;
