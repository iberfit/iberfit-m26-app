-- Transactional-only production macro smoke: synthetic QA A/B records.
-- Expects the production macro DDL earlier in the SAME transaction.
-- Runs after rollout switch temporarily enabled; no fixture persists.
UPDATE public.m26_wearable_v46_release_control_prod
  SET enabled=true,change_ticket='E2E_TRANSACTIONAL_QA_CERTIFICATION'
  WHERE id=true;
DO $cert$
DECLARE
 ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid();
 ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid();
 ga uuid; value jsonb; body jsonb; samples integer;
 start_day timestamptz:=(date_trunc('day',now() at time zone 'America/Santiago')
     at time zone 'America/Santiago');
 stamp timestamptz:=now()-interval '50 seconds';
BEGIN
 INSERT INTO auth.users(id,instance_id,aud,role,email) VALUES
 (ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',ua::text||'@v50.iberfit.qa.invalid'),
 (ub,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',ub::text||'@v50.iberfit.qa.invalid');
 INSERT INTO public.clients(id,name,modality) VALUES
 (ca,'V50 Synthetic QA A','Online'),(cb,'V50 Synthetic QA B','Online');
 INSERT INTO public.user_profiles(user_id,role,client_id,display_name) VALUES
 (ua,'client',ca,'Synthetic QA A'),(ub,'client',cb,'Synthetic QA B');
 INSERT INTO public.iberfit_organization_memberships(organization_id,user_id,status) VALUES
 ('00000000-0000-4000-8000-000000000140',ua,'active'),
 ('00000000-0000-4000-8000-000000000140',ub,'active');
 PERFORM set_config('request.jwt.claim.sub',ua::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object(
 'sub',ua::text,'role','authenticated','aal','aal2','session_id',gen_random_uuid()::text)::text,true);
 value:=public.m26_wearable_v46_authorize_prod_v1(
   NULL,0,ARRAY['exerciseSessions']::text[]);
 ga:=(value->>'grantId')::uuid;
 IF ga IS NULL OR value->>'alreadyAuthorized'<>'false' THEN
   RAISE EXCEPTION 'PRODUCTION_FIRST_GRANT_FAILED:%',value; END IF;
 value:=public.m26_wearable_v46_authorize_prod_v1(
   ga,0,ARRAY['generalHeartRate','exerciseSessions']::text[]);
 IF value->>'grantId'<>ga::text OR NOT(value->'scopes'?'generalHeartRate')
 THEN RAISE EXCEPTION 'PRODUCTION_SCOPE_EXTENSION_FAILED:%',value; END IF;
 value:=public.m26_wearable_v46_authorize_prod_v1(
   ga,0,ARRAY['generalHeartRate']::text[]);
 IF value->>'alreadyAuthorized'<>'true' THEN
   RAISE EXCEPTION 'PRODUCTION_REPLAY_NOT_IDEMPOTENT:%',value; END IF;
 body:=jsonb_build_object(
   'schema','iberfit.connected360.v46.ingest.v1',
   'heartRateDaily',jsonb_build_array(jsonb_build_object(
     'date',to_char(now() at time zone 'America/Santiago','YYYY-MM-DD'),
     'aggregationTimeZone','America/Santiago',
     'windowStartedAt',start_day,'windowEndedAt',stamp,
     'acquiredAt',stamp,'sampleCount',200,'minBpm',60,'maxBpm',165
   )),
   'exerciseEvidence',jsonb_build_array(jsonb_build_object(
     'observationKey',repeat('c',64),'sport','running',
     'startedAt',now()-interval '65 minutes',
     'endedAt',now()-interval '40 minutes',
     'acquiredAt',stamp,'distanceMeters',4500,'heartRateSamples',100,
     'minBpm',82,'maxBpm',170
   ))
 );
 value:=public.m26_wearable_v46_import_prod_v1(ga,body);
 IF (value->>'inserted')::int<>2 OR value->>'persisted'<>'true'
 OR value->>'automaticSyncCertified'<>'false' THEN
  RAISE EXCEPTION 'PRODUCTION_WRITE_FAILED:%',value; END IF;
 value:=public.m26_wearable_v46_import_prod_v1(ga,body);
 IF (value->>'unchanged')::int<>2 THEN
  RAISE EXCEPTION 'PRODUCTION_IDEMPOTENCE_FAILED:%',value; END IF;
 BEGIN
  PERFORM public.m26_wearable_v46_import_prod_v1(gen_random_uuid(),body);
  RAISE EXCEPTION 'CROSS_GRANT_ACCEPTED';
 EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
 PERFORM public.m26_wearable_delete_all_v44();
 SELECT count(*) INTO samples FROM public.m26_wearable_heart_rate_daily_v46
 WHERE owner_user_id=ua OR client_id=ca;
 IF samples<>0 THEN RAISE EXCEPTION 'PRODUCTION_HR_ERASE_FAILED'; END IF;
 SELECT count(*) INTO samples FROM public.m26_wearable_exercise_evidence_v46
 WHERE owner_user_id=ua OR client_id=ca;
 IF samples<>0 THEN RAISE EXCEPTION 'PRODUCTION_EXERCISE_ERASE_FAILED'; END IF;
 BEGIN
  PERFORM public.m26_wearable_v46_import_prod_v1(ga,body);
  RAISE EXCEPTION 'REVOKED_GRANT_REPLAY_ACCEPTED';
 EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END;
$cert$;
