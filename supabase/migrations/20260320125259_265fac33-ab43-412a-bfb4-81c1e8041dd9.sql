ALTER TABLE public.payment_gateways DROP CONSTRAINT IF EXISTS payment_gateways_name_key;
ALTER TABLE public.payment_gateways ADD CONSTRAINT payment_gateways_city_name_key UNIQUE (city, name);
ALTER TABLE public.payment_gateways ALTER COLUMN city DROP DEFAULT;
DELETE FROM public.payment_gateways WHERE city = 'all';