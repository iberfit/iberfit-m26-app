BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $qa$ BEGIN IF public.iberfit_environment()->>'environment' IS DISTINCT FROM 'QA' OR public.iberfit_environment()->>'realDataAllowed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'GX333_QA_ONLY'; END IF; END $qa$;
DO $setup$
DECLARE a uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid(); org uuid:='00000000-0000-4000-8000-000000000140'; cred text:='GX333_'||replace(a::text,'-','');
BEGIN
 INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(a,'authenticated','authenticated','gx333-'||a||'@example.invalid',now(),now()),(c,'authenticated','authenticated','gx333-'||c||'@example.invalid',now(),now());
 INSERT INTO public.user_profiles(user_id,role,display_name) VALUES(a,'admin','GX333 synthetic admin'),(c,'coach','GX333 synthetic coach');
 INSERT INTO public.user_application_roles(user_id,role,active) VALUES(a,'admin',true),(c,'coach',true) ON CONFLICT DO NOTHING;
 INSERT INTO public.iberfit_organization_memberships(organization_id,user_id,status) VALUES(org,a,'active'),(org,c,'active');
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES(s,a,now(),now()),(s2,c,now(),now());
 INSERT INTO public.iberfit_webauthn_credentials_v1(user_id,credential_id,public_key_b64,rp_id) VALUES(a,cred,'c3ludGhldGlj','m26-canary.iberfit.cl'),(c,cred||'c','c3ludGhldGlj','m26-canary.iberfit.cl');
 INSERT INTO public.iberfit_privileged_assurance_v1(user_id,session_id,credential_id,verified_at,expires_at) VALUES(a,s,cred,now()-interval '1 minute',now()+interval '15 minutes'),(c,s2,cred||'c',now()-interval '1 minute',now()+interval '15 minutes');
 PERFORM set_config('gx333.fixture',jsonb_build_object('admin',a,'coach',c,'session',s,'coachSession',s2,'org',org)::text,true);
END $setup$;
SET LOCAL ROLE authenticated;
DO $first$
DECLARE f jsonb:=current_setting('gx333.fixture')::jsonb; cmd jsonb; r jsonb; op text:=gen_random_uuid()::text; email text:='gx333-'||gen_random_uuid()||'@example.invalid';
BEGIN
 PERFORM set_config('request.headers','{"origin":"https://m26-canary.iberfit.cl"}',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'admin','session_id',f->>'session','role','authenticated','aal','aal2')::text,true);
 cmd:=jsonb_build_object('type','ADMIN_CLIENTE_CREAR','operationId',op,'entityId',f->>'org','organizationId',f->>'org','baseRevision',0,'payload',jsonb_build_object('name','GX333 synthetic person','email',email,'phone','5550100','birthDate','1985-01-01','sexForNorms','female','modality','Online','frequency','3 sesiones por semana','objective','Mejora de fuerza y salud','entryIntent','training','initialAssessmentMode','deferred','accessMode','internal','coachUserId',f->>'coach','weeklyFrequency',3,'sessionDurationMinutes',45,'profile',jsonb_build_object('email',email,'birthDate','1985-01-01','sexForNorms','female','modality','online')));
 r:=public.iberfit_admin_execute_v14(cmd);
 IF r->>'kind' IS DISTINCT FROM 'ack' OR r->>'trainingServiceStatus' IS DISTINCT FROM 'active' OR r ? 'gx333CommandHash' THEN RAISE EXCEPTION 'GX333_CREATE_FAILED %',r->>'kind'; END IF;
 IF r->>'iriCreated' IS DISTINCT FROM 'false' OR r ? 'iri_id' THEN RAISE EXCEPTION 'GX350_DEFERRED_IRI_RECEIPT_INVALID'; END IF;
 PERFORM set_config('gx333.command',cmd::text,true);PERFORM set_config('gx333.client',r->>'clientId',true);
