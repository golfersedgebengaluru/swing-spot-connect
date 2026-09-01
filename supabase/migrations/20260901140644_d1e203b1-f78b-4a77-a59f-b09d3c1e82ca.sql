ALTER TABLE public.products ADD COLUMN IF NOT EXISTS legacy_sku text;

CREATE OR REPLACE FUNCTION public.generate_product_sku(_item_type text, _city text, _category text, _name text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_city text;
  v_cat text;
  v_name text;
  v_base text;
  v_suffix text;
  v_sku text;
  i int;
BEGIN
  v_prefix := CASE WHEN lower(coalesce(_item_type, 'product')) = 'service' THEN 'SVC' ELSE 'PRD' END;
  v_city := coalesce(nullif(upper(left(regexp_replace(coalesce(_city, ''), '[^A-Za-z]', '', 'g'), 3)), ''), 'GLB');
  v_cat := coalesce(nullif(upper(left(regexp_replace(coalesce(_category, ''), '[^A-Za-z0-9]', '', 'g'), 3)), ''), 'OTH');
  v_name := coalesce(nullif(upper(left(regexp_replace(coalesce(_name, ''), '[^A-Za-z0-9]', '', 'g'), 6)), ''), 'ITEM');
  v_base := v_prefix || '-' || v_city || '-' || v_cat || '-' || v_name;

  FOR i IN 1..100 LOOP
    SELECT string_agg(substr('0123456789ABCDEFGHIJKLMNPQRSTUVWXYZ', (floor(random() * 35))::int + 1, 1), '')
      INTO v_suffix
      FROM generate_series(1, 3);
    v_sku := v_base || '-' || v_suffix;
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE sku = v_sku) THEN
      RETURN v_sku;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Could not allocate a unique SKU for % after 100 attempts', v_base;
END;
$$;

CREATE OR REPLACE FUNCTION public.products_manage_sku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sku IS NULL OR btrim(NEW.sku) = '' THEN
      NEW.sku := public.generate_product_sku(NEW.item_type, NEW.city, NEW.category, NEW.name);
    ELSE
      NEW.sku := btrim(NEW.sku);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: blanking the SKU regenerates it; any other change is ignored (immutable).
  IF NEW.sku IS NULL OR btrim(NEW.sku) = '' THEN
    NEW.sku := public.generate_product_sku(NEW.item_type, NEW.city, NEW.category, NEW.name);
  ELSIF OLD.sku IS NOT NULL AND btrim(NEW.sku) <> OLD.sku THEN
    NEW.sku := OLD.sku;
  ELSE
    NEW.sku := btrim(NEW.sku);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_manage_sku ON public.products;
CREATE TRIGGER trg_products_manage_sku
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_manage_sku();

CREATE OR REPLACE VIEW public.products_public AS
  SELECT id, name, description, category, item_type, in_stock, sku, unit_of_measure,
         price, hsn_code, sac_code, gst_rate, opening_stock, reorder_level, reorder_quantity,
         duration_minutes, bookable, city, corporate_account_id, badge, sizes, colors,
         sort_order, image_url, created_at, updated_at, legacy_sku
    FROM public.products;