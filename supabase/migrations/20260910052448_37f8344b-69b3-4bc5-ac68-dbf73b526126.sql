-- ─────────────────────────────────────────────────────────────────────────────
-- Pass 4: product + tax-code stamping at capture, plus historical backfill
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Clean existing codes: trim whitespace, empty string -> NULL
UPDATE public.products
   SET hsn_code = NULLIF(btrim(hsn_code), ''),
       sac_code = NULLIF(btrim(sac_code), '')
 WHERE hsn_code IS DISTINCT FROM NULLIF(btrim(hsn_code), '')
    OR sac_code IS DISTINCT FROM NULLIF(btrim(sac_code), '');

UPDATE public.invoice_line_items
   SET hsn_code = NULLIF(btrim(hsn_code), ''),
       sac_code = NULLIF(btrim(sac_code), '')
 WHERE hsn_code IS DISTINCT FROM NULLIF(btrim(hsn_code), '')
    OR sac_code IS DISTINCT FROM NULLIF(btrim(sac_code), '');

-- 2) Keep them clean: one normaliser used by both tables
CREATE OR REPLACE FUNCTION public.normalize_tax_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.hsn_code := NULLIF(btrim(COALESCE(NEW.hsn_code, '')), '');
  NEW.sac_code := NULLIF(btrim(COALESCE(NEW.sac_code, '')), '');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_tax_codes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS normalize_tax_codes_on_products ON public.products;
CREATE TRIGGER normalize_tax_codes_on_products
BEFORE INSERT OR UPDATE OF hsn_code, sac_code ON public.products
FOR EACH ROW EXECUTE FUNCTION public.normalize_tax_codes();

DROP TRIGGER IF EXISTS normalize_tax_codes_on_invoice_line_items ON public.invoice_line_items;
CREATE TRIGGER normalize_tax_codes_on_invoice_line_items
BEFORE INSERT OR UPDATE OF hsn_code, sac_code ON public.invoice_line_items
FOR EACH ROW EXECUTE FUNCTION public.normalize_tax_codes();

