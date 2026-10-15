CREATE TABLE public.corporate_account_members (
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 corporate_account_id uuid NOT NULL REFERENCES public.corporate_accounts(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(profile_id, corporate_account_id)
);
GRANT SELECT ON public.corporate_account_members TO authenticated;
GRANT ALL ON public.corporate_account_members TO service_role;
ALTER TABLE public.corporate_account_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Corporate memberships visible to member and administrators" ON public.corporate_account_members FOR SELECT TO authenticated USING (public.is_admin_or_site_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=profile_id AND p.user_id=auth.uid()));
ALTER TABLE public.bookings ADD COLUMN corporate_account_id uuid REFERENCES public.corporate_accounts(id);
ALTER TABLE public.coaching_sessions ADD COLUMN corporate_account_id uuid REFERENCES public.corporate_accounts(id);
CREATE INDEX bookings_corporate_period_idx ON public.bookings(corporate_account_id,start_time) WHERE corporate_account_id IS NOT NULL;
CREATE INDEX coaching_corporate_period_idx ON public.coaching_sessions(corporate_account_id,session_date) WHERE corporate_account_id IS NOT NULL;
INSERT INTO public.corporate_account_members(profile_id,corporate_account_id) SELECT id,corporate_account_id FROM public.profiles WHERE corporate_account_id IS NOT NULL ON CONFLICT DO NOTHING;
UPDATE public.bookings b SET corporate_account_id=c.id FROM public.invoices i JOIN public.corporate_accounts c ON lower(trim(c.name))=lower(trim(i.customer_name)) AND (c.gstin IS NULL OR c.gstin=i.customer_gstin) WHERE b.invoice_id=i.id AND b.billing_status='invoiced' AND (SELECT count(*) FROM public.corporate_accounts c2 WHERE lower(trim(c2.name))=lower(trim(i.customer_name)) AND (c2.gstin IS NULL OR c2.gstin=i.customer_gstin))=1;
UPDATE public.coaching_sessions s SET corporate_account_id=b.corporate_account_id FROM public.bookings b WHERE s.booking_id=b.id AND b.corporate_account_id IS NOT NULL;
UPDATE public.coaching_sessions s SET corporate_account_id=c.id FROM public.invoices i JOIN public.corporate_accounts c ON lower(trim(c.name))=lower(trim(i.customer_name)) AND (c.gstin IS NULL OR c.gstin=i.customer_gstin) WHERE s.booking_id IS NULL AND s.invoice_id=i.id AND s.billing_status='invoiced' AND (SELECT count(*) FROM public.corporate_accounts c2 WHERE lower(trim(c2.name))=lower(trim(i.customer_name)) AND (c2.gstin IS NULL OR c2.gstin=i.customer_gstin))=1;
CREATE OR REPLACE VIEW public.corporate_account_cities WITH (security_invoker=true) AS
 SELECT DISTINCT m.corporate_account_id,b.city FROM public.corporate_account_members m JOIN public.profiles p ON p.id=m.profile_id JOIN public.bookings b ON b.user_id=p.user_id OR b.user_id=p.id WHERE b.city IS NOT NULL
 UNION SELECT DISTINCT m.corporate_account_id,s.city FROM public.corporate_account_members m JOIN public.profiles p ON p.id=m.profile_id JOIN public.coaching_sessions s ON s.student_user_id=p.user_id OR s.student_user_id=p.id WHERE s.city IS NOT NULL
 UNION SELECT corporate_account_id,city FROM public.bookings WHERE corporate_account_id IS NOT NULL AND city IS NOT NULL
 UNION SELECT corporate_account_id,city FROM public.coaching_sessions WHERE corporate_account_id IS NOT NULL AND city IS NOT NULL;
GRANT SELECT ON public.corporate_account_cities TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.corporate_admin_profile_access(_profile_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'site_admin') AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=_profile_id AND (public.has_city_access(auth.uid(),p.preferred_city) OR EXISTS(SELECT 1 FROM public.bookings b WHERE (b.user_id=p.id OR b.user_id=p.user_id) AND public.has_city_access(auth.uid(),b.city)))));
$$;
REVOKE ALL ON FUNCTION public.corporate_admin_profile_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.corporate_admin_profile_access(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.set_corporate_memberships(_profile_id uuid,_account_ids uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.profiles WHERE id=_profile_id FOR UPDATE;
 IF NOT public.corporate_admin_profile_access(_profile_id) THEN RAISE EXCEPTION 'Not authorized to manage this member'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(COALESCE(_account_ids,'{}'::uuid[])) a WHERE NOT EXISTS(SELECT 1 FROM public.corporate_accounts c WHERE c.id=a AND c.is_active)) THEN RAISE EXCEPTION 'Select active corporate accounts'; END IF;
 DELETE FROM public.corporate_account_members WHERE profile_id=_profile_id AND NOT(corporate_account_id=ANY(COALESCE(_account_ids,'{}'::uuid[])));
 INSERT INTO public.corporate_account_members(profile_id,corporate_account_id) SELECT _profile_id,a FROM (SELECT DISTINCT unnest(COALESCE(_account_ids,'{}'::uuid[])) a) ids ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.set_corporate_memberships(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_corporate_memberships(uuid,uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.register_corporate_member(_name text,_email text DEFAULT NULL,_phone text DEFAULT NULL,_city text DEFAULT NULL,_account_ids uuid[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.profiles; e text:=nullif(lower(trim(_email)),'');
BEGIN
 IF NOT public.is_admin_or_site_admin(auth.uid()) OR (NOT public.has_role(auth.uid(),'admin') AND NOT public.has_city_access(auth.uid(),_city)) THEN RAISE EXCEPTION 'Not authorized for this city'; END IF;
 IF nullif(trim(_name),'') IS NULL THEN RAISE EXCEPTION 'Display name is required'; END IF;
 IF e IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(e,0));
  SELECT * INTO p FROM public.profiles WHERE lower(email)=e ORDER BY updated_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('existing',true,'profile_id',p.id,'display_name',p.display_name); END IF;
 END IF;
 INSERT INTO public.profiles(display_name,email,phone,preferred_city,user_type) VALUES(trim(_name),e,nullif(trim(_phone),''),nullif(_city,''),'guest') RETURNING * INTO p;
 PERFORM public.set_corporate_memberships(p.id,_account_ids);
 RETURN jsonb_build_object('existing',false,'profile_id',p.id,'display_name',p.display_name);
END;
$$;
REVOKE ALL ON FUNCTION public.register_corporate_member(text,text,text,text,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_corporate_member(text,text,text,text,uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.validate_corporate_booking(_caller uuid,_profile_ref uuid,_account_id uuid,_city text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid;
BEGIN
 IF NOT public.is_admin_or_site_admin(_caller) OR NOT public.has_city_access(_caller,_city) THEN RAISE EXCEPTION 'Administrator city access required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bays WHERE city=_city) THEN RAISE EXCEPTION 'Unknown city'; END IF;
 SELECT id INTO pid FROM public.profiles WHERE id=_profile_ref OR user_id=_profile_ref ORDER BY (user_id=_profile_ref) DESC NULLS LAST LIMIT 1;
 IF NOT EXISTS(SELECT 1 FROM public.corporate_account_members m JOIN public.corporate_accounts c ON c.id=m.corporate_account_id WHERE m.profile_id=pid AND c.id=_account_id AND c.is_active) THEN RAISE EXCEPTION 'Member is not assigned to this active corporate account'; END IF;
 RETURN pid;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_corporate_booking(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_corporate_booking(uuid,uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.preserve_corporate_memberships_before_merge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE keep_id uuid;
BEGIN
 IF OLD.user_id IS NULL AND OLD.email IS NOT NULL THEN
  SELECT id INTO keep_id FROM public.profiles WHERE id<>OLD.id AND user_id IS NULL AND lower(email)=lower(OLD.email) ORDER BY updated_at DESC LIMIT 1;
  IF keep_id IS NOT NULL THEN INSERT INTO public.corporate_account_members(profile_id,corporate_account_id) SELECT keep_id,corporate_account_id FROM public.corporate_account_members WHERE profile_id=OLD.id ON CONFLICT DO NOTHING; END IF;
 END IF;
 RETURN OLD;
END;
$$;
CREATE TRIGGER preserve_corporate_memberships_before_merge BEFORE DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.preserve_corporate_memberships_before_merge();
COMMENT ON COLUMN public.profiles.corporate_account_id IS 'DEPRECATED: corporate_account_members is the membership source; sessions record their own corporate_account_id';
COMMENT ON COLUMN public.profiles.billing_mode IS 'DEPRECATED: corporate status is derived from corporate_account_members';