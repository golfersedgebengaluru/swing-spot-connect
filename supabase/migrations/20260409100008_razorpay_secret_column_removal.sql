-- Remove api_secret from payment_gateways table.
-- The secret must now be stored as a Supabase secret (environment variable) named
-- RAZORPAY_SECRET_<CITY_SLUG> (e.g. RAZORPAY_SECRET_BANGALORE, RAZORPAY_SECRET_MUMBAI).
-- The edge function (create-razorpay-order) reads it from the environment, not the DB.
--
-- Migration plan:
-- 1. Before running this migration, add each city's secret to Supabase secrets:
--    supabase secrets set RAZORPAY_SECRET_BANGALORE=rzp_live_xxx
-- 2. Deploy the updated create-razorpay-order function that reads from env
-- 3. Run this migration to drop the column

-- Add a city_slug column so the edge function knows which env var to look up
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS city_slug TEXT
  GENERATED ALWAYS AS (
    lower(regexp_replace(city, '[^a-zA-Z0-9]', '_', 'g'))
  ) STORED;

-- Drop the api_secret column
-- NOTE: Ensure the updated create-razorpay-order function is deployed BEFORE
-- running this statement. Running this while the old function is live will break payments.
-- Uncomment when ready:
-- ALTER TABLE public.payment_gateways DROP COLUMN IF EXISTS api_secret;

-- For now, restrict SELECT on api_secret to service role only
-- (removes site_admin access to the secret)
REVOKE SELECT (api_secret) ON public.payment_gateways FROM authenticated;
