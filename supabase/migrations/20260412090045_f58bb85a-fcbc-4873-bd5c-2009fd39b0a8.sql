
-- Create coupons table
CREATE TABLE public.coupons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL,
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  expires_at timestamptz,
  max_total_uses integer,
  max_uses_per_user integer,
  total_used integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  city text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_code_unique UNIQUE (code),
  CONSTRAINT coupons_discount_type_check CHECK (discount_type IN ('percentage', 'fixed')),
  CONSTRAINT coupons_discount_value_positive CHECK (discount_value > 0),
  CONSTRAINT coupons_percentage_max CHECK (discount_type != 'percentage' OR discount_value <= 100)
);

-- Create coupon_redemptions table
CREATE TABLE public.coupon_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id uuid,
  session_id text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  discount_applied numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coupon_redemptions_coupon_id ON public.coupon_redemptions(coupon_id);
CREATE INDEX idx_coupon_redemptions_user_id ON public.coupon_redemptions(user_id);
CREATE INDEX idx_coupon_redemptions_session_id ON public.coupon_redemptions(session_id);
CREATE INDEX idx_coupons_code ON public.coupons(code);

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- Coupons RLS
CREATE POLICY "Admins can manage coupons"
  ON public.coupons FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins can manage coupons"
  ON public.coupons FOR ALL TO authenticated
  USING (is_admin_or_site_admin(auth.uid()))
  WITH CHECK (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Everyone can view active coupons"
  ON public.coupons FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Coupon redemptions RLS
CREATE POLICY "Admins can manage coupon_redemptions"
  ON public.coupon_redemptions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins can view coupon_redemptions"
  ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

CREATE POLICY "Users can view own redemptions"
  ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated can insert redemptions"
  ON public.coupon_redemptions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anon can insert redemptions"
  ON public.coupon_redemptions FOR INSERT TO anon
  WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Validate coupon function
CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code text,
  p_user_id uuid DEFAULT NULL,
  p_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon RECORD;
  v_user_uses integer;
BEGIN
  -- Find coupon (case-insensitive)
  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE UPPER(code) = UPPER(p_code) AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid coupon code');
  END IF;

  -- Check expiry
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'This coupon has expired');
  END IF;

  -- Check total uses
  IF v_coupon.max_total_uses IS NOT NULL AND v_coupon.total_used >= v_coupon.max_total_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'This coupon has reached its usage limit');
  END IF;

  -- Check per-user uses
  IF v_coupon.max_uses_per_user IS NOT NULL THEN
    SELECT COUNT(*) INTO v_user_uses
    FROM public.coupon_redemptions
    WHERE coupon_id = v_coupon.id
      AND (
        (p_user_id IS NOT NULL AND user_id = p_user_id)
        OR (p_user_id IS NULL AND p_session_id IS NOT NULL AND session_id = p_session_id)
      );

    IF v_user_uses >= v_coupon.max_uses_per_user THEN
      RETURN jsonb_build_object('valid', false, 'error', 'You have already used this coupon the maximum number of times');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'code', v_coupon.code
  );
END;
$$;
