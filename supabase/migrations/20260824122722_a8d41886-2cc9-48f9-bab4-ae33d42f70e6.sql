-- 1. GST registration as a first-class per-city flag
ALTER TABLE public.gst_profiles
  ADD COLUMN IF NOT EXISTS is_gst_registered boolean NOT NULL DEFAULT true;

UPDATE public.gst_profiles
SET is_gst_registered = false,
    gstin = '',
    default_service_gst_rate = 0
WHERE city = 'Chennai';

-- 2. Revenue ledger: catalogue link + idempotency key
ALTER TABLE public.revenue_transactions
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS source_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS revenue_transactions_source_ref_key
  ON public.revenue_transactions (source_ref)
  WHERE source_ref IS NOT NULL;

ALTER TABLE public.revenue_transactions
  DROP CONSTRAINT IF EXISTS revenue_transactions_transaction_type_check;
ALTER TABLE public.revenue_transactions
  ADD CONSTRAINT revenue_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'payment','hours_deduction','guest_booking','refund','booking','purchase',
    'product_order','league_registration','qc_entry'
  ]));

-- 3. Catalogue links for the remaining priced things (optional, admin-set)
ALTER TABLE public.hour_packages
  ADD COLUMN IF NOT EXISTS service_product_id uuid REFERENCES public.products(id);
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS service_product_id uuid REFERENCES public.products(id);

-- 4. bay_pricing: fill Chennai's missing product links
UPDATE public.bay_pricing bp
SET service_product_id = p.id
FROM public.products p
WHERE bp.service_product_id IS NULL
  AND bp.city = 'Chennai'
  AND p.city = 'Chennai'
  AND ((bp.session_type = 'individual' AND p.name = 'Single60')
    OR (bp.session_type = 'couple'     AND p.name = 'Couple60')
    OR (bp.session_type = 'group'      AND p.name = 'Group60 -WKND - Chn'));

-- 5. bay_pricing: add the service-level keys that bookings actually store
INSERT INTO public.bay_pricing (city, day_type, session_type, label, price_per_hour, service_product_id)
SELECT bp.city, bp.day_type, 'practice', 'Bay Rental', bp.price_per_hour, bp.service_product_id
FROM public.bay_pricing bp
WHERE bp.session_type = 'individual'
ON CONFLICT (city, day_type, session_type) DO NOTHING;

INSERT INTO public.bay_pricing (city, day_type, session_type, label, price_per_hour, service_product_id)
SELECT bp.city, bp.day_type, 'coaching', 'Coaching', bp.price_per_hour, bp.service_product_id
FROM public.bay_pricing bp
WHERE bp.session_type = 'coaching_60'
ON CONFLICT (city, day_type, session_type) DO NOTHING;