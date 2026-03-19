
CREATE OR REPLACE FUNCTION public.get_hours_balance(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE 
      WHEN type IN ('purchase', 'credit', 'adjustment') THEN hours 
      ELSE -hours 
    END
  ), 0)
  FROM public.hours_transactions
  WHERE user_id = p_user_id;
$$;
