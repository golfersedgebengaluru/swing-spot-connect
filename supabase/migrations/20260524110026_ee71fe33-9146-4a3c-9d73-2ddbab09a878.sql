-- 1) Link revenue_transactions to the booking's customer when missing
UPDATE public.revenue_transactions rt
SET user_id = b.user_id
FROM public.bookings b
WHERE rt.user_id IS NULL
  AND rt.booking_id IS NOT NULL
  AND rt.booking_id = b.id
  AND b.user_id IS NOT NULL
  AND b.user_id <> '00000000-0000-0000-0000-000000000000';

-- 2) For any remaining rows with a guest_email, resolve via profiles (auth user_id preferred, else profile id)
UPDATE public.revenue_transactions rt
SET user_id = COALESCE(p.user_id, p.id)
FROM public.profiles p
WHERE rt.user_id IS NULL
  AND rt.guest_email IS NOT NULL
  AND LOWER(p.email) = LOWER(rt.guest_email);
