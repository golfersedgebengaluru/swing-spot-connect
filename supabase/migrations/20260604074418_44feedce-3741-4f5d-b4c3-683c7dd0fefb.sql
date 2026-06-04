-- Backfill missing booking_id on walk-in / manual UPI revenue transactions (Jun 2, 2026)
UPDATE public.revenue_transactions SET booking_id = '119b690c-32f6-43fd-934f-3d63f025c9af' WHERE id = '5d82b61e-61bd-40f9-909d-e57e68ee6bfe' AND booking_id IS NULL;
UPDATE public.revenue_transactions SET booking_id = '2e41e908-4fd2-4fff-9f1c-5fa9ca34d41f' WHERE id = '16156f42-9724-434d-bcd6-7dc1f6586a81' AND booking_id IS NULL;
UPDATE public.revenue_transactions SET booking_id = 'd9e66aeb-e38f-4ac5-9d93-fbc7cf33f2ad' WHERE id = 'd4d0ddb5-3df5-487c-a569-07499e9788a4' AND booking_id IS NULL;
UPDATE public.revenue_transactions SET booking_id = '7f39d1b4-e62b-4cbf-b519-37eeab4e84c9' WHERE id = 'aff30eab-2491-4de8-8c7b-9173f2e168fe' AND booking_id IS NULL;