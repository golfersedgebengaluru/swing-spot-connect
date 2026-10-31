DROP FUNCTION IF EXISTS public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz);
CREATE OR REPLACE FUNCTION public.customer_report(_city text DEFAULT NULL, _preferred_city text DEFAULT NULL, _visited_city text DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL, _preset text DEFAULT 'all', _type text DEFAULT 'all', _search text DEFAULT '', _profile_id uuid DEFAULT NULL, _offset integer DEFAULT 0, _limit integer DEFAULT 50, _as_of timestamptz DEFAULT now(), _sort text DEFAULT NULL, _dir text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_admin boolean; v_cities text[]; v_as_of timestamptz; v_day date; v_result jsonb;
BEGIN
 v_admin:=public.has_role(auth.uid(),'admin');
 IF auth.uid() IS NULL OR NOT (v_admin OR public.has_role(auth.uid(),'site_admin')) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 SELECT array_agg(DISTINCT b.city) INTO v_cities FROM public.bays b WHERE v_admin OR public.has_city_access(auth.uid(),b.city);
 IF v_cities IS NULL THEN RAISE EXCEPTION 'No authorized locations' USING ERRCODE='42501'; END IF;
 IF (_city IS NOT NULL AND NOT (_city=ANY(v_cities))) OR (_visited_city IS NOT NULL AND NOT (_visited_city=ANY(v_cities))) OR (_preferred_city IS NOT NULL AND NOT (_preferred_city=ANY(v_cities))) THEN RAISE EXCEPTION 'Location access denied' USING ERRCODE='42501'; END IF;
 IF _city IS NOT NULL THEN v_cities:=ARRAY[_city]; END IF;
 IF _from IS NOT NULL AND _to IS NOT NULL AND _from>_to THEN RAISE EXCEPTION 'Invalid reporting period'; END IF;
 IF _preset NOT IN ('all','first-time','repeat','inactive','low-hours','online','dashboard','renewal-opportunities','inactive-repeat') OR _type NOT IN ('all','pre-registered','registered','member') OR _offset<0 OR _limit<1 OR _limit>500 OR (_sort IS NOT NULL AND _sort NOT IN ('name','type','hours','points','last-visit','next-booking','period-visits','spend')) OR (_dir IS NOT NULL AND _dir NOT IN ('asc','desc')) THEN RAISE EXCEPTION 'Invalid report filter'; END IF;
 v_as_of:=least(coalesce(_as_of,now()),now()); v_day:=(v_as_of AT TIME ZONE 'Asia/Kolkata')::date;
 IF _to IS NOT NULL AND _to<v_day THEN v_as_of:=least(v_as_of,((_to+1)::timestamp AT TIME ZONE 'Asia/Kolkata')-interval '1 microsecond'); v_day:=_to; END IF;
 WITH identities AS (
 SELECT p.id AS profile_id,p.id AS identity FROM public.profiles p UNION SELECT p.id,p.user_id FROM public.profiles p WHERE p.user_id IS NOT NULL
 ), booking_owners AS (
 SELECT b.id,min(i.profile_id::text)::uuid AS profile_id FROM public.bookings b JOIN identities i ON i.identity=b.user_id GROUP BY b.id HAVING count(DISTINCT i.profile_id)=1
 ), scoped_bookings AS (
 SELECT b.*,o.profile_id,coalesce(b.parent_booking_id,b.id) AS visit_id,(b.start_time AT TIME ZONE 'Asia/Kolkata')::date AS visit_day,
 public.customer_report_visit(b.status,b.start_time,b.billing_status,b.invoice_id,EXISTS(SELECT 1 FROM public.hours_transactions h WHERE h.booking_id=b.id),v_as_of) AS qualifies,
 EXISTS(SELECT 1 FROM public.pending_bookings pb WHERE pb.booking_id=b.id AND pb.status='completed') OR EXISTS(SELECT 1 FROM public.revenue_transactions r JOIN public.pending_guest_bookings pg ON pg.razorpay_order_id=r.gateway_order_ref AND pg.status='completed' WHERE r.booking_id=b.id AND r.status='confirmed') AS online
 FROM public.bookings b JOIN booking_owners o ON o.id=b.id WHERE b.city=ANY(v_cities)
 ), booking_stats AS (
 SELECT profile_id,min(start_time) FILTER(WHERE status='confirmed' AND start_time>v_as_of) AS next_confirmed,min(visit_day) FILTER(WHERE qualifies) AS first_visit,max(start_time) FILTER(WHERE qualifies) AS last_visit,max(visit_day) FILTER(WHERE qualifies) AS last_visit_day,
 min(start_time) FILTER(WHERE status='confirmed' AND start_time>v_as_of AND (billing_status IN ('deferred','invoiced') OR invoice_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.hours_transactions h WHERE h.booking_id=scoped_bookings.id))) AS next_booking,
 count(DISTINCT visit_id) FILTER(WHERE qualifies AND (_from IS NULL OR visit_day>=_from) AND (_to IS NULL OR visit_day<=_to)) AS visit_count,
 count(DISTINCT visit_id) FILTER(WHERE qualifies) AS lifetime_visits,
 array_agg(DISTINCT city) FILTER(WHERE qualifies) AS visited_cities,
 bool_or(online AND qualifies AND (_from IS NULL OR visit_day>=_from) AND (_to IS NULL OR visit_day<=_to)) AS has_online,
 count(DISTINCT visit_id) FILTER(WHERE qualifies AND corporate_account_id IS NOT NULL AND (_from IS NULL OR visit_day>=_from) AND (_to IS NULL OR visit_day<=_to)) AS corporate_visits
 FROM scoped_bookings GROUP BY profile_id
 ), revenue_owners AS (
 SELECT r.id,min(candidate.profile_id::text)::uuid AS profile_id FROM public.revenue_transactions r
 CROSS JOIN LATERAL (SELECT i.profile_id FROM identities i WHERE i.identity=r.user_id UNION SELECT o.profile_id FROM booking_owners o WHERE o.id=r.booking_id UNION SELECT i.profile_id FROM public.revenue_transactions original JOIN identities i ON i.identity=original.user_id WHERE original.id=r.original_transaction_id) candidate
 GROUP BY r.id HAVING count(DISTINCT candidate.profile_id)=1
 ), eligible_revenue AS (
 SELECT r.*,o.profile_id FROM public.revenue_transactions r LEFT JOIN revenue_owners o ON o.id=r.id LEFT JOIN public.revenue_transactions original ON original.id=r.original_transaction_id LEFT JOIN public.bookings b ON b.id=coalesce(r.booking_id,original.booking_id)
 WHERE r.status='confirmed' AND r.city=ANY(v_cities) AND r.revenue_date<=v_day AND b.corporate_account_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.invoices inv WHERE inv.revenue_transaction_id IN (r.id,original.id) AND (EXISTS(SELECT 1 FROM public.bookings corporate_booking WHERE corporate_booking.invoice_id=inv.id AND corporate_booking.corporate_account_id IS NOT NULL) OR EXISTS(SELECT 1 FROM public.coaching_sessions corporate_training WHERE corporate_training.invoice_id=inv.id AND corporate_training.corporate_account_id IS NOT NULL)))
 ), currency_totals AS (
 SELECT profile_id,currency,sum(amount) AS lifetime,sum(amount) FILTER(WHERE (_from IS NULL OR revenue_date>=_from) AND (_to IS NULL OR revenue_date<=_to)) AS period
 FROM eligible_revenue WHERE profile_id IS NOT NULL GROUP BY profile_id,currency
 ), spend AS (
 SELECT profile_id,jsonb_object_agg(coalesce(currency,'Unknown'),coalesce(period,0)) AS period_spend,jsonb_object_agg(coalesce(currency,'Unknown'),lifetime) AS lifetime_spend FROM currency_totals GROUP BY profile_id
 ), hours AS (
 SELECT i.profile_id,min(h.id::text)::uuid AS member_hours_id,sum(h.hours_purchased) AS hours_purchased,sum(h.hours_used) AS hours_used FROM public.member_hours h JOIN identities i ON i.identity=h.user_id GROUP BY i.profile_id
 ), customer_rows AS (
 SELECT p.id,p.user_id,p.display_name,p.email,p.phone,p.points,p.created_at,p.user_type,p.preferred_city,p.extended_hours_access,
 h.member_hours_id,coalesce(h.hours_purchased,0) AS hours_purchased,coalesce(h.hours_used,0) AS hours_used,coalesce(h.hours_purchased-h.hours_used,0) AS hours_remaining,
 bs.first_visit,bs.last_visit,CASE WHEN _preset IN ('dashboard','renewal-opportunities','inactive-repeat') THEN bs.next_confirmed ELSE bs.next_booking END AS next_booking,coalesce(bs.visit_count,0) AS visit_count,coalesce(bs.lifetime_visits,0) AS lifetime_visits,coalesce(bs.corporate_visits,0) AS corporate_visits,coalesce(bs.visited_cities,ARRAY[]::text[]) AS visited_cities,
 coalesce(s.period_spend,'{}'::jsonb) AS period_spend,coalesce(s.lifetime_spend,'{}'::jsonb) AS lifetime_spend,CASE WHEN bs.has_online THEN 'Online' ELSE 'Unknown' END AS booking_channel,
 CASE WHEN h.member_hours_id IS NOT NULL THEN 'member' WHEN p.user_id IS NOT NULL THEN 'registered' ELSE 'pre-registered' END AS customer_status
 FROM public.profiles p LEFT JOIN booking_stats bs ON bs.profile_id=p.id LEFT JOIN hours h ON h.profile_id=p.id LEFT JOIN spend s ON s.profile_id=p.id
 WHERE (_profile_id IS NULL OR p.id=_profile_id) AND (_preferred_city IS NULL OR p.preferred_city=_preferred_city)
 AND ((v_admin AND _city IS NULL) OR p.preferred_city=ANY(v_cities) OR EXISTS(SELECT 1 FROM scoped_bookings sb WHERE sb.profile_id=p.id) OR s.profile_id IS NOT NULL)
 AND (_visited_city IS NULL OR EXISTS(SELECT 1 FROM scoped_bookings sb WHERE sb.profile_id=p.id AND sb.city=_visited_city AND sb.qualifies AND (_from IS NULL OR sb.visit_day>=_from) AND (_to IS NULL OR sb.visit_day<=_to)))
 AND (coalesce(_search,'')='' OR position(lower(_search) IN lower(coalesce(p.display_name,'')||' '||coalesce(p.email,'')||' '||coalesce(p.phone,'')))>0)
 AND public.customer_report_preset(_preset,bs.first_visit,bs.last_visit_day,bs.next_booking,coalesce(bs.visit_count,0),CASE WHEN h.member_hours_id IS NOT NULL THEN h.hours_purchased-h.hours_used END,_from,_to,v_day)
 AND (_preset<>'online' OR bs.has_online)
 ), filtered AS (SELECT * FROM customer_rows WHERE (_type='all' OR customer_status=_type) AND public.customer_report_attention(_preset,CASE WHEN member_hours_id IS NOT NULL THEN hours_remaining END,(last_visit AT TIME ZONE 'Asia/Kolkata')::date,next_booking,lifetime_visits,v_day)),
 renewal_candidates AS (SELECT id,display_name,email,hours_remaining,next_booking,last_visit,lifetime_visits FROM filtered WHERE _preset='dashboard' AND public.customer_report_attention('renewal-opportunities',CASE WHEN member_hours_id IS NOT NULL THEN hours_remaining END,(last_visit AT TIME ZONE 'Asia/Kolkata')::date,next_booking,lifetime_visits,v_day)),
 renewal_page AS (SELECT * FROM renewal_candidates ORDER BY next_booking ASC NULLS LAST,last_visit DESC NULLS LAST,id LIMIT 5),
 inactive_candidates AS (SELECT id,display_name,email,hours_remaining,next_booking,last_visit,lifetime_visits FROM filtered WHERE _preset='dashboard' AND public.customer_report_attention('inactive-repeat',NULL,(last_visit AT TIME ZONE 'Asia/Kolkata')::date,next_booking,lifetime_visits,v_day)),
 inactive_page AS (SELECT * FROM inactive_candidates ORDER BY last_visit DESC,id LIMIT 5),
 upcoming AS (SELECT b.* FROM public.bookings b WHERE _preset='dashboard' AND b.city=ANY(v_cities) AND b.status='confirmed' AND b.start_time>=v_as_of ORDER BY b.start_time,b.id LIMIT 5),
 first_arrivals AS (SELECT u.id FROM upcoming u JOIN booking_owners o ON o.id=u.id WHERE NOT EXISTS(SELECT 1 FROM scoped_bookings previous WHERE previous.profile_id=o.profile_id AND previous.city=u.city AND previous.qualifies AND previous.start_time<u.start_time AND previous.visit_id<>coalesce(u.parent_booking_id,u.id))),
 page AS (SELECT * FROM filtered ORDER BY
 CASE WHEN _sort IS NULL AND _preset='renewal-opportunities' THEN next_booking END ASC NULLS LAST,
 CASE WHEN _sort IS NULL AND _preset IN ('renewal-opportunities','inactive-repeat') THEN last_visit END DESC NULLS LAST,
 CASE WHEN _sort='name' AND _dir='desc' THEN lower(coalesce(display_name,'')) END DESC NULLS LAST,
 CASE WHEN _sort='name' AND coalesce(_dir,'asc')<>'desc' THEN lower(coalesce(display_name,'')) END ASC NULLS LAST,
 CASE WHEN _sort='type' AND _dir='desc' THEN customer_status END DESC NULLS LAST,
 CASE WHEN _sort='type' AND coalesce(_dir,'asc')<>'desc' THEN customer_status END ASC NULLS LAST,
 CASE WHEN _sort='hours' AND _dir='desc' THEN hours_remaining END DESC NULLS LAST,
 CASE WHEN _sort='hours' AND coalesce(_dir,'asc')<>'desc' THEN hours_remaining END ASC NULLS LAST,
 CASE WHEN _sort='points' AND _dir='desc' THEN points END DESC NULLS LAST,
 CASE WHEN _sort='points' AND coalesce(_dir,'asc')<>'desc' THEN points END ASC NULLS LAST,
 CASE WHEN _sort='last-visit' AND _dir='desc' THEN last_visit END DESC NULLS LAST,
 CASE WHEN _sort='last-visit' AND coalesce(_dir,'asc')<>'desc' THEN last_visit END ASC NULLS LAST,
 CASE WHEN _sort='next-booking' AND _dir='desc' THEN next_booking END DESC NULLS LAST,
 CASE WHEN _sort='next-booking' AND coalesce(_dir,'asc')<>'desc' THEN next_booking END ASC NULLS LAST,
 CASE WHEN _sort='period-visits' AND _dir='desc' THEN visit_count END DESC NULLS LAST,
 CASE WHEN _sort='period-visits' AND coalesce(_dir,'asc')<>'desc' THEN visit_count END ASC NULLS LAST,
 CASE WHEN _sort='spend' AND _dir='desc' THEN (SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(period_spend)) END DESC NULLS LAST,
 CASE WHEN _sort='spend' AND coalesce(_dir,'asc')<>'desc' THEN (SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(period_spend)) END ASC NULLS LAST,
 lower(coalesce(display_name,'')),id OFFSET _offset LIMIT _limit), reconciliation AS (
 SELECT count(*) AS completed_online,count(*) FILTER(WHERE linkage.profiles=1 AND linkage.bookings>=1) AS linked,count(*) FILTER(WHERE linkage.profiles>1) AS ambiguous,count(*) FILTER(WHERE linkage.profiles=0 AND nullif(trim(pg.guest_email),'') IS NULL AND nullif(trim(pg.guest_phone),'') IS NULL) AS missing_contact,count(*) FILTER(WHERE linkage.profiles=0 AND (nullif(trim(pg.guest_email),'') IS NOT NULL OR nullif(trim(pg.guest_phone),'') IS NOT NULL)) AS needs_review
 FROM public.pending_guest_bookings pg CROSS JOIN LATERAL (SELECT count(DISTINCT ro.profile_id) AS profiles,count(DISTINCT r.booking_id) AS bookings FROM public.revenue_transactions r LEFT JOIN revenue_owners ro ON ro.id=r.id WHERE r.gateway_order_ref=pg.razorpay_order_id) linkage
 WHERE pg.status='completed' AND pg.city=ANY(v_cities) AND (_from IS NULL OR (pg.start_time AT TIME ZONE 'Asia/Kolkata')::date>=_from) AND (_to IS NULL OR (pg.start_time AT TIME ZONE 'Asia/Kolkata')::date<=_to)
 ) SELECT jsonb_build_object('renewals',coalesce((SELECT jsonb_agg(to_jsonb(renewal_page)) FROM renewal_page),'[]'::jsonb),'inactive',coalesce((SELECT jsonb_agg(to_jsonb(inactive_page)) FROM inactive_page),'[]'::jsonb),'renewal_total',(SELECT count(*) FROM renewal_candidates),'inactive_total',(SELECT count(*) FROM inactive_candidates),'first_visits',coalesce((SELECT jsonb_agg(id) FROM first_arrivals),'[]'::jsonb),'rows',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),'total',(SELECT count(*) FROM filtered),'as_of',v_as_of,'cities',v_cities,'timezone','Asia/Kolkata','reconciliation',(SELECT to_jsonb(reconciliation) FROM reconciliation),'unlinked_revenue',(SELECT count(*) FROM eligible_revenue WHERE profile_id IS NULL),'missing_revenue_date',(SELECT count(*) FROM public.revenue_transactions r WHERE r.status='confirmed' AND r.city=ANY(v_cities) AND r.revenue_date IS NULL)) INTO v_result;
 RETURN v_result;
END $function$;
REVOKE ALL ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz,text,text) TO authenticated,service_role;
COMMENT ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz,text,text) IS 'Read-only customer reporting with role/city authorization, dual-key identity, signed revenue and evidence-only online origin. Sorting is whitelisted server-side (_sort/_dir); unknown values sort last and name is the tiebreaker. Current reporting calendar is Asia/Kolkata; never infer a timezone from currency.';