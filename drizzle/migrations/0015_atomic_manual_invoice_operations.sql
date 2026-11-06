ALTER TABLE public.bookings ADD COLUMN manual_invoice_origin_id uuid;
COMMENT ON COLUMN public.bookings.manual_invoice_origin_id IS 'Immutable creation attribution for manual invoice cleanup; not a billing link.';

CREATE OR REPLACE FUNCTION public.create_manual_invoice_atomic(p_operation_id uuid, p_invoice jsonb, p_lines jsonb, p_booking jsonb DEFAULT NULL, p_add_profile boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid(); v_city text := p_invoice->>'city'; v_gst public.gst_profiles%ROWTYPE; v_fy uuid;
  v_number text; v_revenue uuid; v_customer uuid; v_profile public.profiles%ROWTYPE; v_invoice public.invoices%ROWTYPE;
  v_booking uuid; v_booking_user uuid; v_registered boolean; v_sequence text;
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
  INSERT INTO public.invoice_line_items SELECT (jsonb_populate_record(NULL::public.invoice_line_items,line || jsonb_build_object('id',gen_random_uuid(),'invoice_id',p_operation_id,'created_at',now()))).* FROM jsonb_array_elements(p_lines) line;
  IF p_booking IS NOT NULL THEN
    INSERT INTO public.bookings(user_id,city,start_time,end_time,duration_minutes,status,session_type,bay_id,coach_name,note,invoice_id,manual_invoice_origin_id)
    VALUES(v_booking_user,v_city,(p_booking->>'start_time')::timestamptz,(p_booking->>'end_time')::timestamptz,(p_booking->>'duration_minutes')::int,'confirmed',coalesce(p_booking->>'session_type','practice'),nullif(p_booking->>'bay_id','')::uuid,nullif(p_booking->>'coach_name',''),'Invoice '||v_number,p_operation_id,p_operation_id) RETURNING id INTO v_booking;
    IF v_revenue IS NOT NULL THEN UPDATE public.revenue_transactions SET booking_id=v_booking WHERE id=v_revenue; END IF;
  END IF;
  RETURN to_jsonb(v_invoice);
END;
$$;
REVOKE ALL ON FUNCTION public.create_manual_invoice_atomic(uuid,jsonb,jsonb,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_manual_invoice_atomic(uuid,jsonb,jsonb,jsonb,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.delete_invoice_atomic(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid(); v_invoice public.invoices%ROWTYPE; v_rev public.revenue_transactions%ROWTYPE; v_seq text; v_prefix text; v_booking record;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin_or_site_admin(v_actor) THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',true,'already_deleted',true); END IF;
  IF NOT public.has_role(v_actor,'admin') AND NOT public.has_city_access(v_actor,v_invoice.city) THEN RAISE EXCEPTION 'Administrator city access required'; END IF;
  SELECT * INTO v_rev FROM public.revenue_transactions WHERE id=v_invoice.revenue_transaction_id FOR UPDATE;
  IF v_rev.id IS NOT NULL AND v_rev.metadata @> '{"manual_invoice":true}'::jsonb THEN
    IF v_rev.city IS DISTINCT FROM v_invoice.city THEN RAISE EXCEPTION 'Manual revenue city mismatch'; END IF;
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
    INSERT INTO public.recycled_invoice_numbers(gstin,financial_year_id,prefix,number,invoice_number_text,city)
    VALUES(v_invoice.business_gstin,v_invoice.financial_year_id,v_prefix,v_seq::int,v_invoice.invoice_number,v_invoice.city);
  END IF;
  RETURN jsonb_build_object('success',true);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_invoice_atomic(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_invoice_atomic(uuid) TO authenticated,service_role;