-- 3) Single resolver for "which product was sold?", shared by the trigger and
--    the backfill. Deterministic and side-effect free.
CREATE OR REPLACE FUNCTION public.resolve_product_for_revenue(
  p_revenue_id uuid,
  p_city text,
  p_transaction_type text,
  p_booking_id uuid,
  p_hours_transaction_id uuid,
  p_metadata jsonb
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product uuid;
  v_city text;
  v_session text;
  v_day_type text;
BEGIN
  -- a) explicit product in metadata (legacy shop orders / purchases)
  BEGIN
    v_product := NULLIF(p_metadata->>'product_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_product := NULL;
  END;
  IF v_product IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.products WHERE id = v_product) THEN
    RETURN v_product;
  END IF;
  v_product := NULL;

  -- b) bay booking -> bay_pricing(city, day_type, session_type)
  IF p_booking_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(COALESCE(b.city, '')), ''), p_city),
           COALESCE(NULLIF(btrim(COALESCE(b.session_type, '')), ''), 'practice'),
           CASE WHEN EXTRACT(DOW FROM (b.start_time AT TIME ZONE 'Asia/Kolkata')) IN (0, 6)
                THEN 'weekend' ELSE 'weekday' END
      INTO v_city, v_session, v_day_type
      FROM public.bookings b
     WHERE b.id = p_booking_id;

    IF v_city IS NOT NULL THEN
      SELECT bp.service_product_id INTO v_product
        FROM public.bay_pricing bp
       WHERE bp.city = v_city
         AND bp.session_type = v_session
         AND bp.day_type = v_day_type
         AND bp.service_product_id IS NOT NULL
       LIMIT 1;

      IF v_product IS NULL THEN
        -- same session type, any day type
        SELECT bp.service_product_id INTO v_product
          FROM public.bay_pricing bp
         WHERE bp.city = v_city
           AND bp.session_type = v_session
           AND bp.service_product_id IS NOT NULL
         LIMIT 1;
      END IF;
      IF v_product IS NOT NULL THEN RETURN v_product; END IF;
    END IF;
  END IF;

  -- c) hour / membership package purchase
  IF p_hours_transaction_id IS NOT NULL THEN
    SELECT hp.service_product_id INTO v_product
      FROM public.hours_transactions ht
      JOIN public.hour_packages hp
        ON hp.label = ht.note OR hp.hours = ht.hours
     WHERE ht.id = p_hours_transaction_id
       AND hp.service_product_id IS NOT NULL
     ORDER BY (hp.label = ht.note) DESC
     LIMIT 1;
    IF v_product IS NOT NULL THEN RETURN v_product; END IF;
  END IF;

  -- d) league registration
  IF p_transaction_type = 'league_registration' AND p_metadata ? 'league_id' THEN
    BEGIN
      SELECT l.service_product_id INTO v_product
        FROM public.leagues l
       WHERE l.id = (p_metadata->>'league_id')::uuid
         AND l.service_product_id IS NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      v_product := NULL;
    END;
    IF v_product IS NOT NULL THEN RETURN v_product; END IF;
  END IF;

  -- e) an itemised invoice already tells us what was sold
  IF p_revenue_id IS NOT NULL THEN
    SELECT li.product_id INTO v_product
      FROM public.invoices i
      JOIN public.invoice_line_items li ON li.invoice_id = i.id
     WHERE i.revenue_transaction_id = p_revenue_id
       AND i.invoice_type = 'invoice'
       AND li.product_id IS NOT NULL
     ORDER BY li.line_total DESC NULLS LAST, li.sort_order
     LIMIT 1;
    IF v_product IS NOT NULL THEN RETURN v_product; END IF;
  END IF;

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_product_for_revenue(uuid, text, text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- 4) Stamp the product on the revenue row, on insert and when the links appear
CREATE OR REPLACE FUNCTION public.resolve_revenue_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.product_id := public.resolve_product_for_revenue(
    NEW.id, NEW.city, NEW.transaction_type,
    NEW.booking_id, NEW.hours_transaction_id, COALESCE(NEW.metadata, '{}'::jsonb)
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_revenue_product() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS resolve_revenue_product_before_insert ON public.revenue_transactions;
CREATE TRIGGER resolve_revenue_product_before_insert
BEFORE INSERT ON public.revenue_transactions
FOR EACH ROW EXECUTE FUNCTION public.resolve_revenue_product();

DROP TRIGGER IF EXISTS resolve_revenue_product_before_update ON public.revenue_transactions;
CREATE TRIGGER resolve_revenue_product_before_update
BEFORE UPDATE OF booking_id, hours_transaction_id, metadata ON public.revenue_transactions
FOR EACH ROW EXECUTE FUNCTION public.resolve_revenue_product();

-- 5) Invoice lines inherit the tax code and item type from their product
CREATE OR REPLACE FUNCTION public.stamp_invoice_line_tax_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product RECORD;
BEGIN
  NEW.hsn_code := NULLIF(btrim(COALESCE(NEW.hsn_code, '')), '');
  NEW.sac_code := NULLIF(btrim(COALESCE(NEW.sac_code, '')), '');

  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.hsn_code IS NOT NULL OR NEW.sac_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(btrim(COALESCE(p.hsn_code, '')), '') AS hsn,
         NULLIF(btrim(COALESCE(p.sac_code, '')), '') AS sac,
         p.item_type
    INTO v_product
    FROM public.products p
   WHERE p.id = NEW.product_id;

  IF FOUND THEN
    NEW.hsn_code  := v_product.hsn;
    NEW.sac_code  := v_product.sac;
    NEW.item_type := COALESCE(NEW.item_type, v_product.item_type);
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stamp_invoice_line_tax_codes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stamp_invoice_line_tax_codes_before_write ON public.invoice_line_items;
CREATE TRIGGER stamp_invoice_line_tax_codes_before_write
BEFORE INSERT OR UPDATE OF product_id, hsn_code, sac_code ON public.invoice_line_items
FOR EACH ROW EXECUTE FUNCTION public.stamp_invoice_line_tax_codes();