END $first$;
RESET ROLE;
DO $retire$
DECLARE f jsonb:=current_setting('gx333.fixture')::jsonb; c uuid:=current_setting('gx333.client')::uuid; counts jsonb;
BEGIN
 INSERT INTO public.iberfit_training_service_events_v1(organization_id,person_id,status,reason,changed_by,effective_at) VALUES((f->>'org')::uuid,c,'ended','GX333 synthetic retirement',(f->>'admin')::uuid,now());
 -- Stable tie-breaker: prior active event happened in this transaction; date ordering uses created_at and UUID too.
 UPDATE public.iberfit_training_service_events_v1 SET effective_at=now()-interval '1 second' WHERE person_id=c AND status='active';
 UPDATE public.iberfit_coach_client_assignments SET status='ended',ends_at=current_date,ended_by=(f->>'admin')::uuid WHERE client_id=c::text AND organization_id=(f->>'org')::uuid;
 PERFORM set_config('gx333.counts',jsonb_build_object('services',(SELECT count(*) FROM public.iberfit_training_service_events_v1 WHERE person_id=c),'assignments',(SELECT count(*) FROM public.iberfit_coach_client_assignments WHERE client_id=c::text),'conversation',(SELECT coalesce(sum(revision),0) FROM public.iberfit_conversation_threads WHERE client_id=c::text),'audit',(SELECT count(*) FROM public.iberfit_admin_audit_events WHERE entity_id=c::text))::text,true);
END $retire$;
SET LOCAL ROLE authenticated;
DO $replay$
DECLARE f jsonb:=current_setting('gx333.fixture')::jsonb; cmd jsonb:=current_setting('gx333.command')::jsonb; r jsonb; denied boolean;
BEGIN
 r:=public.iberfit_admin_execute_v14(cmd||jsonb_build_object('createdAt',clock_timestamp()));
 IF r->>'kind' IS DISTINCT FROM 'duplicate' OR r->>'recoveryOnly' IS DISTINCT FROM 'true' OR r->>'clientId' IS DISTINCT FROM current_setting('gx333.client') OR r ? 'trainingServiceStatus' OR r ? 'invitation' OR r ? 'coachAssignment' OR r ? 'gx333CommandHash' THEN RAISE EXCEPTION 'GX333_REPLAY_INVALID'; END IF;
 denied:=false;BEGIN PERFORM public.iberfit_admin_execute_v14(jsonb_set(cmd,'{payload,name}','"Different"'));EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM<>'GX333_OPERATION_PAYLOAD_CHANGED' THEN RAISE;END IF;denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'GX333_CHANGED_PAYLOAD_ACCEPTED';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'coach','session_id',f->>'coachSession','role','authenticated','aal','aal2')::text,true);
 denied:=false;BEGIN PERFORM public.iberfit_admin_execute_v14(cmd);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'GX333_COACH_REPLAY_ALLOWED';END IF;
END $replay$;
RESET ROLE;
DO $verify$
DECLARE f jsonb:=current_setting('gx333.fixture')::jsonb; c uuid:=current_setting('gx333.client')::uuid; previous jsonb:=current_setting('gx333.counts')::jsonb; actual jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM public.iri_assessments WHERE client_id=c) OR EXISTS(SELECT 1 FROM public.domain_entities_v26 WHERE client_id=c AND entity_type='iri') THEN RAISE EXCEPTION 'GX350_DEFERRED_IRI_RESIDUAL'; END IF;
 actual:=jsonb_build_object('services',(SELECT count(*) FROM public.iberfit_training_service_events_v1 WHERE person_id=c),'assignments',(SELECT count(*) FROM public.iberfit_coach_client_assignments WHERE client_id=c::text),'conversation',(SELECT coalesce(sum(revision),0) FROM public.iberfit_conversation_threads WHERE client_id=c::text),'audit',(SELECT count(*) FROM public.iberfit_admin_audit_events WHERE entity_id=c::text));
 IF actual IS DISTINCT FROM previous THEN RAISE EXCEPTION 'GX333_REPLAY_SIDE_EFFECT';END IF;
 IF private.iberfit_training_service_status_at_v1((f->>'org')::uuid,c,now()) IS DISTINCT FROM 'ended' THEN RAISE EXCEPTION 'GX333_REACTIVATED';END IF;
 IF EXISTS(SELECT 1 FROM public.iberfit_coach_client_assignments WHERE client_id=c::text AND status='active') THEN RAISE EXCEPTION 'GX333_ASSIGNMENT_REACTIVATED';END IF;
