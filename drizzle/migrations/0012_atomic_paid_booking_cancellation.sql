CREATE TABLE public.booking_cancellation_receipts (
 booking_id uuid PRIMARY KEY REFERENCES public.bookings(id),
 actor_id uuid NOT NULL, disposition text NOT NULL CHECK(disposition IN ('advance_credit','external_refund','hours')),
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.booking_cancellation_receipts TO service_role;
ALTER TABLE public.booking_cancellation_receipts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.booking_cancellation_receipts IS 'Service-only atomic cancellation receipts; preserves committed financial outcome on retries.';
CREATE OR REPLACE FUNCTION public.cancel_paid_booking_atomic(p_booking_id uuid,p_actor uuid,p_disposition text DEFAULT 'advance_credit',p_admin boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 b public.bookings; sale public.revenue_transactions; inv public.invoices; fy uuid;
 cn uuid; refund_id uuid; result jsonb; window_hours numeric:=24; fee numeric:=10;
 refund_amount numeric; credit numeric:=0; n integer; clawback jsonb; customer uuid;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Authenticated customer required'; END IF;
 IF p_disposition IS NULL OR p_disposition NOT IN ('advance_credit','external_refund','hours') THEN RAISE EXCEPTION 'Invalid cancellation option'; END IF;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
 IF p_admin THEN
  IF NOT public.is_admin_or_site_admin(p_actor) OR NOT public.has_city_access(p_actor,b.city) THEN RAISE EXCEPTION 'Administrator city access required'; END IF;
 ELSE
  IF b.user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.corporate_account_id IS NOT NULL OR b.billing_status IN ('deferred','invoiced') THEN RAISE EXCEPTION 'Corporate bookings must be cancelled by an administrator'; END IF;
 END IF;
 SELECT r.result INTO result FROM public.booking_cancellation_receipts r WHERE r.booking_id=b.id;
 IF FOUND THEN RETURN result || jsonb_build_object('already_cancelled',true); END IF;
 SELECT count(*) INTO n FROM public.revenue_transactions WHERE booking_id=b.id AND amount>0 AND status='confirmed' AND transaction_type IN ('payment','guest_booking');
 IF n=0 THEN RETURN NULL; END IF;
 IF n<>1 THEN RAISE EXCEPTION 'Multiple paid transactions require financial review'; END IF;
 SELECT * INTO sale FROM public.revenue_transactions WHERE booking_id=b.id AND amount>0 AND status='confirmed' AND transaction_type IN ('payment','guest_booking') FOR UPDATE;
 IF b.status='cancelled' THEN RAISE EXCEPTION 'Previously cancelled booking requires financial review; no credit was posted by this request'; END IF;
 IF b.status NOT IN ('confirmed','pending') OR b.end_time<=now() THEN RAISE EXCEPTION 'This booking can no longer be cancelled'; END IF;
 IF NOT p_admin AND b.status='confirmed' THEN
  SELECT CASE WHEN value ~ '^[0-9]+([.][0-9]+)?$' THEN value::numeric ELSE 24 END INTO window_hours FROM public.admin_config WHERE key='cancellation_window_hours';
  window_hours:=coalesce(window_hours,24);
  IF b.start_time < now()+window_hours*interval '1 hour' THEN RAISE EXCEPTION 'Cancellations must be made at least % hours in advance.',window_hours; END IF;
 END IF;
 IF p_disposition='hours' THEN RAISE EXCEPTION 'A paid booking requires customer credit or external refund'; END IF;
 IF EXISTS(SELECT 1 FROM public.revenue_transactions WHERE original_transaction_id=sale.id AND transaction_type='refund' AND status='confirmed') THEN RAISE EXCEPTION 'Existing refund requires financial review'; END IF;
 IF p_disposition='advance_credit' THEN
  SELECT id INTO customer FROM public.profiles WHERE id=sale.user_id OR user_id=sale.user_id ORDER BY (user_id=sale.user_id) DESC NULLS LAST LIMIT 1;
  IF customer IS NULL THEN RAISE EXCEPTION 'No member account, so store credit cannot be held; choose external refund'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=customer AND (id=b.user_id OR user_id=b.user_id)) THEN RAISE EXCEPTION 'Payment customer does not match booking owner'; END IF;
  SELECT count(*) INTO n FROM public.invoices WHERE revenue_transaction_id=sale.id AND invoice_type='invoice';
  IF n<>1 THEN RAISE EXCEPTION 'Missing or ambiguous paid invoice requires financial review'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE revenue_transaction_id=sale.id AND invoice_type='invoice' FOR UPDATE;
  IF inv.status<>'issued' OR abs(inv.total-sale.amount)>0.01 OR EXISTS(SELECT 1 FROM public.invoices WHERE credit_note_for=inv.id AND status<>'cancelled') THEN RAISE EXCEPTION 'Invoice requires financial review'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.invoice_line_items WHERE invoice_id=inv.id) THEN RAISE EXCEPTION 'Invoice line items missing'; END IF;
  SELECT id INTO fy FROM public.financial_years WHERE is_active AND (city=inv.city OR city IS NULL) ORDER BY (city=inv.city) DESC NULLS LAST LIMIT 1;
  IF fy IS NULL THEN RAISE EXCEPTION 'No active financial year for credit note'; END IF;
  refund_amount:=sale.amount;
 ELSE
  SELECT coalesce(cancellation_fee_pct,10) INTO fee FROM public.bay_config WHERE city=b.city;
  fee:=coalesce(fee,10);
  IF fee<0 OR fee>100 THEN RAISE EXCEPTION 'Invalid cancellation fee'; END IF;
  refund_amount:=greatest(0,round(sale.amount*(1-fee/100),2));
 END IF;
 clawback:=public.cancel_booking_with_clawback(b.id,p_actor);
 IF clawback ? 'error' OR clawback ? 'already_cancelled' THEN RAISE EXCEPTION 'Cancellation state changed'; END IF;
 IF p_admin THEN UPDATE public.bookings SET note=concat_ws(' | ',nullif(note,''),'Admin cancelled') WHERE id=b.id; END IF;
 IF refund_amount>0 THEN
  refund_id:=public.record_refund(
   CASE WHEN p_disposition='advance_credit' THEN 'booking_cancel_credit:' ELSE 'booking_cancel_refund:' END || b.id,
   sale.id,refund_amount,'Booking cancellation — '||coalesce(sale.description,b.city),NULL,(now() AT TIME ZONE 'UTC')::date,
   jsonb_build_object('disposition',p_disposition,'booking_id',b.id,'cancellation_fee_pct',CASE WHEN p_disposition='external_refund' THEN fee ELSE 0 END));
 END IF;
 IF p_disposition='advance_credit' THEN
  cn:=gen_random_uuid();
  INSERT INTO public.invoices SELECT (jsonb_populate_record(NULL::public.invoices,to_jsonb(inv)||jsonb_build_object(
   'id',cn,'invoice_number',public.get_next_invoice_number(inv.business_gstin,fy,'CN',1,'credit_note'),
   'invoice_date',(now() AT TIME ZONE 'UTC')::date,'financial_year_id',fy,'status','issued','invoice_type','credit_note',
   'credit_note_for',inv.id,'revenue_transaction_id',refund_id,'credit_note_disposition','advance_credit',
   'created_at',now(),'updated_at',now(),'notes','Booking cancellation credit','due_date',NULL))).*;
  INSERT INTO public.invoice_line_items SELECT (jsonb_populate_record(NULL::public.invoice_line_items,to_jsonb(l)||jsonb_build_object('id',gen_random_uuid(),'invoice_id',cn,'created_at',now()))).* FROM public.invoice_line_items l WHERE invoice_id=inv.id;
  UPDATE public.invoices SET status='cancelled',updated_at=now() WHERE id=inv.id;
  INSERT INTO public.advance_transactions(customer_id,amount,transaction_type,source_type,source_id,description,city,created_by)
   VALUES(sale.user_id,sale.amount,'credit','credit_note',b.id,'Booking cancellation credit',b.city,p_actor);
  SELECT coalesce(sum(amount),0) INTO credit FROM public.advance_transactions WHERE source_type='credit_note' AND source_id=b.id AND customer_id=sale.user_id AND transaction_type='credit';
  IF credit<>sale.amount THEN RAISE EXCEPTION 'Customer credit verification failed'; END IF;
 END IF;
 result:=jsonb_build_object('success',true,'booking_id',b.id,'disposition',p_disposition,'credit_amount',credit,'refund_amount',refund_amount,'credit_note_id',cn,'points_clawed_back',coalesce((clawback->>'points_clawed_back')::integer,0),'hours_refunded',0);
 INSERT INTO public.booking_cancellation_receipts(booking_id,actor_id,disposition,result) VALUES(b.id,p_actor,p_disposition,result);
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_paid_booking_atomic(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_paid_booking_atomic(uuid,uuid,text,boolean) TO service_role;