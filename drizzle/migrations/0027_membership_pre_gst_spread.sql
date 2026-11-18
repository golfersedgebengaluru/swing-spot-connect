ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS taxable_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS gst_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_tax_split_check CHECK (taxable_amount >= 0 AND gst_amount >= 0 AND abs(taxable_amount + gst_amount - amount) <= 0.05);

-- Records a membership sale; optionally adds its hours (in-person invoices). Online purchases add hours themselves.
-- The amount before GST comes from the sale's invoice line (or the invoice when the sale has one line).
CREATE OR REPLACE FUNCTION public.create_membership_record(
  p_customer uuid, p_city text, p_label text, p_product uuid, p_revenue uuid, p_line uuid, p_sold_on date,
  p_amount numeric, p_months integer, p_starts_on date, p_hours numeric, p_actor uuid, p_credit_hours boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_key uuid := public.member_hours_key(p_customer); v_start date := coalesce(p_starts_on, p_sold_on);
  v_end date; v_hours numeric := greatest(coalesce(p_hours,0),0); v_id uuid; v_balance numeric;
  v_amount numeric := round(greatest(coalesce(p_amount,0),0),2); v_doc_total numeric; v_doc_tax numeric; v_rate numeric; v_taxable numeric;
BEGIN
  IF v_key IS NULL THEN RAISE EXCEPTION 'Choose a customer for a membership sale'; END IF;
  IF p_months IS NULL OR p_months NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Membership validity must be 1 to 60 months'; END IF;
  IF v_start < p_sold_on THEN RAISE EXCEPTION 'A membership cannot start before the sale date'; END IF;
  IF v_start > p_sold_on + 366 THEN RAISE EXCEPTION 'A membership must start within a year of the sale date'; END IF;
  v_end := public.membership_end_date(v_start, p_months);

  IF p_line IS NOT NULL THEN
    SELECT line_total, coalesce(cgst_amount,0)+coalesce(sgst_amount,0)+coalesce(igst_amount,0) INTO v_doc_total, v_doc_tax
      FROM public.invoice_line_items WHERE id = p_line;
  ELSIF p_revenue IS NOT NULL THEN
    SELECT total, coalesce(cgst_total,0)+coalesce(sgst_total,0)+coalesce(igst_total,0) INTO v_doc_total, v_doc_tax
      FROM public.invoices WHERE revenue_transaction_id = p_revenue AND invoice_type = 'invoice' ORDER BY created_at LIMIT 1;
  END IF;
  IF coalesce(v_doc_total,0) > 0 THEN
    v_taxable := round(v_amount * (v_doc_total - v_doc_tax) / v_doc_total, 2);
  ELSE
    SELECT gst_rate INTO v_rate FROM public.products WHERE id = p_product;
    v_taxable := round(v_amount / (1 + coalesce(v_rate,0) / 100), 2);
  END IF;

  IF p_credit_hours AND v_hours > 0 THEN
    INSERT INTO public.member_hours(user_id, hours_purchased, hours_used) VALUES (v_key, v_hours, 0)
      ON CONFLICT (user_id) DO UPDATE SET hours_purchased = public.member_hours.hours_purchased + EXCLUDED.hours_purchased, updated_at = now();
    INSERT INTO public.hours_transactions(user_id, type, hours, note, reason, created_by)
      VALUES (v_key, 'purchase', v_hours, p_label || ' membership, valid ' || to_char(v_start,'DD Mon YYYY') || ' to ' || to_char(v_end,'DD Mon YYYY'), 'Membership', p_actor);
  END IF;
  INSERT INTO public.memberships(user_id, city, label, product_id, revenue_transaction_id, invoice_line_item_id, sold_on, amount,
      taxable_amount, gst_amount, validity_months, starts_on, ends_on, hours, hours_remaining, created_by)
    VALUES (v_key, p_city, p_label, p_product, p_revenue, p_line, p_sold_on, v_amount,
      v_taxable, v_amount - v_taxable, p_months, v_start, v_end, v_hours, v_hours, p_actor)
    RETURNING id INTO v_id;
  SELECT hours_purchased - hours_used INTO v_balance FROM public.member_hours WHERE user_id = v_key FOR UPDATE;
  PERFORM public.membership_hours_clamp(v_key, coalesce(v_balance,0));
  RETURN v_id;
END $$;