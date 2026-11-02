DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz,text,text)'::regprocedure) INTO definition;
 IF position('''period-visits'',''spend''' IN definition)=0 OR position('EXISTS(SELECT 1 FROM public.hours_transactions h WHERE h.booking_id=b.id),v_as_of)' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected customer report definition'; END IF;
 definition:=replace(definition,'''period-visits'',''spend''','''period-visits'',''spend'',''total-visits'',''total-spend''');
 definition:=replace(definition,'EXISTS(SELECT 1 FROM public.hours_transactions h WHERE h.booking_id=b.id),v_as_of)', 'EXISTS(SELECT 1 FROM public.hours_transactions h WHERE h.booking_id=b.id) OR EXISTS(SELECT 1 FROM public.revenue_transactions paid LEFT JOIN public.invoices paid_invoice ON paid_invoice.revenue_transaction_id=paid.id WHERE paid.booking_id=b.id AND paid.status=''confirmed'' AND paid.amount>0 AND (paid_invoice.status=''issued'' AND paid_invoice.invoice_type=''invoice'' AND paid_invoice.amount_paid>0 OR coalesce(paid.metadata->>''manual_invoice'',''false'')<>''true'')),v_as_of)');
 definition:=replace(definition,'WHERE original.id=r.original_transaction_id) candidate','WHERE original.id=r.original_transaction_id UNION SELECT i.profile_id FROM public.invoices inv JOIN identities i ON i.identity=inv.customer_user_id WHERE inv.revenue_transaction_id IN (r.id,r.original_transaction_id) UNION SELECT i.profile_id FROM public.hours_transactions h JOIN identities i ON i.identity=h.user_id WHERE h.id=r.hours_transaction_id OR h.id=(SELECT original.hours_transaction_id FROM public.revenue_transactions original WHERE original.id=r.original_transaction_id)) candidate');
 IF position('inv.customer_user_id' IN definition)=0 THEN RAISE EXCEPTION 'Invoice ownership patch failed'; END IF;
 definition:=replace(definition,'CASE WHEN _sort=''period-visits'' AND _dir=''desc'' THEN visit_count END DESC NULLS LAST,','CASE WHEN _sort=''total-visits'' AND _dir=''desc'' THEN lifetime_visits END DESC NULLS LAST,
 CASE WHEN _sort=''total-visits'' AND coalesce(_dir,''asc'')<>''desc'' THEN lifetime_visits END ASC NULLS LAST,
 CASE WHEN _sort=''total-spend'' AND _dir=''desc'' THEN (SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(lifetime_spend)) END DESC NULLS LAST,
 CASE WHEN _sort=''total-spend'' AND coalesce(_dir,''asc'')<>''desc'' THEN (SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(lifetime_spend)) END ASC NULLS LAST,
 CASE WHEN _sort=''period-visits'' AND _dir=''desc'' THEN visit_count END DESC NULLS LAST,');
 EXECUTE definition;
END $migration$;
REVOKE ALL ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz,text,text) TO authenticated,service_role;
COMMENT ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz,text,text) IS 'Authorized read-only customer reporting. Total visits/spend and their sorting use lifetime fields within permitted cities and the as-of cutoff. Paid booking evidence includes explicitly linked revenue/invoices. Revenue ownership also considers invoice and hours-transaction identities, retaining ambiguity guards and signed ledger amounts without invoice double-counting.';