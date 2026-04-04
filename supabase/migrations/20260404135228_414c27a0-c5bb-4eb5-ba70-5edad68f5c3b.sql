-- Reassign all references from duplicate profiles to the primary one
-- Primary: 4d48fbca-985d-454f-b0c6-7f1afcb439f4 (oldest)
-- Dupes: d9159c36-7b7b-4af8-8ebc-2c8057fe7c07, 9ceb7d4d-d143-40ec-a65a-3a64db00353f

UPDATE public.invoices SET customer_user_id = '4d48fbca-985d-454f-b0c6-7f1afcb439f4' WHERE customer_user_id IN ('d9159c36-7b7b-4af8-8ebc-2c8057fe7c07', '9ceb7d4d-d143-40ec-a65a-3a64db00353f');
UPDATE public.revenue_transactions SET user_id = '4d48fbca-985d-454f-b0c6-7f1afcb439f4' WHERE user_id IN ('d9159c36-7b7b-4af8-8ebc-2c8057fe7c07', '9ceb7d4d-d143-40ec-a65a-3a64db00353f');
UPDATE public.bookings SET user_id = '4d48fbca-985d-454f-b0c6-7f1afcb439f4' WHERE user_id IN ('d9159c36-7b7b-4af8-8ebc-2c8057fe7c07', '9ceb7d4d-d143-40ec-a65a-3a64db00353f');
UPDATE public.orders SET user_id = '4d48fbca-985d-454f-b0c6-7f1afcb439f4' WHERE user_id IN ('d9159c36-7b7b-4af8-8ebc-2c8057fe7c07', '9ceb7d4d-d143-40ec-a65a-3a64db00353f');
UPDATE public.points_transactions SET user_id = '4d48fbca-985d-454f-b0c6-7f1afcb439f4' WHERE user_id IN ('d9159c36-7b7b-4af8-8ebc-2c8057fe7c07', '9ceb7d4d-d143-40ec-a65a-3a64db00353f');
UPDATE public.notifications SET user_id = '4d48fbca-985d-454f-b0c6-7f1afcb439f4' WHERE user_id IN ('d9159c36-7b7b-4af8-8ebc-2c8057fe7c07', '9ceb7d4d-d143-40ec-a65a-3a64db00353f');
UPDATE public.gifted_rewards SET user_id = '4d48fbca-985d-454f-b0c6-7f1afcb439f4' WHERE user_id IN ('d9159c36-7b7b-4af8-8ebc-2c8057fe7c07', '9ceb7d4d-d143-40ec-a65a-3a64db00353f');

-- Delete the duplicate profiles
DELETE FROM public.profiles WHERE id IN ('d9159c36-7b7b-4af8-8ebc-2c8057fe7c07', '9ceb7d4d-d143-40ec-a65a-3a64db00353f');