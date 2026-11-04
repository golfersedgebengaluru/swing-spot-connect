DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz,text,text)'::regprocedure) INTO definition;
 IF position('IF _to IS NOT NULL AND _to<v_day' IN definition)=0 OR position('THEN bs.next_confirmed ELSE bs.next_booking END' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected customer report definition'; END IF;
 definition:=replace(definition,'IF _to IS NOT NULL AND _to<v_day THEN v_as_of:=least(v_as_of,((_to+1)::timestamp AT TIME ZONE ''Asia/Kolkata'')-interval ''1 microsecond''); v_day:=_to; END IF;','-- Date bounds select activity only; the report as-of remains independent.');
 definition:=replace(definition,'CASE WHEN _preset IN (''dashboard'',''renewal-opportunities'',''inactive-repeat'') THEN bs.next_confirmed ELSE bs.next_booking END AS next_booking','bs.next_confirmed AS next_booking');
 definition:=replace(definition,'bs.last_visit_day,bs.next_booking,coalesce(bs.visit_count,0)','bs.last_visit_day,bs.next_confirmed,coalesce(bs.visit_count,0)');
 definition:=replace(definition,'THEN customer_status END','THEN CASE coalesce(user_type,''registered'') WHEN ''birdie'' THEN ''Birdie Member'' WHEN ''coaching'' THEN ''Coaching Member'' WHEN ''non-registered'' THEN ''Guest'' WHEN ''member'' THEN ''Member'' WHEN ''guest'' THEN ''Pre-registered'' ELSE ''Registered'' END END');
 definition:=replace(definition,'THEN hours_remaining END','THEN CASE WHEN member_hours_id IS NOT NULL THEN hours_remaining END END');
 definition:=replace(definition,'page AS (SELECT * FROM filtered ORDER BY','page AS (SELECT * FROM filtered ORDER BY CASE WHEN _sort IN (''spend'',''total-spend'') THEN (SELECT string_agg(key,'','' ORDER BY key) FROM jsonb_each_text(CASE WHEN _sort=''spend'' THEN period_spend ELSE lifetime_spend END)) END ASC NULLS LAST,');
 definition:=replace(definition,'(SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(lifetime_spend))','(SELECT CASE WHEN count(*)=1 THEN max(value::numeric) END FROM jsonb_each_text(lifetime_spend))');
 definition:=replace(definition,'(SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(period_spend))','(SELECT CASE WHEN count(*)=1 THEN max(value::numeric) END FROM jsonb_each_text(period_spend))');
 EXECUTE definition;
END $migration$;
REVOKE ALL ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz,text,text) TO authenticated,service_role;
COMMENT ON FUNCTION public.customer_report(text,text,text,date,date,text,text,text,uuid,integer,integer,timestamptz,text,text) IS 'Read-only authorized city-scoped customer reporting. From/To are inclusive activity bounds, independent from the as-of cutoff. Directory uses visit_count and period_spend, unbounded by default; lifetime metrics remain available for customer summaries. Next booking is consistently future confirmed. Type sorting follows editable membership type, status filtering remains derived. Spend sorting groups currencies without adding unlike currencies; unknown hours sort last.';