END $verify$;
SELECT 'GX333_ADMIN_CREATE_REPLAY_OK' AS result;
SET LOCAL ROLE authenticated;
DO $modes$
DECLARE f jsonb:=current_setting('gx333.fixture')::jsonb; cmd jsonb; r jsonb; email text:='gx350-iri-'||gen_random_uuid()||'@example.invalid'; iri_client uuid; deferred_client uuid; deferred_email text:='gx350-deferred-'||gen_random_uuid()||'@example.invalid';
BEGIN
 PERFORM set_config('request.headers','{"origin":"https://m26-canary.iberfit.cl"}',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'admin','session_id',f->>'session','role','authenticated','aal','aal2')::text,true);
 cmd:=jsonb_build_object('type','ADMIN_CLIENTE_CREAR','operationId',gen_random_uuid()::text,'entityId',f->>'org','organizationId',f->>'org','baseRevision',0,'payload',jsonb_build_object('name','GX350 IRI synthetic','email',email,'phone','5550100','birthDate','1985-01-01','sexForNorms','female','modality','Online','frequency','Evaluación puntual','objective','Evaluación inicial','entryIntent','iri','initialAssessmentMode','iri','accessMode','internal','profile',jsonb_build_object('email',email,'birthDate','1985-01-01','sexForNorms','female','modality','online')));
 r:=public.iberfit_admin_execute_v14(cmd);
 IF r->>'kind' IS DISTINCT FROM 'ack' OR r->>'trainingServiceStatus' IS DISTINCT FROM 'none' OR r->>'iriCreated' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'GX350_IRI_ONLY_ACK_INVALID'; END IF;
 iri_client:=(r->>'clientId')::uuid;
 PERFORM set_config('gx350.iri_client',iri_client::text,true);
 cmd:=cmd||jsonb_build_object('operationId',gen_random_uuid()::text,'payload',(cmd->'payload')||jsonb_build_object('entryIntent','training','initialAssessmentMode','deferred','frequency','3 sesiones por semana','coachUserId',f->>'coach','weeklyFrequency',3,'sessionDurationMinutes',45));
 r:=public.iberfit_admin_execute_v14(cmd);
 IF r->>'clientId' IS DISTINCT FROM iri_client::text OR r->>'trainingServiceStatus' IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'GX350_EXISTING_IRI_REUSE_INVALID'; END IF;
 cmd:=cmd||jsonb_build_object('operationId',gen_random_uuid()::text,'payload',(cmd->'payload')||jsonb_build_object('email',deferred_email,'profile',(cmd#>'{payload,profile}')||jsonb_build_object('email',deferred_email)));
 r:=public.iberfit_admin_execute_v14(cmd);
 IF r->>'kind' IS DISTINCT FROM 'ack' OR r->>'iriCreated' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'GX350_NEW_DEFERRED_INVALID'; END IF;
 deferred_client:=(r->>'clientId')::uuid;
 PERFORM set_config('gx350.deferred_client',deferred_client::text,true);
 cmd:=cmd||jsonb_build_object('operationId',gen_random_uuid()::text);
 r:=public.iberfit_admin_execute_v14(cmd);
 IF r->>'clientId' IS DISTINCT FROM deferred_client::text OR r->>'iriCreated' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'GX350_DEFERRED_REUSE_ID_INVALID'; END IF;
END $modes$;
RESET ROLE;
DO $verify_modes$
DECLARE i uuid:=current_setting('gx350.iri_client')::uuid; d uuid:=current_setting('gx350.deferred_client')::uuid;
BEGIN
 IF (SELECT count(*) FROM public.iri_assessments WHERE client_id=i)<>1 OR (SELECT count(*) FROM public.domain_entities_v26 WHERE client_id=i AND entity_type='iri')<>1 THEN RAISE EXCEPTION 'GX350_EXISTING_IRI_LOST'; END IF;
 IF EXISTS(SELECT 1 FROM public.iri_assessments WHERE client_id=d) OR EXISTS(SELECT 1 FROM public.domain_entities_v26 WHERE client_id=d AND entity_type='iri') THEN RAISE EXCEPTION 'GX350_DEFERRED_REUSE_RESIDUAL'; END IF;
END $verify_modes$;
SELECT 'GX350_ALL_IRI_MODES_OK' AS result;
ROLLBACK;
