CREATE OR REPLACE FUNCTION public.guard_corporate_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invoices; corp public.corporate_accounts; b public.bookings; ref uuid; caller uuid:=auth.uid();
BEGIN
 IF TG_TABLE_NAME='coaching_sessions' THEN
  ref:=NEW.student_user_id;
  IF NEW.session_type='self_directed' AND (NEW.corporate_account_id IS NOT NULL OR NEW.billing_status IN ('deferred','invoiced')) THEN RAISE EXCEPTION 'Self-directed training is not corporate billable'; END IF;
  IF NEW.booking_id IS NOT NULL THEN
   SELECT * INTO b FROM public.bookings WHERE id=NEW.booking_id;
   NEW.corporate_account_id:=b.corporate_account_id;
   IF b.corporate_account_id IS NOT NULL THEN NEW.billing_status:=b.billing_status; NEW.invoice_id:=b.invoice_id; END IF;
  END IF;
 ELSE ref:=NEW.user_id;
 END IF;
 IF TG_OP='UPDATE' AND OLD.corporate_account_id IS NOT NULL AND NEW.corporate_account_id IS DISTINCT FROM OLD.corporate_account_id THEN RAISE EXCEPTION 'Historical corporate payer cannot be changed'; END IF;
 IF NEW.corporate_account_id IS NOT NULL AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.corporate_account_id IS NULL)) THEN
  IF caller IS NOT NULL THEN PERFORM public.validate_corporate_booking(caller,ref,NEW.corporate_account_id,NEW.city); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.corporate_account_members m JOIN public.profiles p ON p.id=m.profile_id JOIN public.corporate_accounts c ON c.id=m.corporate_account_id WHERE (p.id=ref OR p.user_id=ref) AND c.id=NEW.corporate_account_id AND c.is_active) THEN RAISE EXCEPTION 'Active corporate membership required'; END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW.billing_status='deferred' AND NEW.corporate_account_id IS NULL THEN RAISE EXCEPTION 'Corporate payer is required for deferred sessions'; END IF;
 IF NEW.corporate_account_id IS NOT NULL AND TG_OP='UPDATE' AND (NEW.billing_status IS DISTINCT FROM OLD.billing_status OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id) THEN
  IF caller IS NOT NULL AND (NOT public.is_admin_or_site_admin(caller) OR NOT public.has_city_access(caller,NEW.city)) THEN RAISE EXCEPTION 'Administrator city access required'; END IF;
  IF TG_TABLE_NAME='bookings' AND NEW.billing_status='invoiced' AND NEW.status='cancelled' THEN RAISE EXCEPTION 'Cancelled bookings cannot be invoiced'; END IF;
  IF NEW.billing_status='invoiced' THEN
   SELECT * INTO inv FROM public.invoices WHERE id=NEW.invoice_id;
   SELECT * INTO corp FROM public.corporate_accounts WHERE id=NEW.corporate_account_id;
   IF inv.id IS NULL OR inv.city IS DISTINCT FROM NEW.city OR lower(trim(inv.customer_name)) IS DISTINCT FROM lower(trim(corp.name)) OR (corp.gstin IS NOT NULL AND inv.customer_gstin IS DISTINCT FROM corp.gstin) OR inv.status='cancelled' THEN RAISE EXCEPTION 'Invoice must match this corporate payer and city'; END IF;
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.billing_status='invoiced' AND OLD.corporate_account_id IS NULL AND NEW.corporate_account_id IS NULL AND OLD.billing_status='deferred' THEN RAISE EXCEPTION 'Confirm historical corporate attribution before invoicing'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_corporate_booking BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_corporate_session();
CREATE TRIGGER guard_corporate_coaching BEFORE INSERT OR UPDATE ON public.coaching_sessions FOR EACH ROW EXECUTE FUNCTION public.guard_corporate_session();
CREATE OR REPLACE FUNCTION public.sync_linked_corporate_training() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.corporate_account_id IS NOT NULL THEN UPDATE public.coaching_sessions SET corporate_account_id=NEW.corporate_account_id,billing_status=NEW.billing_status,invoice_id=NEW.invoice_id WHERE booking_id=NEW.id AND (corporate_account_id IS DISTINCT FROM NEW.corporate_account_id OR billing_status IS DISTINCT FROM NEW.billing_status OR invoice_id IS DISTINCT FROM NEW.invoice_id); END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER sync_linked_corporate_training AFTER UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.sync_linked_corporate_training();
CREATE OR REPLACE FUNCTION public.confirm_legacy_corporate_payer(_booking_id uuid,_account_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings;
BEGIN
 SELECT * INTO b FROM public.bookings WHERE id=_booking_id FOR UPDATE;
 IF b.id IS NULL OR b.corporate_account_id IS NOT NULL OR b.billing_status<>'deferred' THEN RAISE EXCEPTION 'Only unassigned historical deferred bookings can be confirmed'; END IF;
 PERFORM public.validate_corporate_booking(auth.uid(),b.user_id,_account_id,b.city);
 UPDATE public.bookings SET corporate_account_id=_account_id WHERE id=_booking_id;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_legacy_corporate_payer(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_legacy_corporate_payer(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.change_corporate_membership(_profile_id uuid,_account_id uuid,_remove boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids uuid[];
BEGIN
 PERFORM 1 FROM public.profiles WHERE id=_profile_id FOR UPDATE;
 SELECT coalesce(array_agg(corporate_account_id),'{}'::uuid[]) INTO ids FROM public.corporate_account_members WHERE profile_id=_profile_id;
 IF _remove THEN ids:=array_remove(ids,_account_id); ELSE ids:=array_append(ids,_account_id); END IF;
 PERFORM public.set_corporate_memberships(_profile_id,ids);
END;
$$;
REVOKE ALL ON FUNCTION public.change_corporate_membership(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.change_corporate_membership(uuid,uuid,boolean) TO authenticated;
COMMENT ON COLUMN public.bookings.corporate_account_id IS 'Immutable corporate payer; unassigned legacy deferred rows require explicit administrator confirmation';