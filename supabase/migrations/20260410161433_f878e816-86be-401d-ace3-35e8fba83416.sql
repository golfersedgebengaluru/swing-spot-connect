
-- 1. Create the missing upsert_member_hours RPC
CREATE OR REPLACE FUNCTION public.upsert_member_hours(p_user_id uuid, p_hours numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.member_hours (user_id, hours_purchased, hours_used)
  VALUES (p_user_id, p_hours, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET hours_purchased = member_hours.hours_purchased + p_hours,
      updated_at = now();
END;
$$;

-- 2. Create payment_events table for webhook idempotency
CREATE TABLE public.payment_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  razorpay_event_id text NOT NULL,
  event_type text NOT NULL DEFAULT 'unknown',
  razorpay_payment_id text,
  razorpay_order_id text,
  amount_paise integer,
  currency text,
  city text,
  raw_payload jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_payment_events_event_id ON public.payment_events (razorpay_event_id);

CREATE POLICY "Admins can manage payment_events"
ON public.payment_events FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Create pending_purchases table for purchase reconciliation
CREATE TABLE public.pending_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  razorpay_order_id text NOT NULL,
  package_hours integer NOT NULL,
  package_price numeric NOT NULL,
  package_label text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'INR',
  city text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  hours_transaction_id uuid,
  revenue_transaction_id uuid,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pending_purchases_razorpay_order_id_key UNIQUE (razorpay_order_id)
);

ALTER TABLE public.pending_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pending_purchases"
ON public.pending_purchases FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins can view pending_purchases"
ON public.pending_purchases FOR SELECT TO authenticated
USING (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Users can view own pending_purchases"
ON public.pending_purchases FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pending_purchases"
ON public.pending_purchases FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_pending_purchases_updated_at
BEFORE UPDATE ON public.pending_purchases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Create server-side function to atomically complete a purchase
CREATE OR REPLACE FUNCTION public.complete_hour_purchase(
  p_user_id uuid,
  p_hours integer,
  p_amount numeric,
  p_currency text,
  p_order_id text,
  p_payment_id text,
  p_description text,
  p_city text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_htxn_id uuid;
  v_rev_id uuid;
BEGIN
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

  -- 3. Record revenue transaction
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

  -- 4. Update pending_purchases
  UPDATE public.pending_purchases
  SET status = 'completed',
      hours_transaction_id = v_htxn_id,
      revenue_transaction_id = v_rev_id,
      updated_at = now()
  WHERE razorpay_order_id = p_order_id;

  RETURN jsonb_build_object(
    'hours_transaction_id', v_htxn_id,
    'revenue_transaction_id', v_rev_id
  );
END;
$$;
