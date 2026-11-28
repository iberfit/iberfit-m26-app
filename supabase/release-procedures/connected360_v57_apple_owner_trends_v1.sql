-- CANDIDATE ONLY. Owner longitudinal observations, no expansion of V56 Coach consent.
-- No new storage or index; two equal finished civil-day windows, positive observations only.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF to_regprocedure('private.m26_v55_apple_owner_history(timestamptz,uuid)') IS NULL
 OR to_regprocedure('private.m26_v53_apple_exercise_status()') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.m26_wearable_exercise_evidence_v46'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r(role_name) CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) a(action) WHERE has_table_privilege(r.role_name,'public.m26_wearable_exercise_evidence_v46',a.action))
 OR EXISTS(SELECT 1 FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='m26_wearable_exercise_evidence_v46' AND grantee IN ('anon','authenticated','PUBLIC'))
 THEN RAISE EXCEPTION 'M26_V57_PREREQUISITES_REQUIRED'; END IF;
END $guard$;
CREATE FUNCTION private.m26_v57_apple_owner_trends(p_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_owner uuid:=auth.uid(); v_client uuid:=private.m26_v53_apple_client_context();
 v_status jsonb; v_periods jsonb;
 v_end date:=(pg_catalog.now() AT TIME ZONE 'America/Santiago')::date-1;
 v_start date;
BEGIN
 IF p_days IS NULL OR p_days NOT IN (7,28,90,365) THEN RAISE EXCEPTION 'M26_V57_PERIOD_INVALID' USING ERRCODE='22023'; END IF;
 v_start:=v_end-2*p_days+1;
 -- Existing status acquires the owner/client fence and rechecks live session.
 v_status:=private.m26_v53_apple_exercise_status();
 IF private.m26_v53_apple_client_context() IS DISTINCT FROM v_client
 THEN RAISE EXCEPTION 'M26_V57_OWNER_CHANGED' USING ERRCODE='42501'; END IF;
 WITH observed AS (
  SELECT (w.observed_started_at AT TIME ZONE 'America/Santiago')::date AS day,w.sport,
   coalesce(v_status->>'authorized'='true' AND w.grant_id=(v_status->>'grantId')::uuid
    AND w.revocation_cursor=(v_status->>'revocationCursor')::bigint,false) AS current_grant
  FROM public.m26_wearable_exercise_evidence_v46 w
  WHERE w.owner_user_id=v_owner AND w.client_id=v_client AND w.provider='apple_health'
   AND w.link_status='unlinked' AND w.observed_ended_at<=pg_catalog.now()
   AND w.observed_started_at>=(v_start::timestamp AT TIME ZONE 'America/Santiago')
   AND w.observed_started_at<((v_end+1)::timestamp AT TIME ZONE 'America/Santiago')
 ), dated AS (
  SELECT CASE WHEN day>v_end-p_days THEN 'recent' ELSE 'previous' END AS window_key,day,sport,current_grant
  FROM observed WHERE day BETWEEN v_start AND v_end
 ), daily AS (
  SELECT window_key,day,sport,pg_catalog.bool_or(current_grant) AS has_current,pg_catalog.bool_or(NOT current_grant) AS has_retained
  FROM dated GROUP BY GROUPING SETS ((window_key,day,sport),(window_key,day))
 ), counts AS (
  SELECT window_key,sport,count(*)::integer AS observed_days,
   (count(*) FILTER (WHERE has_current AND NOT has_retained))::integer AS current_only,
   (count(*) FILTER (WHERE has_retained AND NOT has_current))::integer AS retained_only,
   (count(*) FILTER (WHERE has_current AND has_retained))::integer AS mixed
  FROM daily GROUP BY window_key,sport
 ), windows(window_key,first_day,last_day,ordinal) AS (
  VALUES ('recent',v_end-p_days+1,v_end,1),('previous',v_start,v_end-p_days,2)
 ), result AS (
  SELECT w.ordinal,pg_catalog.jsonb_build_object('kind',w.window_key,'periodStart',w.first_day,'periodEnd',w.last_day,
    'observedDays',coalesce(c.observed_days,0),'currentOnlyDays',coalesce(c.current_only,0),
    'retainedOnlyDays',coalesce(c.retained_only,0),'mixedDays',coalesce(c.mixed,0),
    'disciplines',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('sport',d.sport,'observedDays',d.observed_days,
     'currentOnlyDays',d.current_only,'retainedOnlyDays',d.retained_only,'mixedDays',d.mixed) ORDER BY d.sport)
     FROM counts d WHERE d.window_key=w.window_key AND d.sport IS NOT NULL),'[]'::jsonb)) AS period
  FROM windows w LEFT JOIN counts c ON c.window_key=w.window_key AND c.sport IS NULL
 )
 SELECT pg_catalog.jsonb_agg(period ORDER BY ordinal) INTO v_periods FROM result;
 RETURN pg_catalog.jsonb_build_object('ok',true,'schema','iberfit.connected360.apple-owner-trends.v1',
   'provider','apple_health','clientId',v_client,'windowDays',p_days,'coverage','observed-only','periods',v_periods);
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v57_apple_owner_trends(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.m26_v57_apple_owner_trends(integer) TO authenticated;
CREATE FUNCTION public.m26_wearable_v57_apple_owner_trends_v1(p_days integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v57_apple_owner_trends(p_days) $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v57_apple_owner_trends_v1(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v57_apple_owner_trends_v1(integer) TO authenticated;
COMMIT;
