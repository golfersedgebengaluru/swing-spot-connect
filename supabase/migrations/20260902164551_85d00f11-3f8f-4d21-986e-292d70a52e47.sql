CREATE OR REPLACE FUNCTION public.resolve_revenue_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product uuid;
  v_booking record;
  v_day_type text;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1) Bay bookings → bay_pricing(city, day_type, session_type)
  IF NEW.booking_id IS NOT NULL THEN
    SELECT b.city, b.session_type, b.start_time INTO v_booking
    FROM public.bookings b WHERE b.id = NEW.booking_id;
    IF v_booking IS NOT NULL THEN
      v_day_type := CASE
        WHEN EXTRACT(DOW FROM (v_booking.start_time AT TIME ZONE 'Asia/Kolkata')) IN (0, 6)
        THEN 'weekend' ELSE 'weekday' END;
      SELECT bp.service_product_id INTO v_product
      FROM public.bay_pricing bp
      WHERE bp.city = v_booking.city
        AND bp.day_type = v_day_type
        AND bp.session_type = COALESCE(v_booking.session_type, 'practice')
        AND bp.service_product_id IS NOT NULL
      LIMIT 1;
      IF v_product IS NOT NULL THEN
        NEW.product_id := v_product;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- 2) Hour / membership packages → hour_packages.service_product_id
  --    hours_transactions stores the package label in `note` (there is no
  --    `description` column). Prefer an exact label match, then hours match.
  IF NEW.hours_transaction_id IS NOT NULL THEN
    SELECT hp.service_product_id INTO v_product
    FROM public.hours_transactions ht
    JOIN public.hour_packages hp
      ON hp.label = ht.note
    WHERE ht.id = NEW.hours_transaction_id
      AND hp.service_product_id IS NOT NULL
    LIMIT 1;

    IF v_product IS NULL THEN
      SELECT hp.service_product_id INTO v_product
      FROM public.hours_transactions ht
      JOIN public.hour_packages hp
        ON hp.hours = ht.hours
      WHERE ht.id = NEW.hours_transaction_id
        AND hp.service_product_id IS NOT NULL
      LIMIT 1;
    END IF;

    IF v_product IS NOT NULL THEN
      NEW.product_id := v_product;
      RETURN NEW;
    END IF;
  END IF;

  -- 3) League registrations → leagues.service_product_id
  IF NEW.transaction_type = 'league_registration'
     AND NEW.metadata ? 'league_id' THEN
    SELECT l.service_product_id INTO v_product
    FROM public.leagues l
    WHERE l.id = (NEW.metadata->>'league_id')::uuid
      AND l.service_product_id IS NOT NULL;
    IF v_product IS NOT NULL THEN
      NEW.product_id := v_product;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;