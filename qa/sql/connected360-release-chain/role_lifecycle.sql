-- All identities are synthetic; exercise data and switch changes roll back.
-- This checks actual installed API functions with local role/JWT adapters only.
BEGIN;
SELECT gx_test.assert((SELECT NOT enabled AND NOT swimming_enabled AND NOT apple_exercise_enabled FROM public.m26_wearable_v46_release_control_prod WHERE id), 'all switches closed after install');
SELECT gx_test.assert(NOT has_table_privilege('authenticated','public.m26_wearable_exercise_evidence_v46','SELECT,INSERT,UPDATE,DELETE'), 'no direct exercise CRUD');
SELECT gx_test.assert(NOT has_table_privilege('authenticated','private.m26_wearable_coach_consent_v49','SELECT,INSERT,UPDATE,DELETE'), 'no direct consent CRUD');
SELECT gx_test.assert(NOT has_function_privilege('anon','public.m26_wearable_v54_import_apple_exercise_v1(uuid,jsonb)','EXECUTE'), 'anonymous writer denied');
SELECT gx_test.assert(NOT has_function_privilege('authenticated','private.m26_v53_apple_exercise_source_state(uuid,uuid,boolean)','EXECUTE'), 'private proof not API');
SELECT gx_test.assert(NOT has_function_privilege('authenticated','private.m26_v49_project_recipients(uuid,uuid,jsonb,jsonb,boolean,date,text,text)','EXECUTE') AND NOT has_function_privilege('service_role','private.m26_v49_project_recipients(uuid,uuid,jsonb,jsonb,boolean,date,text,text)','EXECUTE'), 'shared recipient projection not API');
SELECT gx_test.assert(NOT has_function_privilege('authenticated','private.m26_v49_project_exercise_days(private.m26_wearable_coach_consent_v49,date)','EXECUTE') AND NOT has_function_privilege('service_role','private.m26_v49_project_exercise_days(private.m26_wearable_coach_consent_v49,date)','EXECUTE'), 'shared observation projection not API');
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SELECT gx_test.assert(public.m26_wearable_v53_apple_exercise_status_v1()->>'reason'='release-disabled','closed source status');
SELECT gx_test.expect_error('SELECT public.m26_wearable_v53_authorize_apple_exercise_v1(NULL,0,true)','42501','closed Apple source');
RESET ROLE;
-- Enable ONLY in this rolled-back local transaction for integration exercises.
UPDATE public.m26_wearable_v46_release_control_prod SET enabled=true,apple_exercise_enabled=true WHERE id;
SET ROLE authenticated;
DO $test$
DECLARE
  grant_id uuid;
  p jsonb;
  v jsonb;
  d date := (now() AT TIME ZONE 'America/Santiago')::date-2;
BEGIN
 SELECT public.m26_wearable_v53_authorize_apple_exercise_v1(NULL,0,true) INTO v;
 grant_id:=(v->>'grantId')::uuid;
 PERFORM gx_test.assert(grant_id IS NOT NULL AND v->>'alreadyAuthorized'='false','explicit Apple source grant');
 p:=jsonb_build_object('schema','iberfit.connected360.v54.apple.ingest.v1',
 'acquiredAt',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'exerciseEvidence',jsonb_build_array(jsonb_build_object(
 'observationKey',repeat('a',64),'sport','swimming',
 'startedAt',to_char(((d::timestamp+interval '12 hours') AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'endedAt',to_char(((d::timestamp+interval '13 hours') AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'activeSeconds',1800,'distanceMeters',1000)));
 PERFORM gx_test.assert(public.m26_wearable_v54_import_apple_exercise_v1(grant_id,p)->>'inserted'='1','Apple writer');
 PERFORM gx_test.assert(public.m26_wearable_v54_import_apple_exercise_v1(grant_id,p)->>'unchanged'='1','Apple exact replay');
 v:=public.m26_wearable_v55_apple_owner_history_v1(NULL,NULL);
 PERFORM gx_test.assert(jsonb_array_length(v->'exerciseEvidence')=1 AND v#>>'{exerciseEvidence,0,sport}'='swimming' AND v#>>'{exerciseEvidence,0,activeSeconds}'='1800','Apple owner history');
 PERFORM gx_test.assert(public.m26_wearable_v57_apple_owner_trends_v1(7)#>>'{periods,0,observedDays}'='1','Apple owner trends');
 PERFORM gx_test.assert(jsonb_array_length(public.m26_wearable_v48_my_activity_page_prod_v1(NULL,NULL)->'exerciseEvidence')=0,'Android history excludes Apple');
 PERFORM gx_test.assert(public.m26_wearable_v56_set_apple_coach_consent_v1('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',0,true)->>'shared'='true','weekly consent');
 PERFORM gx_test.assert(public.m26_wearable_v56_my_apple_coach_recipients_v1()#>>'{recipients,0,effective}'='true','Apple recipient effective');
 PERFORM gx_test.assert(NOT coalesce((public.m26_wearable_v49_my_coach_recipients_v1()#>>'{recipients,0,recorded}')::boolean,false),'Apple recipient grant does not inherit Android');
END
$test$;
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
SET ROLE authenticated;
SELECT gx_test.assert(jsonb_array_length(public.m26_wearable_v56_apple_coach_exercise_days_v1('30000000-0000-4000-8000-000000000001')->'days')=1,'authorized Coach weekly');
SELECT gx_test.expect_error($q$SELECT public.m26_wearable_v58_apple_coach_trends_v1('30000000-0000-4000-8000-000000000001',7)$q$,'42501','weekly does not authorize trends');
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SELECT gx_test.assert(public.m26_wearable_v58_set_apple_coach_trend_consent_v1('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',0,true)->>'shared'='true','independent trend consent');
SELECT gx_test.assert(public.m26_wearable_v56_set_apple_coach_consent_v1('10000000-0000-4000-8000-000000000002',NULL,1,false)->>'shared'='false','weekly withdrawal');
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
SET ROLE authenticated;
SELECT gx_test.assert(public.m26_wearable_v58_apple_coach_trends_v1('30000000-0000-4000-8000-000000000001',7)#>>'{periods,0,observedDays}'='1','trend survives independent withdrawal');
SELECT gx_test.expect_error($q$SELECT public.m26_wearable_v56_apple_coach_exercise_days_v1('30000000-0000-4000-8000-000000000001')$q$,'42501','weekly withdrawal denies read');
SELECT gx_test.expect_error($q$SELECT public.m26_wearable_v58_apple_coach_trends_v1('30000000-0000-4000-8000-000000000002',7)$q$,'42501','foreign client denied');
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000003');
SET ROLE authenticated;
SELECT gx_test.assert(jsonb_array_length(public.m26_wearable_v55_apple_owner_history_v1(NULL,NULL)->'exerciseEvidence')=0,'foreign owner history empty');
RESET ROLE;
ROLLBACK;
