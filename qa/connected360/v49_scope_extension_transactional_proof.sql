-- QA-only synthetic E2E proof; must execute as a single SQL request.
-- Creates only transaction-local entities; the final ROLLBACK is mandatory.
BEGIN;
DO $proof$
DECLARE
 u uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); g uuid:=gen_random_uuid();
 v jsonb; n integer; saved text[];
BEGIN
 INSERT INTO auth.users(id,instance_id,aud,role,email)
 VALUES(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',u::text||'@v46-scope-proof.invalid');
 INSERT INTO public.clients(id,name,modality) VALUES(c,'Synthetic V46 consent QA','Online');
 INSERT INTO public.user_profiles(user_id,role,client_id,display_name)
 VALUES(u,'client',c,'Synthetic consent QA');
 INSERT INTO public.iberfit_organization_memberships(organization_id,user_id,status)
 VALUES('00000000-0000-4000-8000-000000000140',u,'active');
 INSERT INTO public.m26_wearable_authorization_sources_v3(
   owner_user_id,client_id,provider,grant_id,revocation_cursor,scopes)
 VALUES(u,c,'health_connect',g,0,ARRAY['steps']::text[]);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object(
   'sub',u::text,'role','authenticated','aal','aal2',
   'session_id',gen_random_uuid()::text)::text,true);
 v:=public.m26_wearable_v46_extend_scopes_explicit_qa_v1(g,0,ARRAY['exerciseSessions']);
 IF v->>'grantId'<>g::text OR v->>'alreadyAuthorized'<>'false'
   OR NOT (v->'scopes'?'steps') OR NOT (v->'scopes'?'exerciseSessions') THEN
   RAISE EXCEPTION 'V46_SCOPE_EXTENSION_FAILED:%',v;
 END IF;
 SELECT scopes INTO saved FROM public.m26_wearable_authorization_sources_v3
 WHERE owner_user_id=u AND client_id=c AND provider='health_connect';
 IF NOT (ARRAY['steps','exerciseSessions']::text[] <@ saved) THEN
   RAISE EXCEPTION 'V44_CONSENT_LOST';
 END IF;
 SELECT count(*) INTO n FROM public.m26_wearable_consents_v44
 WHERE actor_user_id=u AND client_id=c AND action='grant';
 IF n<>1 THEN RAISE EXCEPTION 'V46_CONSENT_AUDIT_NOT_WRITTEN'; END IF;
 v:=public.m26_wearable_v46_extend_scopes_explicit_qa_v1(g,0,ARRAY['exerciseSessions']);
 IF v->>'alreadyAuthorized'<>'true' THEN
   RAISE EXCEPTION 'NON_IDEMPOTENT_EXTENSION:%',v;
 END IF;
 SELECT count(*) INTO n FROM public.m26_wearable_consents_v44
 WHERE actor_user_id=u AND client_id=c AND action='grant';
 IF n<>1 THEN RAISE EXCEPTION 'DUPLICATE_CONSENT_AUDIT'; END IF;
 BEGIN
   PERFORM public.m26_wearable_v46_extend_scopes_explicit_qa_v1(
     gen_random_uuid(),0,ARRAY['generalHeartRate']);
   RAISE EXCEPTION 'STALE_GRANT_ACCEPTED';
 EXCEPTION WHEN sqlstate '42501' THEN
   IF sqlerrm<>'M26_V46_QA_SCOPE_GRANT_STALE' THEN
     RAISE EXCEPTION 'WRONG_STALE_REJECTION:%',sqlerrm;
   END IF;
 END;
 BEGIN
   PERFORM public.m26_wearable_v46_extend_scopes_explicit_qa_v1(
     g,0,ARRAY['restingHeartRate']);
   RAISE EXCEPTION 'UNRELATED_SCOPE_ACCEPTED';
 EXCEPTION WHEN sqlstate '42501' THEN
   IF sqlerrm<>'M26_V46_QA_SCOPE_EXTENSION_INVALID' THEN
     RAISE EXCEPTION 'WRONG_SCOPE_REJECTION:%',sqlerrm;
   END IF;
 END;
END;$proof$;
ROLLBACK;
