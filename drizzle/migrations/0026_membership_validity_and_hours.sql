-- Catalogue and settings fields
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS membership_validity_months integer;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS membership_hours numeric(8,2);
ALTER TABLE public.products ADD CONSTRAINT products_membership_validity_check CHECK (membership_validity_months IS NULL OR membership_validity_months BETWEEN 1 AND 60);
ALTER TABLE public.products ADD CONSTRAINT products_membership_hours_check CHECK (membership_hours IS NULL OR membership_hours >= 0);
ALTER TABLE public.hour_packages ADD COLUMN IF NOT EXISTS membership_validity_months integer;
ALTER TABLE public.hour_packages ADD CONSTRAINT hour_packages_membership_validity_check CHECK (membership_validity_months IS NULL OR membership_validity_months BETWEEN 1 AND 60);
ALTER TABLE public.pending_purchases ADD COLUMN IF NOT EXISTS membership_validity_months integer;
ALTER TABLE public.bay_config ADD COLUMN IF NOT EXISTS membership_hours_auto_expire boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.products_public WITH (security_invoker=true) AS
SELECT id, name, description, category, item_type, in_stock, sku, unit_of_measure, price, hsn_code, sac_code, gst_rate,
  opening_stock, reorder_level, reorder_quantity, duration_minutes, bookable, city, corporate_account_id, badge, sizes, colors,
  sort_order, image_url, created_at, updated_at, legacy_sku, vendor_id, membership_validity_months, membership_hours
FROM public.products;

ALTER TABLE public.hours_transactions DROP CONSTRAINT IF EXISTS hours_transactions_type_check;
ALTER TABLE public.hours_transactions ADD CONSTRAINT hours_transactions_type_check CHECK (type = ANY (ARRAY['purchase','deduction','adjustment','refund','credit','expired']));

-- One row per membership sold from now on. Amount, dates and hours are fixed at sale time.
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  city text NOT NULL,
  label text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  revenue_transaction_id uuid REFERENCES public.revenue_transactions(id),
  invoice_line_item_id uuid UNIQUE,
  sold_on date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  validity_months integer NOT NULL CHECK (validity_months BETWEEN 1 AND 60),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  hours numeric(8,2) NOT NULL DEFAULT 0 CHECK (hours >= 0),
  hours_remaining numeric(8,2) NOT NULL DEFAULT 0 CHECK (hours_remaining >= 0 AND hours_remaining <= hours),
  hours_state text NOT NULL DEFAULT 'active' CHECK (hours_state IN ('active','expired','kept','removed')),
  hours_closed numeric(8,2) NOT NULL DEFAULT 0,
  hours_closed_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','void')),
  cancelled_on date,
  refund_amount numeric(12,2),
  refund_transaction_id uuid REFERENCES public.revenue_transactions(id),
  credit_note_id uuid,
  cancel_note text,
  cancelled_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_dates_check CHECK (ends_on >= starts_on AND starts_on >= sold_on)
);
CREATE UNIQUE INDEX memberships_online_sale_key ON public.memberships(revenue_transaction_id) WHERE invoice_line_item_id IS NULL;
CREATE INDEX memberships_hours_order_idx ON public.memberships(user_id, hours_state, ends_on);
CREATE INDEX memberships_city_sold_idx ON public.memberships(city, sold_on);
GRANT SELECT ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read memberships in their cities" ON public.memberships FOR SELECT TO authenticated
  USING (public.is_admin_or_site_admin(auth.uid()) AND public.has_city_access(auth.uid(), city));
CREATE POLICY "Members read their own memberships" ON public.memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = memberships.user_id AND p.user_id = auth.uid()));

-- Last day of a membership: same day-of-month minus one, or the month end when the target month is shorter.
CREATE OR REPLACE FUNCTION public.membership_end_date(p_start date, p_months integer)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE WHEN extract(day FROM (p_start + make_interval(months => p_months))::date) < extract(day FROM p_start)
    THEN (p_start + make_interval(months => p_months))::date
    ELSE (p_start + make_interval(months => p_months))::date - 1 END
$$;

-- The member_hours key used everywhere for a customer: their sign-in id when they have one, else the profile id.
CREATE OR REPLACE FUNCTION public.member_hours_key(p_customer uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT coalesce(p.user_id, p.id) FROM public.profiles p WHERE p.user_id = p_customer OR p.id = p_customer
    ORDER BY (p.user_id = p_customer) DESC NULLS LAST LIMIT 1), p_customer)
