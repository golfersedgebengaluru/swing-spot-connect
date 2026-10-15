CREATE OR REPLACE FUNCTION public.validate_corporate_invoice_items(_account_id uuid,_city text,_booking_ids uuid[],_coaching_ids uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_admin_or_site_admin(auth.uid()) OR NOT public.has_city_access(auth.uid(),_city) THEN RAISE EXCEPTION 'Administrator city access required'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(COALESCE(_booking_ids,'{}'::uuid[])) id WHERE NOT EXISTS(SELECT 1 FROM public.bookings b WHERE b.id=id AND b.corporate_account_id=_account_id AND b.city=_city AND b.status<>'cancelled' AND b.billing_status IN ('deferred','invoiced'))) THEN RAISE EXCEPTION 'Booking selection is stale or belongs to another corporate account'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(COALESCE(_coaching_ids,'{}'::uuid[])) id WHERE NOT EXISTS(SELECT 1 FROM public.coaching_sessions s WHERE s.id=id AND s.corporate_account_id=_account_id AND s.city=_city AND s.booking_id IS NULL AND s.session_type<>'self_directed' AND s.billing_status IN ('deferred','invoiced'))) THEN RAISE EXCEPTION 'Training selection is stale or belongs to another corporate account'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_corporate_invoice_items(uuid,text,uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validate_corporate_invoice_items(uuid,text,uuid[],uuid[]) TO authenticated;