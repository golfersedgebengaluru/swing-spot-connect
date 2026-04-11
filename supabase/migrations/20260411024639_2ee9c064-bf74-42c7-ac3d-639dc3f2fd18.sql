
CREATE OR REPLACE FUNCTION public.get_hours_balance(p_user_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT hours_purchased - hours_used FROM public.member_hours WHERE user_id = p_user_id),
    0
  );
$$;
