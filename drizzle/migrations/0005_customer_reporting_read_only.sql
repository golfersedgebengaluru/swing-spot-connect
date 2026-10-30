CREATE OR REPLACE FUNCTION public.customer_report_visit(_status text, _start timestamptz, _billing text, _invoice uuid, _hours_paid boolean, _as_of timestamptz) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT coalesce(_status='confirmed' AND _start<=_as_of AND (_billing IN ('deferred','invoiced') OR _invoice IS NOT NULL OR _hours_paid),false) $$;
CREATE OR REPLACE FUNCTION public.customer_report_preset(_preset text, _first date, _last date, _next timestamptz, _count bigint, _hours numeric, _from date, _to date, _as_of date) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE _preset WHEN 'first-time' THEN _first BETWEEN _from AND _to WHEN 'repeat' THEN _count>=2 WHEN 'inactive' THEN _last IS NOT NULL AND _last<=_as_of-60 AND _next IS NULL WHEN 'low-hours' THEN _hours IS NOT NULL AND _hours<=1 ELSE true END $$;
REVOKE ALL ON FUNCTION public.customer_report_visit(text,timestamptz,text,uuid,boolean,timestamptz), public.customer_report_preset(text,date,date,timestamptz,bigint,numeric,date,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_report_visit(text,timestamptz,text,uuid,boolean,timestamptz), public.customer_report_preset(text,date,date,timestamptz,bigint,numeric,date,date,date) TO service_role;
CREATE OR REPLACE FUNCTION public.customer_report(_city text DEFAULT NULL, _preferred_city text DEFAULT NULL, _visited_city text DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL, _preset text DEFAULT 'all', _type text DEFAULT 'all', _search text DEFAULT '', _profile_id uuid DEFAULT NULL, _offset integer DEFAULT 0, _limit integer DEFAULT 50, _as_of timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_admin boolean; v_cities text[]; v_as_of timestamptz; v_day date; v_result jsonb;
BEGIN
 v_admin:=public.has_role(auth.uid(),'admin');
 IF auth.uid() IS NULL OR NOT (v_admin OR public.has_role(auth.uid(),'site_admin')) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 SELECT array_agg(DISTINCT b.city) INTO v_cities FROM public.bays b WHERE v_admin OR public.has_city_access(auth.uid(),b.city);
 IF v_cities IS NULL THEN RAISE EXCEPTION 'No authorized locations' USING ERRCODE='42501'; END IF;
 IF (_city IS NOT NULL AND NOT (_city=ANY(v_cities))) OR (_visited_city IS NOT NULL AND NOT (_visited_city=ANY(v_cities))) OR (_preferred_city IS NOT NULL AND NOT (_preferred_city=ANY(v_cities))) THEN RAISE EXCEPTION 'Location access denied' USING ERRCODE='42501'; END IF;
 IF _city IS NOT NULL THEN v_cities:=ARRAY[_city]; END IF;
 IF _from IS NOT NULL AND _to IS NOT NULL AND _from>_to THEN RAISE EXCEPTION 'Invalid reporting period'; END IF;
 IF _preset NOT IN ('all','first-time','repeat','inactive','low-hours','online') OR _type NOT IN ('all','pre-registered','registered','member') OR _offset<0 OR _limit<1 OR _limit>500 THEN RAISE EXCEPTION 'Invalid report filter'; END IF;
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
 SELECT profile_id,min(visit_day) FILTER(WHERE qualifies) AS first_visit,max(start_time) FILTER(WHERE qualifies) AS last_visit,max(visit_day) FILTER(WHERE qualifies) AS last_visit_day,
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
 SELECT r.*,o.profile_id FROM public.revenue_transactions r LEFT JOIN revenue_owners o ON o.id=r.id LEFT JOIN public.bookings b ON b.id=r.booking_id
 WHERE r.status='confirmed' AND r.city=ANY(v_cities) AND r.revenue_date<=v_day AND b.corporate_account_id IS NULL
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
 bs.first_visit,bs.last_visit,bs.next_booking,coalesce(bs.visit_count,0) AS visit_count,coalesce(bs.lifetime_visits,0) AS lifetime_visits,coalesce(bs.corporate_visits,0) AS corporate_visits,coalesce(bs.visited_cities,ARRAY[]::text[]) AS visited_cities,
 coalesce(s.period_spend,'{}'::jsonb) AS period_spend,coalesce(s.lifetime_spend,'{}'::jsonb) AS lifetime_spend,CASE WHEN bs.has_online THEN 'Online' ELSE 'Unknown' END AS booking_channel,
 CASE WHEN h.member_hours_id IS NOT NULL THEN 'member' WHEN p.user_id IS NOT NULL THEN 'registered' ELSE 'pre-registered' END AS customer_status
 FROM public.profiles p LEFT JOIN booking_stats bs ON bs.profile_id=p.id LEFT JOIN hours h ON h.profile_id=p.id LEFT JOIN spend s ON s.profile_id=p.id
 WHERE (_profile_id IS NULL OR p.id=_profile_id) AND (_preferred_city IS NULL OR p.preferred_city=_preferred_city)
 AND ((v_admin AND _city IS NULL) OR p.preferred_city=ANY(v_cities) OR EXISTS(SELECT 1 FROM scoped_bookings sb WHERE sb.profile_id=p.id) OR s.profile_id IS NOT NULL)
 AND (_visited_city IS NULL OR EXISTS(SELECT 1 FROM scoped_bookings sb WHERE sb.profile_id=p.id AND sb.city=_visited_city AND sb.qualifies AND (_from IS NULL OR sb.visit_day>=_from) AND (_to IS NULL OR sb.visit_day<=_to)))
 AND (coalesce(_search,'')='' OR position(lower(_search) IN lower(coalesce(p.display_name,'')||' '||coalesce(p.email,'')||' '||coalesce(p.phone,'')))>0)
 AND public.customer_report_preset(_preset,bs.first_visit,bs.last_visit_day,bs.next_booking,coalesce(bs.visit_count,0),CASE WHEN h.member_hours_id IS NOT NULL THEN h.hours_purchased-h.hours_used END,_from,_to,v_day)
 AND (_preset<>'online' OR bs.has_online)
 ), filtered AS (SELECT * FROM customer_rows WHERE _type='all' OR customer_status=_type), page AS (SELECT * FROM filtered ORDER BY lower(coalesce(display_name,'')),id OFFSET _offset LIMIT _limit), reconciliation AS (
 SELECT count(*) AS completed_online,count(*) FILTER(WHERE linkage.profiles=1 AND linkage.bookings>=1) AS linked,count(*) FILTER(WHERE linkage.profiles>1) AS ambiguous,count(*) FILTER(WHERE linkage.profiles=0 AND nullif(trim(pg.guest_email),'') IS NULL AND nullif(trim(pg.guest_phone),'') IS NULL) AS missing_contact,count(*) FILTER(WHERE linkage.profiles=0 AND (nullif(trim(pg.guest_email),'') IS NOT NULL OR nullif(trim(pg.guest_phone),'') IS NOT NULL)) AS needs_review
 FROM public.pending_guest_bookings pg CROSS JOIN LATERAL (SELECT count(DISTINCT ro.profile_id) AS profiles,count(DISTINCT r.booking_id) AS bookings FROM public.revenue_transactions r LEFT JOIN revenue_owners ro ON ro.id=r.id WHERE r.gateway_order_ref=pg.razorpay_order_id) linkage
 WHERE pg.status='completed' AND pg.city=ANY(v_cities) AND (_from IS NULL OR (pg.start_time AT TIME ZONE 'Asia/Kolkata')::date>=_from) AND (_to IS NULL OR (pg.start_time AT TIME ZONE 'Asia/Kolkata')::date<=_to)
 ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),'total',(SELECT count(*) FROM filtered),'as_of',v_as_of,'cities',v_cities,'timezone','Asia/Kolkata','reconciliation',(SELECT to_jsonb(reconciliation) FROM reconciliation),'unlinked_revenue',(SELECT count(*) FROM eligible_revenue WHERE profile_id IS NULL),'missing_revenue_date',(SELECT count(*) FROM public.revenue_transactions r WHERE r.status='confirmed' AND r.city=ANY(v_cities) AND r.revenue_date IS NULL)) INTO v_result;
 RETURN v_result;
END $function$;
REVOKE ALL ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz) TO authenticated,service_role;
COMMENT ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz) IS 'Read-only customer reporting with role/city authorization, dual-key identity, signed revenue and evidence-only online origin. Current reporting calendar is Asia/Kolkata; never infer a timezone from currency.';