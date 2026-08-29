CREATE OR REPLACE VIEW public.corporate_account_cities
WITH (security_invoker = true) AS
SELECT DISTINCT p.corporate_account_id, b.city
FROM public.profiles p
JOIN public.bookings b ON (b.user_id = p.user_id OR b.user_id = p.id)
WHERE p.corporate_account_id IS NOT NULL AND b.city IS NOT NULL
UNION
SELECT DISTINCT p.corporate_account_id, c.city
FROM public.profiles p
JOIN public.coaching_sessions c ON (c.student_user_id = p.user_id OR c.student_user_id = p.id)
WHERE p.corporate_account_id IS NOT NULL AND c.city IS NOT NULL;

GRANT SELECT ON public.corporate_account_cities TO authenticated;
GRANT SELECT ON public.corporate_account_cities TO service_role;