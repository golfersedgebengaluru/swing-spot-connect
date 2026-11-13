CREATE OR REPLACE FUNCTION public.delete_invoice_atomic(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid:=auth.uid(); v_invoice public.invoices%ROWTYPE; v_rev public.revenue_transactions%ROWTYPE; v_seq text; v_prefix text; v_booking record; v_manual boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin_or_site_admin(v_actor) THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',true,'already_deleted',true); END IF;
  IF NOT public.has_role(v_actor,'admin') AND NOT public.has_city_access(v_actor,v_invoice.city) THEN RAISE EXCEPTION 'Administrator city access required'; END IF;
  SELECT * INTO v_rev FROM public.revenue_transactions WHERE id=v_invoice.revenue_transaction_id FOR UPDATE;
  v_manual := v_rev.id IS NOT NULL AND v_rev.metadata @> '{"manual_invoice":true}'::jsonb;
  -- Online gateway money was really received: its invoice is corrected with a credit note, never deleted.
  IF v_rev.id IS NOT NULL AND NOT v_manual AND v_invoice.invoice_type='invoice'
     AND (v_rev.gateway_order_ref IS NOT NULL OR coalesce(v_rev.gateway_name,'') ~* '(razorpay|stripe)') THEN
    RAISE EXCEPTION 'This invoice is for an online payment and cannot be deleted. Issue a credit note instead.';
  END IF;
  -- Manual and automatic offline sales: the invoice and its payment entry are removed together.
  IF v_rev.id IS NOT NULL AND (v_manual OR v_invoice.invoice_type='invoice') THEN
    IF v_rev.city IS DISTINCT FROM v_invoice.city THEN RAISE EXCEPTION 'Invoice revenue city mismatch'; END IF;
    UPDATE public.revenue_transactions SET status='failed',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('voided_reason','invoice_deleted','voided_invoice_number',v_invoice.invoice_number,'voided_at',now()) WHERE id=v_rev.id AND status='confirmed';
  END IF;
  FOR v_booking IN SELECT id,city FROM public.bookings WHERE manual_invoice_origin_id=p_invoice_id OR (manual_invoice_origin_id IS NULL AND note='Invoice '||v_invoice.invoice_number AND city=v_invoice.city AND (id=v_rev.booking_id OR (v_invoice.revenue_transaction_id IS NULL AND invoice_id=p_invoice_id))) FOR UPDATE LOOP
    IF v_booking.city IS DISTINCT FROM v_invoice.city THEN RAISE EXCEPTION 'Invoice booking city mismatch'; END IF;
    UPDATE public.bookings SET status='cancelled' WHERE id=v_booking.id;
  END LOOP;
  DELETE FROM public.invoice_line_items WHERE invoice_id=p_invoice_id;
  DELETE FROM public.invoices WHERE id=p_invoice_id;
  v_seq:=substring(v_invoice.invoice_number FROM '/([0-9]+)$'); v_prefix:=split_part(v_invoice.invoice_number,'/',1);
  IF v_seq IS NOT NULL AND v_invoice.financial_year_id IS NOT NULL AND nullif(v_invoice.business_gstin,'') IS NOT NULL THEN
    INSERT INTO public.recycled_invoice_numbers(gstin,financial_year_id,prefix,number,invoice_number_text,doc_type)
    VALUES(v_invoice.business_gstin,v_invoice.financial_year_id,v_prefix,v_seq::int,v_invoice.invoice_number,CASE WHEN v_invoice.invoice_type='credit_note' THEN 'credit_note' ELSE 'tax_invoice' END);
  END IF;
  RETURN jsonb_build_object('success',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_invoice_atomic(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_invoice_atomic(uuid) TO authenticated,service_role;