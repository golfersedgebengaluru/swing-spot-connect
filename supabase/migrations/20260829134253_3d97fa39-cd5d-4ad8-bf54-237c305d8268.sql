CREATE OR REPLACE VIEW public.city_invoice_identity
WITH (security_invoker = true)
AS
WITH cities AS (
  SELECT city FROM public.gst_profiles WHERE city IS NOT NULL
  UNION
  SELECT city FROM public.invoice_settings WHERE city IS NOT NULL
  UNION
  SELECT city FROM public.city_invoice_profiles WHERE city IS NOT NULL
), g AS (
  SELECT * FROM public.invoice_settings WHERE city IS NULL LIMIT 1
)
SELECT
  c.city,
  -- legal identity + numbering (gst_profiles)
  gp.legal_name,
  gp.gstin,
  gp.address,
  gp.state,
  gp.state_code,
  COALESCE(gp.invoice_prefix, 'INV') AS invoice_prefix,
  COALESCE(gp.invoice_start_number, 1) AS invoice_start_number,
  COALESCE(gp.is_gst_registered, true) AS is_gst_registered,
  gp.default_service_gst_rate,
  gp.default_sac_code,
  -- template / branding (per-city override, else global)
  COALESCE(cs.template, g.template, 'classic') AS template,
  COALESCE(cs.logo_url, g.logo_url, '') AS logo_url,
  COALESCE(cs.footer_note, g.footer_note, '') AS footer_note,
  COALESCE(cs.terms, g.terms, '') AS terms,
  (cs.id IS NOT NULL) AS template_overridden,
  cs.id AS invoice_settings_id,
  -- extended profile (city_invoice_profiles)
  cip.trade_name,
  cip.pan,
  cip.cin,
  cip.msme_no,
  cip.address_line2,
  cip.pincode,
  cip.country,
  cip.phone,
  cip.email,
  cip.website,
  cip.signature_url,
  cip.authorised_signatory_name,
  cip.brand_color,
  cip.show_signature,
  cip.bank_name,
  cip.bank_account_holder,
  cip.bank_account_no,
  cip.bank_ifsc,
  cip.bank_branch,
  cip.bank_swift,
  cip.upi_id,
  cip.show_upi_qr,
  cip.default_place_of_supply,
  cip.reverse_charge_default,
  cip.payment_terms_label,
  cip.due_date_offset_days,
  cip.payment_instructions,
  cip.declaration,
  cip.jurisdiction,
  cip.copy_labels,
  cip.einvoice_enabled
FROM cities c
LEFT JOIN public.gst_profiles gp ON gp.city = c.city
LEFT JOIN public.invoice_settings cs ON cs.city = c.city
LEFT JOIN public.city_invoice_profiles cip ON cip.city = c.city
CROSS JOIN LATERAL (SELECT * FROM g) g;

GRANT SELECT ON public.city_invoice_identity TO authenticated;
GRANT SELECT ON public.city_invoice_identity TO service_role;