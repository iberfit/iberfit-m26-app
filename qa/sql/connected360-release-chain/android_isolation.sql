-- Disposable local PG17 only; actual V46/V47/V48/V49/V50/V52/V53/V54 APIs.
-- Identity and legacy connection/revocation tables remain synthetic adapters.
BEGIN;
UPDATE public.m26_wearable_v46_release_control_prod SET enabled=true,apple_exercise_enabled=true WHERE id;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
DO $test$
DECLARE
 g uuid;
 a uuid;
 p jsonb;
 v jsonb;
 r jsonb;
 d date := (now() AT TIME ZONE 'America/Santiago')::date-2;
 st timestamptz := (d::timestamp+interval '12 hours') AT TIME ZONE 'America/Santiago';
 en timestamptz := (d::timestamp+interval '13 hours') AT TIME ZONE 'America/Santiago';
 ac timestamptz := date_trunc('second',now());
BEGIN
 g:=(public.m26_wearable_v47_authorize_prod_v1(NULL,0,ARRAY['exerciseSessions'])->>'grantId')::uuid;
 PERFORM gx_test.assert(g IS NOT NULL,'explicit Android grant');
 a:=(public.m26_wearable_v53_authorize_apple_exercise_v1(NULL,0,true)->>'grantId')::uuid;
 PERFORM gx_test.assert(a IS NOT NULL AND a<>g,'independent Apple grant');
 r:=jsonb_build_object('observationKey',repeat('b',64),'sport','swimming','startedAt',st,'endedAt',en,'acquiredAt',ac,'distanceMeters',1000);
 p:=jsonb_build_object('schema','iberfit.connected360.v46.ingest.v1','exerciseEvidence',jsonb_build_array(r));
 PERFORM gx_test.assert(public.m26_wearable_v46_capabilities_prod_v1()->>'swimmingEnabled'='false','independent Android swimming switch');
 PERFORM gx_test.expect_error(format('SELECT public.m26_wearable_v46_import_prod_v1(%L,%L)',g,p),'42501','swimming blocked before activation');
 PERFORM gx_test.expect_error(format('SELECT public.m26_wearable_v46_import_prod_v1(%L,%L)',a,p),'42501','Apple grant cannot write Android');
 PERFORM set_config('gx_test.android_grant',g::text,true);
 PERFORM set_config('gx_test.apple_grant',a::text,true);
 PERFORM set_config('gx_test.android_payload',p::text,true);
 PERFORM set_config('gx_test.apple_payload',jsonb_build_object('schema','iberfit.connected360.v54.apple.ingest.v1','acquiredAt',to_char(ac AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'exerciseEvidence',jsonb_build_array(jsonb_build_object('observationKey',repeat('b',64),'sport','swimming','startedAt',to_char(st AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'endedAt',to_char(en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'activeSeconds',1800,'distanceMeters',1000)))::text,true);
END
$test$;
RESET ROLE;
UPDATE public.m26_wearable_v46_release_control_prod SET swimming_enabled=true WHERE id;
SET ROLE authenticated;
DO $test$
DECLARE
 g uuid:=current_setting('gx_test.android_grant')::uuid;
 a uuid:=current_setting('gx_test.apple_grant')::uuid;
 p jsonb:=current_setting('gx_test.android_payload')::jsonb;
 q jsonb;
 v jsonb;
BEGIN
 PERFORM gx_test.assert(public.m26_wearable_v46_capabilities_prod_v1()->>'swimmingEnabled'='true','swimming capability advertised');
 PERFORM gx_test.assert(public.m26_wearable_v46_import_prod_v1(g,p)->>'inserted'='1','Android swimming inserted');
 PERFORM gx_test.assert(public.m26_wearable_v46_import_prod_v1(g,p)->>'unchanged'='1','Android exact replay');
 q:=jsonb_set(jsonb_set(p,'{exerciseEvidence,0,sport}','"other"'),'{exerciseEvidence,0,acquiredAt}',to_jsonb((p#>>'{exerciseEvidence,0,acquiredAt}')::timestamptz+interval '1 second'));
 PERFORM gx_test.assert(public.m26_wearable_v46_import_prod_v1(g,q)->>'updated'='1','newer legacy observation accepted');
 v:=public.m26_wearable_v48_my_activity_page_prod_v1(NULL,NULL);
 PERFORM gx_test.assert(jsonb_array_length(v->'exerciseEvidence')=1 AND v#>>'{exerciseEvidence,0,sport}'='swimming' AND v#>>'{exerciseEvidence,0,authorizationState}'='current','legacy client cannot downgrade swimming');
 q:=jsonb_set(p,'{exerciseEvidence,0,avgBpm}','140');
 PERFORM gx_test.expect_error(format('SELECT public.m26_wearable_v46_import_prod_v1(%L,%L)',g,q),'42501','exercise scope cannot disclose heart rate');
 PERFORM gx_test.assert(public.m26_wearable_v54_import_apple_exercise_v1(a,current_setting('gx_test.apple_payload')::jsonb)->>'inserted'='1','same opaque key independent per provider');
 PERFORM gx_test.assert(public.m26_wearable_v49_set_coach_consent_v1('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',0,true)->>'shared'='true','Android Coach consent');
END
$test$;
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
SET ROLE authenticated;
SELECT gx_test.assert(public.m26_wearable_v49_coach_exercise_days_v1('30000000-0000-4000-8000-000000000001')#>>'{days,0,sports,0}'='swimming','Android Coach sees authorized discipline');
SELECT gx_test.expect_error($q$SELECT public.m26_wearable_v56_apple_coach_exercise_days_v1('30000000-0000-4000-8000-000000000001')$q$,'42501','Android consent does not share Apple');
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000003');
SET ROLE authenticated;
DO $test$
DECLARE g uuid;
BEGIN
 g:=(public.m26_wearable_v47_authorize_prod_v1(NULL,0,ARRAY['exerciseSessions'])->>'grantId')::uuid;
 PERFORM gx_test.assert(public.m26_wearable_v46_import_prod_v1(g,current_setting('gx_test.android_payload')::jsonb)->>'inserted'='1','same key independent for foreign owner');
END
$test$;
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
-- Invoke the actual V50 cleanup trigger on synthetic legacy delete/revoke events.
-- This does not simulate the complete hosted V44 RPC or its RLS/event chain.
INSERT INTO public.m26_wearable_consents_v44(actor_user_id,client_id,provider,action)
 VALUES('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','health_connect','delete');
INSERT INTO public.m26_wearable_revocation_events_v2(owner_user_id,client_id,provider)
 VALUES('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','health_connect');
SET ROLE authenticated;
SELECT gx_test.assert(jsonb_array_length(public.m26_wearable_v48_my_activity_page_prod_v1(NULL,NULL)->'exerciseEvidence')=0,'Android deletion removes only its history');
SELECT gx_test.assert(jsonb_array_length(public.m26_wearable_v55_apple_owner_history_v1(NULL,NULL)->'exerciseEvidence')=1,'Apple history survives Android deletion');
SELECT gx_test.expect_error(format('SELECT public.m26_wearable_v46_import_prod_v1(%L,%L)',current_setting('gx_test.android_grant'),current_setting('gx_test.android_payload')),'42501','revoked Android grant cannot recreate deleted row');
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
SET ROLE authenticated;
SELECT gx_test.expect_error($q$SELECT public.m26_wearable_v49_coach_exercise_days_v1('30000000-0000-4000-8000-000000000001')$q$,'42501','revocation stops Android Coach read');
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
INSERT INTO public.m26_wearable_revocation_events_v2(owner_user_id,client_id,provider)
 VALUES('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','*');
SET ROLE authenticated;
SELECT gx_test.assert(jsonb_array_length(public.m26_wearable_v55_apple_owner_history_v1(NULL,NULL)->'exerciseEvidence')=0,'explicit all-source erase removes Apple too');
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000003');
SET ROLE authenticated;
SELECT gx_test.assert(jsonb_array_length(public.m26_wearable_v48_my_activity_page_prod_v1(NULL,NULL)->'exerciseEvidence')=1,'foreign owner survives all-source erase');
RESET ROLE;
ROLLBACK;
\echo CONNECTED360_ANDROID_ISOLATION_AND_SELECTIVE_ERASURE_SUCCESS