$$;

-- Membership hours left can never exceed the member's balance; trim soonest-expiring first.
CREATE OR REPLACE FUNCTION public.membership_hours_clamp(p_key uuid, p_balance numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_excess numeric; r record; v_step numeric;
BEGIN
  SELECT coalesce(sum(hours_remaining),0) - greatest(coalesce(p_balance,0),0) INTO v_excess
    FROM public.memberships WHERE user_id = p_key AND status = 'active' AND hours_state = 'active';
  IF v_excess <= 0 THEN RETURN; END IF;
  FOR r IN SELECT id, hours_remaining FROM public.memberships
    WHERE user_id = p_key AND status = 'active' AND hours_state = 'active' AND hours_remaining > 0
    ORDER BY ends_on, starts_on, created_at FOR UPDATE LOOP
    EXIT WHEN v_excess <= 0;
    v_step := least(v_excess, r.hours_remaining);
    UPDATE public.memberships SET hours_remaining = hours_remaining - v_step, updated_at = now() WHERE id = r.id;
    v_excess := v_excess - v_step;
  END LOOP;
END $$;

-- Every change to a member's hours balance is shared out over their memberships:
-- hours used come from the soonest-expiring membership first; hours given back return there first.
CREATE OR REPLACE FUNCTION public.membership_hours_follow_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_take numeric; v_back numeric; r record; v_step numeric;
BEGIN
  IF coalesce(current_setting('app.membership_hours_direct', true), '') = 'on' THEN RETURN NEW; END IF;
  v_take := greatest(coalesce(NEW.hours_used,0) - coalesce(OLD.hours_used,0), 0) + greatest(coalesce(OLD.hours_purchased,0) - coalesce(NEW.hours_purchased,0), 0);
  v_back := greatest(coalesce(OLD.hours_used,0) - coalesce(NEW.hours_used,0), 0);
  IF v_take > 0 THEN
    FOR r IN SELECT id, hours_remaining FROM public.memberships
      WHERE user_id = NEW.user_id AND status = 'active' AND hours_state = 'active' AND hours_remaining > 0
      ORDER BY ends_on, starts_on, created_at FOR UPDATE LOOP
      EXIT WHEN v_take <= 0;
      v_step := least(v_take, r.hours_remaining);
      UPDATE public.memberships SET hours_remaining = hours_remaining - v_step, updated_at = now() WHERE id = r.id;
      v_take := v_take - v_step;
    END LOOP;
  END IF;
  IF v_back > 0 THEN
    FOR r IN SELECT id, hours - hours_remaining AS room FROM public.memberships
      WHERE user_id = NEW.user_id AND status = 'active' AND hours_state = 'active' AND hours_remaining < hours
      ORDER BY ends_on, starts_on, created_at FOR UPDATE LOOP
      EXIT WHEN v_back <= 0;
      v_step := least(v_back, r.room);
      UPDATE public.memberships SET hours_remaining = hours_remaining + v_step, updated_at = now() WHERE id = r.id;
      v_back := v_back - v_step;
    END LOOP;
  END IF;
  PERFORM public.membership_hours_clamp(NEW.user_id, coalesce(NEW.hours_purchased,0) - coalesce(NEW.hours_used,0));
  RETURN NEW;
END $$;
CREATE TRIGGER membership_hours_follow_balance AFTER UPDATE OF hours_purchased, hours_used ON public.member_hours
  FOR EACH ROW EXECUTE FUNCTION public.membership_hours_follow_balance();

-- Records a membership sale; optionally adds its hours (in-person invoices). Online purchases add hours themselves.
CREATE OR REPLACE FUNCTION public.create_membership_record(
  p_customer uuid, p_city text, p_label text, p_product uuid, p_revenue uuid, p_line uuid, p_sold_on date,
  p_amount numeric, p_months integer, p_starts_on date, p_hours numeric, p_actor uuid, p_credit_hours boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_key uuid := public.member_hours_key(p_customer); v_start date := coalesce(p_starts_on, p_sold_on);
  v_end date; v_hours numeric := greatest(coalesce(p_hours,0),0); v_id uuid; v_balance numeric;
BEGIN
  IF v_key IS NULL THEN RAISE EXCEPTION 'Choose a customer for a membership sale'; END IF;
  IF p_months IS NULL OR p_months NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Membership validity must be 1 to 60 months'; END IF;
  IF v_start < p_sold_on THEN RAISE EXCEPTION 'A membership cannot start before the sale date'; END IF;
  IF v_start > p_sold_on + 366 THEN RAISE EXCEPTION 'A membership must start within a year of the sale date'; END IF;
  v_end := public.membership_end_date(v_start, p_months);
  IF p_credit_hours AND v_hours > 0 THEN
    INSERT INTO public.member_hours(user_id, hours_purchased, hours_used) VALUES (v_key, v_hours, 0)
      ON CONFLICT (user_id) DO UPDATE SET hours_purchased = public.member_hours.hours_purchased + EXCLUDED.hours_purchased, updated_at = now();
    INSERT INTO public.hours_transactions(user_id, type, hours, note, reason, created_by)
      VALUES (v_key, 'purchase', v_hours, p_label || ' membership, valid ' || to_char(v_start,'DD Mon YYYY') || ' to ' || to_char(v_end,'DD Mon YYYY'), 'Membership', p_actor);
  END IF;
  INSERT INTO public.memberships(user_id, city, label, product_id, revenue_transaction_id, invoice_line_item_id, sold_on, amount,
      validity_months, starts_on, ends_on, hours, hours_remaining, created_by)
    VALUES (v_key, p_city, p_label, p_product, p_revenue, p_line, p_sold_on, round(greatest(coalesce(p_amount,0),0),2),
      p_months, v_start, v_end, v_hours, v_hours, p_actor)
    RETURNING id INTO v_id;
  SELECT hours_purchased - hours_used INTO v_balance FROM public.member_hours WHERE user_id = v_key FOR UPDATE;
  PERFORM public.membership_hours_clamp(v_key, coalesce(v_balance,0));
  RETURN v_id;
END $$;

-- Ends a membership's own hours: expired (removed by the switch), kept (switch off), or removed (cancelled / invoice deleted).
CREATE OR REPLACE FUNCTION public.close_membership_hours(p_membership_id uuid, p_state text, p_note text, p_actor uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.memberships; v_balance numeric; v_take numeric := 0;
BEGIN
  IF p_state NOT IN ('expired','kept','removed') THEN RAISE EXCEPTION 'Invalid membership hours state'; END IF;
  SELECT * INTO m FROM public.memberships WHERE id = p_membership_id FOR UPDATE;
  IF NOT FOUND OR m.hours_state <> 'active' THEN RETURN 0; END IF;
  IF p_state <> 'kept' AND m.hours_remaining > 0 THEN
    SELECT hours_purchased - hours_used INTO v_balance FROM public.member_hours WHERE user_id = m.user_id FOR UPDATE;
    v_take := least(m.hours_remaining, greatest(coalesce(v_balance,0),0));
    IF v_take > 0 THEN
      PERFORM set_config('app.membership_hours_direct', 'on', true);
      UPDATE public.member_hours SET hours_used = hours_used + v_take, updated_at = now() WHERE user_id = m.user_id;
      PERFORM set_config('app.membership_hours_direct', 'off', true);
      INSERT INTO public.hours_transactions(user_id, type, hours, note, reason, created_by)
        VALUES (m.user_id, CASE WHEN p_state = 'expired' THEN 'expired' ELSE 'deduction' END, v_take, p_note,
          CASE WHEN p_state = 'expired' THEN 'Membership expired' ELSE 'Membership cancelled' END, p_actor);
    END IF;
  END IF;
  UPDATE public.memberships SET hours_state = p_state,
      hours_closed = CASE WHEN p_state = 'kept' THEN m.hours_remaining ELSE v_take END,
      hours_remaining = 0, hours_closed_at = now(), updated_at = now()
    WHERE id = m.id;
  RETURN v_take;
END $$;

-- Runs hourly. After a membership's last day (in its city's time), its unused hours expire when the city's
-- switch is on; when it is off they are kept for good.
CREATE OR REPLACE FUNCTION public.expire_membership_hours()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT m.id, m.label, m.ends_on, coalesce(bc.membership_hours_auto_expire, false) AS auto_expire
    FROM public.memberships m
    LEFT JOIN public.bay_config bc ON bc.city = m.city
    WHERE m.status = 'active' AND m.hours_state = 'active'
      AND m.ends_on < (now() AT TIME ZONE coalesce(nullif(bc.timezone,''), 'Asia/Kolkata'))::date
    ORDER BY m.ends_on, m.created_at LOOP
    PERFORM public.close_membership_hours(r.id, CASE WHEN r.auto_expire THEN 'expired' ELSE 'kept' END,
      r.label || ' membership ended ' || to_char(r.ends_on, 'DD Mon YYYY'), NULL);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- A sale that stops counting (invoice deleted) voids its membership and removes the hours it added.
CREATE OR REPLACE FUNCTION public.void_memberships_for_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
  IF OLD.status = 'confirmed' AND NEW.status <> 'confirmed' THEN
    FOR r IN SELECT id, label FROM public.memberships WHERE revenue_transaction_id = NEW.id AND status = 'active' FOR UPDATE LOOP
      PERFORM public.close_membership_hours(r.id, 'removed', r.label || ' membership invoice removed', auth.uid());
      UPDATE public.memberships SET status = 'void', updated_at = now() WHERE id = r.id;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER void_memberships_for_sale AFTER UPDATE OF status ON public.revenue_transactions
  FOR EACH ROW EXECUTE FUNCTION public.void_memberships_for_sale();
CREATE OR REPLACE FUNCTION public.complete_hour_purchase(p_user_id uuid, p_hours integer, p_amount numeric, p_currency text, p_order_id text, p_payment_id text, p_description text, p_city text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_htxn_id uuid;
  v_rev_id uuid;
  v_existing_rev_id uuid;
  v_existing_htxn_id uuid;
  v_months integer;
  v_label text;
  v_sale public.revenue_transactions;
BEGIN
  -- ── Race-safe finalization ──
  -- Multiple finalizers (browser confirm-hour-purchase, razorpay-webhook,
  -- reconcile-pending-payments cron, Razorpay duplicate webhooks) can fire
  -- the same payment_id in parallel. We must NEVER double-credit hours.
  --
  -- Step 1: Take a row lock on the pending_purchases row so concurrent
  -- finalizers serialize through this function for the same order_id.
  PERFORM 1 FROM public.pending_purchases
    WHERE razorpay_order_id = p_order_id
    FOR UPDATE;

  -- Step 2: Idempotency guard. revenue_transactions.gateway_payment_ref is
  -- UNIQUE — if a sibling already inserted, we return the existing ids and
  -- do NOT touch member_hours / hours_transactions a second time.
  SELECT rt.id, rt.hours_transaction_id
    INTO v_existing_rev_id, v_existing_htxn_id
  FROM public.revenue_transactions rt
  WHERE rt.gateway_payment_ref = p_payment_id
  LIMIT 1;

  IF v_existing_rev_id IS NOT NULL THEN
    -- Defensive: ensure pending_purchases reflects completion even if the
    -- winning finalizer failed to update it before crashing.
    UPDATE public.pending_purchases
      SET status = 'completed',
          hours_transaction_id = COALESCE(hours_transaction_id, v_existing_htxn_id),
          revenue_transaction_id = COALESCE(revenue_transaction_id, v_existing_rev_id),
          updated_at = now()
      WHERE razorpay_order_id = p_order_id
        AND status IS DISTINCT FROM 'completed';
    RETURN jsonb_build_object(
      'hours_transaction_id', v_existing_htxn_id,
      'revenue_transaction_id', v_existing_rev_id,
      'already_completed', true
    );
  END IF;

  -- 1. Upsert member_hours
  INSERT INTO public.member_hours (user_id, hours_purchased, hours_used)
  VALUES (p_user_id, p_hours, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET hours_purchased = member_hours.hours_purchased + p_hours,
      updated_at = now();

  -- 2. Log hours transaction
  INSERT INTO public.hours_transactions (user_id, type, hours, note)
  VALUES (p_user_id, 'purchase', p_hours, p_description)
  RETURNING id INTO v_htxn_id;

  -- 3. Record revenue transaction. The UNIQUE (gateway_payment_ref) constraint
  -- is our final safety net — if a concurrent finalizer slipped past the lock
  -- (e.g. cron under load), the second insert raises 23505 and the whole
  -- transaction rolls back, preserving idempotency.
  INSERT INTO public.revenue_transactions (
    transaction_type, amount, currency, user_id,
    hours_transaction_id, gateway_name,
    gateway_order_ref, gateway_payment_ref,
    description, status, city
  ) VALUES (
    'payment', p_amount, p_currency, p_user_id,
    v_htxn_id, 'razorpay',
    p_order_id, p_payment_id,
    p_description, 'confirmed', p_city
  ) RETURNING id INTO v_rev_id;

  -- 4. A package with a validity period is a membership: record its term. Hours were added in step 1.
  SELECT membership_validity_months, package_label INTO v_months, v_label
    FROM public.pending_purchases WHERE razorpay_order_id = p_order_id;
  IF v_months IS NOT NULL THEN
    SELECT * INTO v_sale FROM public.revenue_transactions WHERE id = v_rev_id;
    PERFORM public.create_membership_record(
      p_user_id, v_sale.city, coalesce(nullif(v_label,''), p_description), v_sale.product_id, v_rev_id, NULL,
      coalesce(v_sale.revenue_date, (v_sale.created_at AT TIME ZONE 'Asia/Kolkata')::date), p_amount, v_months,
      NULL, p_hours, NULL, false);
  END IF;

  -- 5. Update pending_purchases
  UPDATE public.pending_purchases
  SET status = 'completed',
      hours_transaction_id = v_htxn_id,
      revenue_transaction_id = v_rev_id,
      updated_at = now()
  WHERE razorpay_order_id = p_order_id;

  RETURN jsonb_build_object(
    'hours_transaction_id', v_htxn_id,
    'revenue_transaction_id', v_rev_id,
    'already_completed', false
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_manual_invoice_atomic(p_operation_id uuid, p_invoice jsonb, p_lines jsonb, p_booking jsonb DEFAULT NULL::jsonb, p_add_profile boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid(); v_city text := p_invoice->>'city'; v_gst public.gst_profiles%ROWTYPE; v_fy uuid;
  v_number text; v_revenue uuid; v_customer uuid; v_profile public.profiles%ROWTYPE; v_invoice public.invoices%ROWTYPE;
  v_booking uuid; v_booking_user uuid; v_registered boolean; v_sequence text;
  v_line jsonb; v_line_id uuid; v_product public.products%ROWTYPE; v_lines_total numeric; v_invoice_date date; v_start date;
BEGIN
  IF v_actor IS NULL OR NOT (public.has_role(v_actor,'admin') OR (public.has_role(v_actor,'site_admin') AND public.has_city_access(v_actor,v_city))) THEN RAISE EXCEPTION 'Administrator city access required'; END IF;
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'Operation ID required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_operation_id;
  IF FOUND THEN
    IF v_invoice.city IS DISTINCT FROM v_city THEN RAISE EXCEPTION 'Operation city mismatch'; END IF;
    RETURN to_jsonb(v_invoice);
  END IF;
  SELECT * INTO v_gst FROM public.gst_profiles WHERE city=v_city;
  IF NOT FOUND THEN RAISE EXCEPTION 'GST profile not configured'; END IF;
  SELECT id INTO v_fy FROM public.financial_years WHERE is_active AND (city=v_city OR city IS NULL) ORDER BY city NULLS LAST LIMIT 1;
  IF v_fy IS NULL THEN RAISE EXCEPTION 'No active financial year configured'; END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'Invoice line items required'; END IF;
  v_customer := nullif(p_invoice->>'customer_user_id','')::uuid;
  IF v_customer IS NULL AND p_add_profile THEN
    IF nullif(btrim(p_invoice->>'customer_email'),'') IS NOT NULL THEN
      SELECT * INTO v_profile FROM public.profiles WHERE lower(email)=lower(btrim(p_invoice->>'customer_email')) LIMIT 1;
    ELSE
      SELECT * INTO v_profile FROM public.profiles WHERE display_name=p_invoice->>'customer_name' AND (nullif(p_invoice->>'customer_phone','') IS NULL OR phone=p_invoice->>'customer_phone') LIMIT 1;
    END IF;
    IF v_profile.id IS NULL THEN
      INSERT INTO public.profiles(display_name,email,phone,preferred_city,user_type) VALUES(p_invoice->>'customer_name',nullif(lower(btrim(p_invoice->>'customer_email')),''),nullif(p_invoice->>'customer_phone',''),v_city,'guest') RETURNING * INTO v_profile;
    END IF;
    v_customer := coalesce(v_profile.user_id,v_profile.id);
  END IF;
  IF p_booking IS NOT NULL THEN
    v_booking_user := coalesce(nullif(p_booking->>'user_id','')::uuid,v_customer);
    IF v_booking_user IS NULL THEN RAISE EXCEPTION 'Booking customer required'; END IF;
    IF nullif(p_booking->>'start_time','') IS NULL OR nullif(p_booking->>'end_time','') IS NULL THEN RAISE EXCEPTION 'Booking date and times required'; END IF;
    IF nullif(p_booking->>'bay_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bays WHERE id=(p_booking->>'bay_id')::uuid AND city=v_city) THEN RAISE EXCEPTION 'Booking bay city mismatch'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_booking_user::text||coalesce(p_booking->>'bay_id','')||(p_booking->>'start_time')::timestamptz::text,0));
    IF EXISTS(SELECT 1 FROM public.bookings WHERE user_id=v_booking_user AND bay_id=nullif(p_booking->>'bay_id','')::uuid AND start_time=(p_booking->>'start_time')::timestamptz AND status IN ('confirmed','completed','pending')) THEN RAISE EXCEPTION 'A booking already exists for this customer at this bay and time'; END IF;
  END IF;
  v_registered := coalesce(v_gst.is_gst_registered,true);
  v_sequence := CASE WHEN v_registered THEN v_gst.gstin ELSE 'NOGST-'||v_city END;
  v_number := public.get_next_invoice_number(v_sequence,v_fy,coalesce(nullif(v_gst.invoice_prefix,''),'INV'),coalesce(v_gst.invoice_start_number,1),CASE WHEN p_invoice->>'invoice_type'='credit_note' THEN 'credit_note' ELSE 'tax_invoice' END);
  v_revenue := public.record_revenue(p_source_ref=>'manual_invoice:'||p_operation_id::text,p_transaction_type=>CASE WHEN p_invoice->>'invoice_category'='booking' THEN 'booking' ELSE 'purchase' END,p_amount=>(p_invoice->>'total')::numeric,p_description=>'Invoice for '||(p_invoice->>'customer_name'),p_city=>v_city,p_user_id=>v_customer,p_gateway_name=>nullif(p_invoice->>'payment_method',''),p_revenue_date=>(p_invoice->>'invoice_date')::date,p_metadata=>jsonb_build_object('manual_invoice',true,'manual_invoice_operation_id',p_operation_id));
  v_invoice := jsonb_populate_record(NULL::public.invoices,p_invoice || jsonb_build_object('id',p_operation_id,'invoice_number',v_number,'financial_year_id',v_fy,'customer_user_id',v_customer,'revenue_transaction_id',v_revenue,'business_name',v_gst.legal_name,'business_gstin',CASE WHEN v_registered THEN v_gst.gstin ELSE '' END,'business_address',v_gst.address,'business_state',v_gst.state,'business_state_code',v_gst.state_code,'status','issued','created_at',now(),'updated_at',now()));
  INSERT INTO public.invoices SELECT v_invoice.*;
  v_invoice_date := coalesce(nullif(p_invoice->>'invoice_date','')::date,(now() AT TIME ZONE 'Asia/Kolkata')::date);
  SELECT coalesce(sum(coalesce(nullif(l->>'line_total','')::numeric,0)),0) INTO v_lines_total FROM jsonb_array_elements(p_lines) l;
  FOR v_line IN SELECT l FROM jsonb_array_elements(p_lines) l LOOP
    v_line_id := gen_random_uuid();
    INSERT INTO public.invoice_line_items SELECT r.* FROM jsonb_populate_record(NULL::public.invoice_line_items,(v_line - 'membership_starts_on') || jsonb_build_object('id',v_line_id,'invoice_id',p_operation_id,'created_at',now())) r;
    -- A catalogue item with a validity period is a membership: record its term and add its hours.
    IF coalesce(p_invoice->>'invoice_type','invoice') <> 'credit_note' AND nullif(v_line->>'product_id','') IS NOT NULL THEN
      SELECT * INTO v_product FROM public.products WHERE id=(v_line->>'product_id')::uuid;
      IF FOUND AND v_product.membership_validity_months IS NOT NULL THEN
        IF v_customer IS NULL THEN RAISE EXCEPTION 'Choose a customer for a membership sale'; END IF;
        v_start := coalesce(nullif(v_line->>'membership_starts_on','')::date,v_invoice_date);
        PERFORM public.create_membership_record(
          v_customer,v_city,v_product.name,v_product.id,v_revenue,v_line_id,v_invoice_date,
          CASE WHEN v_revenue IS NULL OR v_lines_total<=0 THEN 0 ELSE round((p_invoice->>'total')::numeric*coalesce(nullif(v_line->>'line_total','')::numeric,0)/v_lines_total,2) END,
          v_product.membership_validity_months,v_start,
          coalesce(v_product.membership_hours,0)*coalesce(nullif(v_line->>'quantity','')::numeric,1),
          v_actor,true);
      END IF;
    END IF;
  END LOOP;
  IF p_booking IS NOT NULL THEN
    INSERT INTO public.bookings(user_id,city,start_time,end_time,duration_minutes,status,session_type,bay_id,coach_name,note,invoice_id,manual_invoice_origin_id)
    VALUES(v_booking_user,v_city,(p_booking->>'start_time')::timestamptz,(p_booking->>'end_time')::timestamptz,(p_booking->>'duration_minutes')::int,'confirmed',coalesce(p_booking->>'session_type','practice'),nullif(p_booking->>'bay_id','')::uuid,nullif(p_booking->>'coach_name',''),'Invoice '||v_number,p_operation_id,p_operation_id) RETURNING id INTO v_booking;
    IF v_revenue IS NOT NULL THEN UPDATE public.revenue_transactions SET booking_id=v_booking WHERE id=v_revenue; END IF;
  END IF;
  RETURN to_jsonb(v_invoice);
END;
$function$;

-- Staff cancel a membership: optional refund (with credit note), unused hours removed, unearned revenue stops.
CREATE OR REPLACE FUNCTION public.cancel_membership(p_membership_id uuid, p_cancelled_on date, p_refund_amount numeric, p_refund_method text, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid := auth.uid(); m public.memberships; inv public.invoices; line public.invoice_line_items;
  v_refund numeric; v_refund_id uuid; v_cn uuid; v_cn_number text; v_fy uuid; v_ratio numeric; v_tax numeric;
  v_cgst numeric; v_sgst numeric; v_igst numeric; v_today date; v_hours numeric := 0; v_tz text;
BEGIN
  SELECT * INTO m FROM public.memberships WHERE id = p_membership_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Membership not found'; END IF;
  IF v_actor IS NULL OR NOT (public.has_role(v_actor,'admin') OR (public.has_role(v_actor,'site_admin') AND public.has_city_access(v_actor, m.city))) THEN
    RAISE EXCEPTION 'Administrator city access required';
  END IF;
  IF m.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'already_cancelled', true, 'refund_amount', coalesce(m.refund_amount,0));
  END IF;
  IF m.status <> 'active' THEN RAISE EXCEPTION 'This membership is no longer active'; END IF;
  SELECT nullif(timezone,'') INTO v_tz FROM public.bay_config WHERE city = m.city;
  v_today := (now() AT TIME ZONE coalesce(v_tz,'Asia/Kolkata'))::date;
  IF p_cancelled_on IS NULL OR p_cancelled_on < m.sold_on OR p_cancelled_on > v_today THEN
    RAISE EXCEPTION 'Cancellation date must be between the sale date and today';
  END IF;
  v_refund := round(coalesce(p_refund_amount,0), 2);
  IF v_refund < 0 OR v_refund > m.amount THEN RAISE EXCEPTION 'Refund must be between 0 and the membership amount'; END IF;

  IF v_refund > 0 THEN
    IF m.revenue_transaction_id IS NULL THEN RAISE EXCEPTION 'This membership has no payment to refund'; END IF;
    IF nullif(btrim(p_refund_method),'') IS NULL THEN RAISE EXCEPTION 'Choose how the refund was paid'; END IF;
    SELECT * INTO inv FROM public.invoices WHERE revenue_transaction_id = m.revenue_transaction_id AND invoice_type = 'invoice'
      ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The membership invoice was not found'; END IF;
    IF m.invoice_line_item_id IS NOT NULL THEN
      SELECT * INTO line FROM public.invoice_line_items WHERE id = m.invoice_line_item_id AND invoice_id = inv.id;
    ELSE
      SELECT * INTO line FROM public.invoice_line_items WHERE invoice_id = inv.id ORDER BY line_total DESC, sort_order LIMIT 1;
    END IF;
    IF line.id IS NULL OR coalesce(line.line_total,0) <= 0 THEN RAISE EXCEPTION 'The membership invoice line was not found'; END IF;
    SELECT id INTO v_fy FROM public.financial_years WHERE is_active AND (city = inv.city OR city IS NULL)
      ORDER BY (city = inv.city) DESC NULLS LAST LIMIT 1;
    IF v_fy IS NULL THEN RAISE EXCEPTION 'No active financial year for credit note'; END IF;

    v_refund_id := public.record_refund('membership_cancel:' || m.id, m.revenue_transaction_id, v_refund,
      'Membership cancellation refund: ' || m.label, btrim(p_refund_method), p_cancelled_on,
      jsonb_build_object('membership_id', m.id, 'note', nullif(btrim(p_note),'')));

    v_ratio := least(v_refund / line.line_total, 1);
    v_cgst := round(coalesce(line.cgst_amount,0) * v_ratio, 2);
    v_sgst := round(coalesce(line.sgst_amount,0) * v_ratio, 2);
    v_igst := round(coalesce(line.igst_amount,0) * v_ratio, 2);
    v_tax := v_cgst + v_sgst + v_igst;
    v_cn := gen_random_uuid();
    -- Allocate exactly one number before building the row.
    v_cn_number := public.get_next_invoice_number(
      CASE WHEN coalesce(inv.business_gstin,'') <> '' THEN inv.business_gstin ELSE 'NOGST-' || inv.city END,
      v_fy, 'CN', 1, 'credit_note');
    INSERT INTO public.invoices SELECT r.* FROM jsonb_populate_record(NULL::public.invoices, to_jsonb(inv) || jsonb_build_object(
      'id', v_cn, 'invoice_number', v_cn_number, 'invoice_date', p_cancelled_on, 'financial_year_id', v_fy,
      'status', 'issued', 'invoice_type', 'credit_note', 'credit_note_for', inv.id, 'revenue_transaction_id', v_refund_id,
      'credit_note_disposition', 'external_refund', 'subtotal', v_refund - v_tax, 'cgst_total', v_cgst, 'sgst_total', v_sgst,
      'igst_total', v_igst, 'total', v_refund, 'amount_paid', v_refund, 'payment_status', 'paid',
      'payment_method', btrim(p_refund_method), 'discount_type', NULL, 'discount_value', 0, 'discount_amount', 0,
      'notes', 'Membership cancellation refund', 'due_date', NULL, 'created_at', now(), 'updated_at', now())) r;
    INSERT INTO public.invoice_line_items SELECT r.* FROM jsonb_populate_record(NULL::public.invoice_line_items, to_jsonb(line) || jsonb_build_object(
      'id', gen_random_uuid(), 'invoice_id', v_cn, 'quantity', 1, 'unit_price', v_refund, 'line_total', v_refund,
      'cgst_amount', v_cgst, 'sgst_amount', v_sgst, 'igst_amount', v_igst, 'sort_order', 0, 'created_at', now())) r;
    IF abs(v_refund - coalesce(inv.total,0)) <= 0.01 THEN
      UPDATE public.invoices SET status = 'cancelled', updated_at = now() WHERE id = inv.id;
    END IF;
  END IF;

  IF m.hours_state = 'active' THEN
    v_hours := public.close_membership_hours(m.id, 'removed', m.label || ' membership cancelled', v_actor);
  END IF;
  UPDATE public.memberships SET status = 'cancelled', cancelled_on = p_cancelled_on, refund_amount = v_refund,
      refund_transaction_id = v_refund_id, credit_note_id = v_cn, cancel_note = nullif(btrim(p_note),''),
      cancelled_by = v_actor, updated_at = now()
    WHERE id = m.id;
  RETURN jsonb_build_object('success', true, 'already_cancelled', false, 'refund_amount', v_refund,
    'credit_note_number', v_cn_number, 'hours_removed', v_hours);
END $$;

REVOKE ALL ON FUNCTION public.membership_end_date(date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.membership_end_date(date, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.member_hours_key(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.membership_hours_clamp(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.membership_hours_follow_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_membership_record(uuid, text, text, uuid, uuid, uuid, date, numeric, integer, date, numeric, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_membership_hours(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_membership_hours() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.void_memberships_for_sale() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_membership(uuid, date, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_membership(uuid, date, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_hours_key(uuid), public.membership_hours_clamp(uuid, numeric),
  public.create_membership_record(uuid, text, text, uuid, uuid, uuid, date, numeric, integer, date, numeric, uuid, boolean),
  public.close_membership_hours(uuid, text, text, uuid), public.expire_membership_hours() TO service_role;

SELECT cron.schedule('expire-membership-hours', '20 * * * *', $cron$SELECT public.expire_membership_hours()$cron$);