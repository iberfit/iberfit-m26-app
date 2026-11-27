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
