
-- ============================================================
-- City-scoped invoice profile overlay (SaaS multi-tenant)
-- Adds missing standard tax-invoice fields without breaking
-- existing gst_profiles / invoice_settings tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.city_invoice_profiles (
  city text PRIMARY KEY REFERENCES public.gst_profiles(city) ON UPDATE CASCADE ON DELETE CASCADE,
  -- Extended business identity
  trade_name text NOT NULL DEFAULT '',
  pan text NOT NULL DEFAULT '',
  cin text NOT NULL DEFAULT '',
  msme_no text NOT NULL DEFAULT '',
  -- Extended address
  address_line2 text NOT NULL DEFAULT '',
  pincode text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'India',
  -- Contact
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  -- Signature & branding extras
  signature_url text NOT NULL DEFAULT '',
  authorised_signatory_name text NOT NULL DEFAULT '',
  brand_color text NOT NULL DEFAULT '',
  show_signature boolean NOT NULL DEFAULT false,
  -- Bank details
  bank_name text NOT NULL DEFAULT '',
  bank_account_holder text NOT NULL DEFAULT '',
  bank_account_no text NOT NULL DEFAULT '',
  bank_ifsc text NOT NULL DEFAULT '',
  bank_branch text NOT NULL DEFAULT '',
  bank_swift text NOT NULL DEFAULT '',
  upi_id text NOT NULL DEFAULT '',
  show_upi_qr boolean NOT NULL DEFAULT false,
  -- Tax defaults
  default_place_of_supply text NOT NULL DEFAULT '',
  reverse_charge_default boolean NOT NULL DEFAULT false,
  -- Payment terms
  payment_terms_label text NOT NULL DEFAULT '',
  due_date_offset_days integer NOT NULL DEFAULT 0,
  payment_instructions text NOT NULL DEFAULT '',
  -- Document text
  declaration text NOT NULL DEFAULT '',
  jurisdiction text NOT NULL DEFAULT '',
  copy_labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Future e-invoice support (schema only)
  einvoice_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants (auth-only; no anon — invoice config is admin-managed)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.city_invoice_profiles TO authenticated;
GRANT ALL ON public.city_invoice_profiles TO service_role;

ALTER TABLE public.city_invoice_profiles ENABLE ROW LEVEL SECURITY;

-- Mirror the policy model used by gst_profiles
CREATE POLICY "Admins can manage city_invoice_profiles"
  ON public.city_invoice_profiles
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Site admins can view own city invoice profiles"
  ON public.city_invoice_profiles
  FOR SELECT
  USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can insert own city invoice profiles"
  ON public.city_invoice_profiles
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

CREATE POLICY "Site admins can update own city invoice profiles"
  ON public.city_invoice_profiles
  FOR UPDATE
  USING (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city))
  WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) AND has_city_access(auth.uid(), city));

-- Reuse existing updated_at trigger pattern
CREATE OR REPLACE FUNCTION public.touch_city_invoice_profiles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_city_invoice_profiles ON public.city_invoice_profiles;
CREATE TRIGGER trg_touch_city_invoice_profiles
  BEFORE UPDATE ON public.city_invoice_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_city_invoice_profiles();

-- Backfill one row per existing city (idempotent)
INSERT INTO public.city_invoice_profiles (city)
SELECT city FROM public.gst_profiles
ON CONFLICT (city) DO NOTHING;

-- ============================================================
-- Per-document-type invoice numbering (additive, backwards compatible)
-- Existing callers don't pass doc_type → default 'tax_invoice' →
-- numbering behaves identically.
-- ============================================================

ALTER TABLE public.invoice_sequences
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'tax_invoice'
    CHECK (doc_type IN ('tax_invoice','proforma','credit_note','debit_note','receipt'));

ALTER TABLE public.recycled_invoice_numbers
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'tax_invoice'
    CHECK (doc_type IN ('tax_invoice','proforma','credit_note','debit_note','receipt'));

-- Swap unique constraints to include doc_type
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_sequences_gstin_financial_year_id_key') THEN
    ALTER TABLE public.invoice_sequences DROP CONSTRAINT invoice_sequences_gstin_financial_year_id_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_sequences_gstin_fy_doctype_key
  ON public.invoice_sequences (gstin, financial_year_id, doc_type);

-- Updated RPC (overload with new signature; old one stays)
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(
  p_gstin text,
  p_fy_id uuid,
  p_prefix text DEFAULT 'INV',
  p_start integer DEFAULT 1,
  p_doc_type text DEFAULT 'tax_invoice'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recycled record;
  v_next integer;
  v_fy_label text;
BEGIN
  IF p_doc_type NOT IN ('tax_invoice','proforma','credit_note','debit_note','receipt') THEN
    RAISE EXCEPTION 'Invalid doc_type: %', p_doc_type;
  END IF;

  SELECT id, number, invoice_number_text INTO v_recycled
  FROM recycled_invoice_numbers
  WHERE gstin = p_gstin
    AND financial_year_id = p_fy_id
    AND prefix = p_prefix
    AND doc_type = p_doc_type
  ORDER BY number ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_recycled IS NOT NULL THEN
    DELETE FROM recycled_invoice_numbers WHERE id = v_recycled.id;
    RETURN v_recycled.invoice_number_text;
  END IF;

  INSERT INTO invoice_sequences (gstin, financial_year_id, prefix, last_number, doc_type)
  VALUES (p_gstin, p_fy_id, p_prefix, p_start, p_doc_type)
  ON CONFLICT (gstin, financial_year_id, doc_type)
  DO UPDATE SET last_number = invoice_sequences.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_next;

  SELECT label INTO v_fy_label FROM financial_years WHERE id = p_fy_id;

  RETURN p_prefix || '/' || COALESCE(v_fy_label, '') || '/' || LPAD(v_next::text, 4, '0');
END;
$$;
