-- CANDIDATE ONLY. Separate explicit permission for 7/28/90/365-day
-- comparisons (up to 730 civil days), current provider generation only.
-- Never a permission to publish reports, read retained grants or biometrics.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF to_regprocedure('private.m26_v56_apple_coach_decision(text,uuid,uuid,integer,boolean)') IS NULL
 OR to_regprocedure('private.m26_v56_apple_coach_recipient_projection(text)') IS NULL
 OR to_regprocedure('private.m26_v56_apple_coach_access(uuid,text)') IS NULL
 OR to_regprocedure('private.m26_v57_apple_owner_trends(integer)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.m26_wearable_coach_consent_v49'::regclass AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (owner_user_id, client_id, coach_user_id, provider, purpose)')
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='private.m26_wearable_coach_consent_v49'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR NOT EXISTS(SELECT 1 FROM public.m26_wearable_v46_release_control_prod WHERE id=true AND apple_exercise_enabled=false)
 THEN RAISE EXCEPTION 'M26_V58_PREREQUISITES_REQUIRED'; END IF;
END $guard$;
CREATE FUNCTION private.m26_v58_set_apple_coach_trend_consent(p_coach uuid,p_assignment uuid,p_expected_revision integer,p_allow boolean) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $f$ SELECT private.m26_v56_apple_coach_decision('coaching-apple-trends-v1',p_coach,p_assignment,p_expected_revision,p_allow)||pg_catalog.jsonb_build_object('purpose','coaching-apple-trends-v1') $f$;
CREATE FUNCTION private.m26_v58_my_apple_coach_trend_recipients() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $f$ SELECT private.m26_v56_apple_coach_recipient_projection('coaching-apple-trends-v1') $f$;
CREATE FUNCTION private.m26_v58_apple_coach_trends(p_client uuid,p_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_g private.m26_wearable_coach_consent_v49%rowtype;
 v_end date:=(pg_catalog.now() AT TIME ZONE 'America/Santiago')::date-1;
 v_start date; v_periods jsonb;
BEGIN
 IF p_days IS NULL OR p_days NOT IN (7,28,90,365) THEN RAISE EXCEPTION 'M26_V58_PERIOD_INVALID' USING ERRCODE='22023'; END IF;
 v_g:=private.m26_v56_apple_coach_access(p_client,'coaching-apple-trends-v1');
 v_start:=v_end-2*p_days+1;
 WITH observed AS (
  SELECT DISTINCT (w.observed_started_at AT TIME ZONE 'America/Santiago')::date AS day,w.sport
  FROM public.m26_wearable_exercise_evidence_v46 w
  WHERE w.owner_user_id=v_g.owner_user_id AND w.client_id=p_client AND w.provider='apple_health'
    AND w.grant_id=v_g.source_grant_id AND w.revocation_cursor=v_g.source_cursor AND w.link_status='unlinked'
    AND w.observed_started_at>=(v_start::timestamp AT TIME ZONE 'America/Santiago')
    AND w.observed_started_at<((v_end+1)::timestamp AT TIME ZONE 'America/Santiago')
    AND w.observed_ended_at<=pg_catalog.now()
 ), dated AS (
  SELECT CASE WHEN day>v_end-p_days THEN 'recent' ELSE 'previous' END AS window_key,day,sport
  FROM observed WHERE day BETWEEN v_start AND v_end
 ), counts AS (
  SELECT window_key,sport,count(DISTINCT day)::integer AS observed_days
  FROM dated GROUP BY GROUPING SETS ((window_key,sport),(window_key))
 ), windows(window_key,first_day,last_day,ordinal) AS (
  VALUES ('recent',v_end-p_days+1,v_end,1),('previous',v_start,v_end-p_days,2)
 ), result AS (
  SELECT w.ordinal,pg_catalog.jsonb_build_object('kind',w.window_key,'periodStart',w.first_day,'periodEnd',w.last_day,
    'observedDays',coalesce(c.observed_days,0),
    'disciplines',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('sport',d.sport,'observedDays',d.observed_days) ORDER BY d.sport)
     FROM counts d WHERE d.window_key=w.window_key AND d.sport IS NOT NULL),'[]'::jsonb)) AS period
  FROM windows w LEFT JOIN counts c ON c.window_key=w.window_key AND c.sport IS NULL
 )
 SELECT pg_catalog.jsonb_agg(period ORDER BY ordinal) INTO v_periods FROM result;
 RETURN pg_catalog.jsonb_build_object('ok',true,'schema','iberfit.connected360.apple-coach-trends.v1',
   'provider','apple_health','clientId',p_client,'purpose','coaching-apple-trends-v1','windowDays',p_days,
   'coverage','observed-only','periods',v_periods);
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v58_set_apple_coach_trend_consent(uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.m26_v58_set_apple_coach_trend_consent(uuid,uuid,integer,boolean) TO authenticated;
CREATE FUNCTION public.m26_wearable_v58_set_apple_coach_trend_consent_v1(p_coach uuid,p_assignment uuid,p_expected_revision integer,p_allow boolean) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v58_set_apple_coach_trend_consent(p_coach,p_assignment,p_expected_revision,p_allow) $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v58_set_apple_coach_trend_consent_v1(uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v58_set_apple_coach_trend_consent_v1(uuid,uuid,integer,boolean) TO authenticated;
REVOKE ALL ON FUNCTION private.m26_v58_my_apple_coach_trend_recipients() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.m26_v58_my_apple_coach_trend_recipients() TO authenticated;
CREATE FUNCTION public.m26_wearable_v58_my_apple_coach_trend_recipients_v1() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v58_my_apple_coach_trend_recipients() $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v58_my_apple_coach_trend_recipients_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v58_my_apple_coach_trend_recipients_v1() TO authenticated;
REVOKE ALL ON FUNCTION private.m26_v58_apple_coach_trends(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.m26_v58_apple_coach_trends(uuid,integer) TO authenticated;
CREATE FUNCTION public.m26_wearable_v58_apple_coach_trends_v1(p_client uuid,p_days integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v58_apple_coach_trends(p_client,p_days) $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v58_apple_coach_trends_v1(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v58_apple_coach_trends_v1(uuid,integer) TO authenticated;
COMMIT;