-- 6) A taxable product needs a code, and a code may not be blanked out
CREATE OR REPLACE FUNCTION public.validate_product_tax_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NULLIF(btrim(COALESCE(NEW.hsn_code, '')), ''),
              NULLIF(btrim(COALESCE(NEW.sac_code, '')), '')) IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.gst_rate, 0) > 0 THEN
      RAISE EXCEPTION 'products: an HSN or SAC code is required when GST is above zero (%)', NEW.name;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: never let an existing code be cleared
  IF COALESCE(NULLIF(btrim(COALESCE(OLD.hsn_code, '')), ''),
              NULLIF(btrim(COALESCE(OLD.sac_code, '')), '')) IS NOT NULL THEN
    RAISE EXCEPTION 'products: the HSN/SAC code cannot be removed once set (%)', NEW.name;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_product_tax_codes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_product_tax_codes_before_write ON public.products;
CREATE TRIGGER validate_product_tax_codes_before_write
BEFORE INSERT OR UPDATE OF hsn_code, sac_code, gst_rate ON public.products
FOR EACH ROW EXECUTE FUNCTION public.validate_product_tax_codes();

-- 7) Backfill: tag historical sales with the product they were for.
--    Amounts, cities and dates are untouched.
UPDATE public.revenue_transactions r
   SET product_id = public.resolve_product_for_revenue(
         r.id, r.city, r.transaction_type, r.booking_id, r.hours_transaction_id,
         COALESCE(r.metadata, '{}'::jsonb))
 WHERE r.product_id IS NULL
   AND r.amount > 0
   AND public.resolve_product_for_revenue(
         r.id, r.city, r.transaction_type, r.booking_id, r.hours_transaction_id,
         COALESCE(r.metadata, '{}'::jsonb)) IS NOT NULL;

-- Refunds inherit the product of the sale they reverse
UPDATE public.revenue_transactions r
   SET product_id = o.product_id
  FROM public.revenue_transactions o
 WHERE r.product_id IS NULL
   AND r.original_transaction_id = o.id
   AND o.product_id IS NOT NULL;

-- 8) Backfill: invoice lines take the code from their product
UPDATE public.invoice_line_items li
   SET hsn_code = NULLIF(btrim(COALESCE(p.hsn_code, '')), ''),
       sac_code = NULLIF(btrim(COALESCE(p.sac_code, '')), ''),
       item_type = COALESCE(li.item_type, p.item_type)
  FROM public.products p
 WHERE li.product_id = p.id
   AND li.hsn_code IS NULL
   AND li.sac_code IS NULL
   AND COALESCE(NULLIF(btrim(COALESCE(p.hsn_code, '')), ''),
                NULLIF(btrim(COALESCE(p.sac_code, '')), '')) IS NOT NULL;

-- 9) Backfill: single-line invoices inherit the product from their revenue row
UPDATE public.invoice_line_items li
   SET product_id = r.product_id
  FROM public.invoices i
  JOIN public.revenue_transactions r ON r.id = i.revenue_transaction_id
 WHERE li.invoice_id = i.id
   AND li.product_id IS NULL
   AND r.product_id IS NOT NULL
   AND (SELECT count(*) FROM public.invoice_line_items x WHERE x.invoice_id = i.id) = 1;

UPDATE public.invoice_line_items li
   SET hsn_code = NULLIF(btrim(COALESCE(p.hsn_code, '')), ''),
       sac_code = NULLIF(btrim(COALESCE(p.sac_code, '')), ''),
       item_type = COALESCE(li.item_type, p.item_type)
  FROM public.products p
 WHERE li.product_id = p.id
   AND li.hsn_code IS NULL
   AND li.sac_code IS NULL
   AND COALESCE(NULLIF(btrim(COALESCE(p.hsn_code, '')), ''),
                NULLIF(btrim(COALESCE(p.sac_code, '')), '')) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_transactions_product_id
  ON public.revenue_transactions (product_id);