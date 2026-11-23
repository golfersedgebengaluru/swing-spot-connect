-- "Admins only": a city gateway that takes online checkouts made by the city's admins,
-- while every other checkout keeps using the city's chosen (default Razorpay) gateway.
ALTER TABLE public.payment_gateways ADD COLUMN IF NOT EXISTS admins_only_checkout boolean NOT NULL DEFAULT false;

ALTER TABLE public.payment_gateways ADD CONSTRAINT payment_gateways_admins_only_ready CHECK (
  NOT admins_only_checkout OR (
    is_active AND city IS NOT NULL AND tenant_id IS NULL AND name IN ('razorpay', 'cashfree')
    AND coalesce(btrim(api_key), '') <> '' AND coalesce(btrim(api_secret), '') <> ''
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_gateways_one_admins_only_per_city ON public.payment_gateways (city) WHERE admins_only_checkout;
COMMENT ON COLUMN public.payment_gateways.admins_only_checkout IS 'Online checkouts by this city''s admins use this gateway; customers keep the city''s checkout gateway.';

-- Choosing a gateway for everyone ends its admins-only trial.
CREATE OR REPLACE FUNCTION public.set_checkout_gateway(_gateway_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v public.payment_gateways;
BEGIN
  SELECT * INTO v FROM public.payment_gateways WHERE id = _gateway_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gateway not found'; END IF;
  IF v.city IS NULL OR v.tenant_id IS NOT NULL THEN RAISE EXCEPTION 'Only a city payment account can take online payments'; END IF;
  IF v.name NOT IN ('razorpay', 'cashfree') THEN RAISE EXCEPTION 'This gateway cannot take online payments'; END IF;
  IF NOT v.is_active THEN RAISE EXCEPTION 'Switch this gateway on first'; END IF;
  IF coalesce(btrim(v.api_key), '') = '' OR coalesce(btrim(v.api_secret), '') = '' THEN
    RAISE EXCEPTION 'Save this gateway''s keys first';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('checkout_gateway:' || v.city));
  PERFORM 1 FROM public.payment_gateways WHERE city = v.city AND tenant_id IS NULL FOR UPDATE;
  UPDATE public.payment_gateways SET use_for_checkout = false, updated_at = now()
   WHERE city = v.city AND tenant_id IS NULL AND use_for_checkout AND id <> v.id;
  UPDATE public.payment_gateways SET use_for_checkout = true, admins_only_checkout = false, updated_at = now() WHERE id = v.id;
  RETURN v.city;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_checkout_gateway(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_checkout_gateway(uuid) TO service_role;