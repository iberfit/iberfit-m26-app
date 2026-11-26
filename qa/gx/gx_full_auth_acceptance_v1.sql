BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $qa$ BEGIN IF public.iberfit_environment()->>'environment' IS DISTINCT FROM 'QA' THEN RAISE EXCEPTION 'GX330_QA_ONLY'; END IF; END $qa$;
-- QA only, always within enclosing BEGIN / ROLLBACK. New synthetic identities;
-- claim and assurance rows simulated in SQL, not a real WebAuthn handshake.
DO $setup$
DECLARE coach uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); person uuid:=gen_random_uuid(); client uuid:=gen_random_uuid(); other_client uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); outsider_session uuid:=gen_random_uuid(); client_session uuid:=gen_random_uuid(); org uuid:='00000000-0000-4000-8000-000000000140'; cred text:='GX324_'||replace(coach::text,'-',''); outsider_cred text:='GX324_'||replace(outsider::text,'-','');
BEGIN
 INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES(coach,'authenticated','authenticated','gx324-'||coach||'@example.invalid',now(),now()),(outsider,'authenticated','authenticated','gx324-'||outsider||'@example.invalid',now(),now()),(person,'authenticated','authenticated','gx324-'||person||'@example.invalid',now(),now());
 INSERT INTO public.clients(id,name,modality) VALUES(client,'GX324 synthetic client','Online'),(other_client,'GX324 synthetic other','Online');
 INSERT INTO public.user_profiles(user_id,role,client_id,display_name) VALUES(coach,'coach',NULL,'GX324 synthetic coach'),(outsider,'coach',NULL,'GX324 synthetic unassigned'),(person,'client',client,'GX324 synthetic user');
 INSERT INTO public.iberfit_organization_memberships(organization_id,user_id,status) VALUES(org,coach,'active'),(org,outsider,'active'),(org,person,'active');
 INSERT INTO public.client_assignments(client_id,coach_user_id,active) VALUES(client,coach,true),(other_client,outsider,true);
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES(session,coach,now(),now()),(outsider_session,outsider,now(),now()),(client_session,person,now(),now());
 INSERT INTO public.iberfit_webauthn_credentials_v1(user_id,credential_id,public_key_b64,rp_id) VALUES(coach,cred,'c3ludGhldGlj','m26-canary.iberfit.cl'),(outsider,outsider_cred,'c3ludGhldGlj','m26-canary.iberfit.cl');
 INSERT INTO public.iberfit_privileged_assurance_v1(user_id,session_id,credential_id,verified_at,expires_at) VALUES(coach,session,cred,now()-interval '1 minute',now()+interval '15 minutes'),(outsider,outsider_session,outsider_cred,now()-interval '1 minute',now()+interval '15 minutes');
 PERFORM set_config('gx324.fixture',jsonb_build_object('coach',coach,'outsider',outsider,'person',person,'client',client,'otherClient',other_client,'session',session,'outsiderSession',outsider_session,'clientSession',client_session)::text,true);
END $setup$;
-- QA only. Requires the synthetic identities in GX326_AUTH_FIXTURE.sql.
-- Execute inside an enclosing rollback-only acceptance transaction.
DO $gx330_scope_setup$
DECLARE f jsonb:=current_setting('gx324.fixture')::jsonb; c uuid:=(f->>'client')::uuid; coach uuid:=(f->>'coach')::uuid; org uuid:='00000000-0000-4000-8000-000000000140'; solo uuid:=gen_random_uuid();
BEGIN
 IF public.iberfit_environment()->>'environment' IS DISTINCT FROM 'QA' THEN RAISE EXCEPTION 'GX330_QA_ONLY'; END IF;
 INSERT INTO public.clients(id,name,modality) VALUES(solo,'GX330 synthetic Solo IRI','Online');
 INSERT INTO public.client_assignments(client_id,coach_user_id,active) VALUES(solo,coach,true);
 INSERT INTO public.iberfit_training_service_events_v1(organization_id,person_id,status,reason,changed_by,effective_at) VALUES(org,c,'active','GX330 synthetic active',coach,now()-interval '4 days');
 PERFORM set_config('gx330.solo',solo::text,true);
END $gx330_scope_setup$;
SET LOCAL ROLE authenticated;
DO $gx330_scope_test$
DECLARE f jsonb:=current_setting('gx324.fixture')::jsonb; c uuid:=(f->>'client')::uuid; solo uuid:=current_setting('gx330.solo')::uuid; rejected boolean:=false;
BEGIN
 PERFORM set_config('request.headers','{"origin":"https://m26-canary.iberfit.cl"}',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'coach','session_id',f->>'session','role','authenticated','aal','aal2')::text,true);
 IF public.iberfit_can_access_client_v26(solo) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX330_SOLO_FIXTURE_NOT_ASSIGNED'; END IF;
 IF private.iberfit_gx_followup_can_coach_v1(c) IS DISTINCT FROM true OR private.iberfit_gx_followup_can_coach_v1(solo) IS DISTINCT FROM false THEN RAISE EXCEPTION 'GX330_ACTIVE_SOLO_SCOPE'; END IF;
 BEGIN PERFORM public.iberfit_gx_publication_list_v1(solo,NULL,10); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'GX330_SOLO_PUBLICATION_LEAK'; END IF;
 IF has_function_privilege('authenticated','private.iberfit_training_service_status_at_v1(uuid,uuid,timestamptz)'::regprocedure,'EXECUTE') OR has_function_privilege('anon','private.iberfit_gx_followup_can_coach_v1(uuid)'::regprocedure,'EXECUTE') THEN RAISE EXCEPTION 'GX330_SERVICE_ACL'; END IF;
END $gx330_scope_test$;
RESET ROLE;
DO $gx330_paused$ DECLARE f jsonb:=current_setting('gx324.fixture')::jsonb; BEGIN INSERT INTO public.iberfit_training_service_events_v1(organization_id,person_id,status,reason,changed_by,effective_at) VALUES('00000000-0000-4000-8000-000000000140',(f->>'client')::uuid,'paused','GX330 synthetic paused',(f->>'coach')::uuid,now()-interval '3 days'); END $gx330_paused$;
SET LOCAL ROLE authenticated;
DO $gx330_paused_test$ BEGIN IF private.iberfit_gx_followup_can_coach_v1((current_setting('gx324.fixture')::jsonb->>'client')::uuid) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX330_PAUSED_SCOPE'; END IF; END $gx330_paused_test$;
RESET ROLE;
DO $gx330_ended$ DECLARE f jsonb:=current_setting('gx324.fixture')::jsonb; BEGIN INSERT INTO public.iberfit_training_service_events_v1(organization_id,person_id,status,reason,changed_by,effective_at) VALUES('00000000-0000-4000-8000-000000000140',(f->>'client')::uuid,'ended','GX330 synthetic ended',(f->>'coach')::uuid,now()-interval '2 days'); END $gx330_ended$;
SET LOCAL ROLE authenticated;
DO $gx330_ended_test$ BEGIN IF private.iberfit_gx_followup_can_coach_v1((current_setting('gx324.fixture')::jsonb->>'client')::uuid) IS DISTINCT FROM false THEN RAISE EXCEPTION 'GX330_ENDED_SCOPE'; END IF; END $gx330_ended_test$;
RESET ROLE;
DO $gx330_reactivate$ DECLARE f jsonb:=current_setting('gx324.fixture')::jsonb; BEGIN INSERT INTO public.iberfit_training_service_events_v1(organization_id,person_id,status,reason,changed_by,effective_at) VALUES('00000000-0000-4000-8000-000000000140',(f->>'client')::uuid,'active','GX330 synthetic reactivation',(f->>'coach')::uuid,now()-interval '1 day'); END $gx330_reactivate$;
SET LOCAL ROLE authenticated;
DO $gx330_reactivate_test$ BEGIN IF private.iberfit_gx_followup_can_coach_v1((current_setting('gx324.fixture')::jsonb->>'client')::uuid) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX330_REACTIVATION_SCOPE'; END IF; END $gx330_reactivate_test$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $accept$
DECLARE f jsonb:=current_setting('gx324.fixture')::jsonb; client uuid:=(f->>'client')::uuid; other_client uuid:=(f->>'otherClient')::uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); pub uuid:=gen_random_uuid(); pub2 uuid:=gen_random_uuid(); op uuid:=gen_random_uuid(); withdraw_op uuid:=gen_random_uuid(); republish_op uuid:=gen_random_uuid(); void_op uuid:=gen_random_uuid(); protocol jsonb:='{"schemaVersion":1,"testId":"chair-stand-30s","field":"repetitions","side":"not-applicable","variant":"standard-arms-crossed","protocolVersion":"iri-protocols-2026.10-v3","configuration":"Silla 45 cm","adaptationReason":"","setup":{"chairHeightCm":45}}'; first jsonb; last jsonb; pair jsonb; r jsonb; rejected boolean; stamps jsonb; op2 uuid:=gen_random_uuid(); n integer:=0; proof jsonb; refs jsonb; proof_start date; proof_end date; canonical jsonb; canonical_body jsonb; final_pair jsonb; final_pub uuid:=gen_random_uuid(); final_op uuid:=gen_random_uuid();
BEGIN
 PERFORM set_config('request.headers','{"origin":"https://m26-canary.iberfit.cl"}',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'coach','session_id',f->>'session','role','authenticated','aal','aal2')::text,true);
 IF private.iberfit_gx_followup_can_coach_v1(client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX324_FIXTURE_ASSURANCE'; END IF;
 first:=public.iberfit_gx_followup_record_v1(a,client,now()-interval '3 days',0,'reps',protocol); last:=public.iberfit_gx_followup_record_v1(b,client,now()-interval '2 days',4,'reps',protocol);
 PERFORM public.iberfit_gx_followup_record_v1(c,client,now()-interval '1 day',5,'reps',protocol);
 IF (first->>'value')::numeric<>0 OR last->>'id'<>b::text THEN RAISE EXCEPTION 'GX324_FIXTURE_RECORD'; END IF;n:=n+1;
 pair:=jsonb_build_object('previous',jsonb_build_object('id',a,'revision',1,'measuredMicros',trunc(extract(epoch FROM (now()-interval '3 days'))*1000000)::bigint::text,'value',0,'unit','reps','protocol',protocol),'current',jsonb_build_object('id',b,'revision',1,'measuredMicros',trunc(extract(epoch FROM (now()-interval '2 days'))*1000000)::bigint::text,'value',4,'unit','reps','protocol',protocol));
 r:=public.iberfit_gx_publication_find_v1(client,a,b); IF r IS NOT NULL THEN RAISE EXCEPTION 'GX324_FIXTURE_UNEXPECTED_PAIR'; END IF;
 r:=public.iberfit_gx_publication_write_v1(client,pub,op,0,'published',pair);IF r->>'status'<>'published' OR (r->>'revision')::int<>1 OR r->'pair' IS DISTINCT FROM pair THEN RAISE EXCEPTION 'GX324_FIXTURE_PUBLISH'; END IF;n:=n+1;
 IF public.iberfit_gx_publication_write_v1(client,pub,op,0,'published',pair) IS DISTINCT FROM r THEN RAISE EXCEPTION 'GX324_FIXTURE_REPLAY'; END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_publication_write_v1(client,pub2,op2,0,'published',pair);EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'GX_PUBLICATION_PAIR_EXISTS' THEN RAISE; END IF;rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX324_FIXTURE_DUPLICATE';END IF;n:=n+1;
 r:=public.iberfit_gx_publication_find_v1(client,a,b);IF r->'publication'->>'id'<>pub::text OR r->'publication'->>'status'<>'published' THEN RAISE EXCEPTION 'GX324_FIXTURE_FIND'; END IF;n:=n+1;
 r:=public.iberfit_gx_publication_list_v1(client,NULL,1);IF jsonb_array_length(r->'items')<>1 OR (r->'items'->0) ? 'pair' OR r->'items'->0->>'id'<>pub::text OR r->'nextCursor'<>'null'::jsonb THEN RAISE EXCEPTION 'GX324_FIXTURE_LIST';END IF;n:=n+1;
 r:=public.iberfit_gx_publication_recover_v1(client,pub,op,0,'published',jsonb_set(jsonb_set(pair,'{previous,value}','0.000000'::jsonb),'{current,protocol,setup,chairHeightCm}','45.0000'::jsonb));IF r->>'currentStatus'<>'published' THEN RAISE EXCEPTION 'GX324_FIXTURE_DECIMAL_CANONICAL';END IF;n:=n+1;
 proof_start:=((now()-interval '2 days') AT TIME ZONE 'America/Santiago')::date; proof_end:=proof_start;
 refs:=jsonb_build_array(jsonb_build_object('publicationId',pub,'publicationRevision',1));
 proof:=public.iberfit_gx_report_proof_v1(client,proof_start,proof_end,refs);
 IF proof->>'clientId' IS DISTINCT FROM client::text OR proof->>'schemaVersion' IS DISTINCT FROM '1' OR jsonb_array_length(proof->'items')<>1 OR proof->'items'->0 IS DISTINCT FROM jsonb_build_object('publicationId',pub,'publicationRevision',1,'testId','chair-stand-30s','field','repetitions','side','not-applicable','periodStart',((now()-interval '3 days') AT TIME ZONE 'America/Santiago')::date,'periodEnd',proof_end,'previous',0,'value',4,'unit','reps') THEN RAISE EXCEPTION 'GX325_PROOF_EXACT';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_proof_v1(client,proof_start,proof_end,refs||refs);EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM<>'GX_REPORT_PROOF_DUPLICATE' THEN RAISE;END IF;rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX325_PROOF_DUPLICATE';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_proof_v1(client,proof_start+1,proof_end+1,refs);EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM<>'GX_REPORT_PROOF_PERIOD' THEN RAISE;END IF;rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX325_PROOF_PERIOD';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_proof_v1(client,proof_start,proof_end,jsonb_build_array(jsonb_build_object('publicationId',pub,'publicationRevision',1,'value',123)));EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX325_PROOF_FORGED';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_proof_v1(client,proof_start,proof_end,jsonb_build_array(jsonb_build_object('publicationId',pub,'publicationRevision',2)));EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'GX_REPORT_PROOF_STALE' THEN RAISE;END IF;rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX325_PROOF_REVISION';END IF;n:=n+1;
 canonical:=public.iberfit_gx_report_evidence_v1(client,proof_start,proof_end,refs);
 IF canonical->'items' IS DISTINCT FROM proof->'items' OR jsonb_array_length(canonical->'evidence')<>1 OR canonical->'evidence'->0 IS DISTINCT FROM jsonb_build_object('label','Levantarse de la silla en 30 s','text',((now()-interval '3 days') AT TIME ZONE 'America/Santiago')::date::text||': 0 rep · '||proof_end::text||': 4 rep. Comparación profesional revisada; no acredita por sí sola un logro.','source','gx-professional:'||pub::text||':1','quality','revisada') THEN RAISE EXCEPTION 'GX326_EVIDENCE_EXACT';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM private.iberfit_gx_report_pair_core_v1(client,a,b);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_CORE_EXPOSED';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM private.iberfit_gx_report_body_current_v1(client,jsonb_build_object('evidence',canonical->'evidence'));EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_VALIDATOR_EXPOSED';END IF;n:=n+1;
 r:=public.iberfit_gx_publication_write_v1(client,pub,withdraw_op,1,'withdrawn',NULL);IF r->>'status'<>'withdrawn' OR r->'pair'<>'null'::jsonb OR (r->>'revision')::int<>2 THEN RAISE EXCEPTION 'GX324_FIXTURE_WITHDRAW';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_proof_v1(client,proof_start,proof_end,refs);EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX325_PROOF_WITHDRAWN';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_evidence_v1(client,proof_start,proof_end,refs);EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_EVIDENCE_WITHDRAWN';END IF;n:=n+1;
 r:=public.iberfit_gx_publication_recover_v1(client,pub,op,0,'published',pair);IF r->>'currentStatus'<>'withdrawn' OR (r->>'currentRevision')::int<>2 OR r->>'operationId'<>op::text THEN RAISE EXCEPTION 'GX324_FIXTURE_RECOVERY';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_publication_recover_v1(client,pub,op,0,'published',jsonb_set(pair,'{current,value}','999'));EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX324_FIXTURE_FALSE_RECOVERY';END IF;n:=n+1;
 r:=public.iberfit_gx_publication_write_v1(client,pub,republish_op,2,'published',pair);IF (r->>'revision')::int<>3 OR r->>'status'<>'published' THEN RAISE EXCEPTION 'GX324_FIXTURE_REPUBLISH';END IF;n:=n+1;
 refs:=jsonb_build_array(jsonb_build_object('publicationId',pub,'publicationRevision',3));proof:=public.iberfit_gx_report_proof_v1(client,proof_start,proof_end,refs);IF proof->'items'->0->>'publicationRevision' IS DISTINCT FROM '3' THEN RAISE EXCEPTION 'GX325_PROOF_REPUBLISH';END IF;n:=n+1;
 PERFORM public.iberfit_gx_followup_void_v1(void_op,client,b,'measurement_error');r:=public.iberfit_gx_publication_read_v1(client,pub);IF r->>'status'<>'invalidated' OR r->'pair'<>'null'::jsonb THEN RAISE EXCEPTION 'GX324_FIXTURE_INVALIDATION';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_proof_v1(client,proof_start,proof_end,refs);EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX325_PROOF_INVALIDATED';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_evidence_v1(client,proof_start,proof_end,refs);EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_EVIDENCE_INVALIDATED';END IF;n:=n+1;
 -- A separate still-valid pair uses A and C. B's invalidation must not invalidate A or C.
 final_pair:=jsonb_set(jsonb_set(jsonb_set(pair,'{current,id}',to_jsonb(c::text)),'{current,measuredMicros}',to_jsonb(trunc(extract(epoch FROM (now()-interval '1 day'))*1000000)::bigint::text)),'{current,value}','5'::jsonb);
 r:=public.iberfit_gx_publication_write_v1(client,final_pub,final_op,0,'published',final_pair);
 proof_start:=((now()-interval '1 day') AT TIME ZONE 'America/Santiago')::date;proof_end:=proof_start;
 refs:=jsonb_build_array(jsonb_build_object('publicationId',final_pub,'publicationRevision',1));canonical:=public.iberfit_gx_report_evidence_v1(client,proof_start,proof_end,refs);
 canonical_body:=jsonb_build_object('reportType','monthly','periodStart',proof_start,'periodEnd',proof_end,'evidence',canonical->'evidence');
 PERFORM set_config('gx326.body',canonical_body::text,true);PERFORM set_config('gx326.old_pub',pub::text,true);n:=n+1;
 r:=public.iberfit_gx_publication_recover_v1(client,pub,republish_op,2,'published',pair);IF r->>'currentStatus'<>'invalidated' THEN RAISE EXCEPTION 'GX324_FIXTURE_INVALID_RECOVERY';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_publication_read_v1(other_client,pub);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX324_FIXTURE_FOREIGN_CLIENT';END IF;n:=n+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'outsider','session_id',f->>'outsiderSession','role','authenticated','aal','aal2')::text,true);
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_proof_v1(client,proof_start,proof_end,refs);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX325_PROOF_UNASSIGNED';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_evidence_v1(client,proof_start,proof_end,refs);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_EVIDENCE_UNASSIGNED';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_publication_list_v1(client,NULL,10);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX324_FIXTURE_UNASSIGNED';END IF;n:=n+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'person','session_id',f->>'clientSession','role','authenticated','aal','aal1')::text,true);
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_proof_v1(client,proof_start,proof_end,refs);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX325_PROOF_CLIENT_PRIVATE';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_evidence_v1(client,proof_start,proof_end,refs);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_EVIDENCE_CLIENT_PRIVATE';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_publication_read_v1(client,pub);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX324_FIXTURE_CLIENT_PRIVATE';END IF;
 IF EXISTS(SELECT 1 FROM public.m26_client_measurements_v43 m WHERE m.client_id=client AND m.metric='gx_followup_v1') THEN RAISE EXCEPTION 'GX324_FIXTURE_SOURCE_EXPOSED';END IF;n:=n+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'coach','session_id',gen_random_uuid(),'role','authenticated','aal','aal2')::text,true);
 rejected:=false;BEGIN PERFORM public.iberfit_gx_report_proof_v1(client,proof_start,proof_end,refs);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX325_PROOF_STALE_SESSION';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_gx_publication_read_v1(client,pub);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX324_FIXTURE_STALE_SESSION';END IF;n:=n+1;
 IF n<>36 THEN RAISE EXCEPTION 'GX324_FIXTURE_COUNT %',n;END IF;
 PERFORM set_config('gx324.auth_result','GX326_AUTH_OK: 36 assertions, synthetic claims and assurance, real SQL/RLS',true);
END $accept$;
RESET ROLE;
DO $trusted$
DECLARE body jsonb:=current_setting('gx326.body')::jsonb; c uuid:=(current_setting('gx324.fixture')::jsonb->>'client')::uuid; other_c uuid:=(current_setting('gx324.fixture')::jsonb->>'otherClient')::uuid; oldpub text:=current_setting('gx326.old_pub'); n int:=0;
BEGIN
 IF private.iberfit_gx_report_body_current_v1(c,body) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX326_VALID_BODY';END IF;n:=n+1;
 IF private.iberfit_gx_report_body_current_v1(other_c,body) IS DISTINCT FROM false THEN RAISE EXCEPTION 'GX326_OTHER_BODY';END IF;n:=n+1;
 IF private.iberfit_gx_report_body_current_v1(c,jsonb_set(body,'{evidence,0,text}','"texto inventado"')) IS DISTINCT FROM false THEN RAISE EXCEPTION 'GX326_FORGED_BODY';END IF;n:=n+1;
 IF private.iberfit_gx_report_body_current_v1(c,jsonb_set(body,'{evidence,0,source}',to_jsonb('gx-professional:'||oldpub||':3'))) IS DISTINCT FROM false THEN RAISE EXCEPTION 'GX326_INVALID_BODY';END IF;n:=n+1;
 IF private.iberfit_gx_report_body_current_v1(c,jsonb_set(body,'{evidence}',(body->'evidence')||(body->'evidence'))) IS DISTINCT FROM false THEN RAISE EXCEPTION 'GX326_DUPLICATE_BODY';END IF;n:=n+1;
 IF private.iberfit_gx_report_body_current_v1(c,jsonb_set(body,'{reportType}','"iri"')) IS DISTINCT FROM false THEN RAISE EXCEPTION 'GX326_IRI_BODY';END IF;n:=n+1;
 IF private.iberfit_gx_report_body_current_v1(c,'{"evidence":[{"label":"Histórica","text":"Texto histórico","source":"sessionExecutions"}]}'::jsonb) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX326_HISTORIC_BODY';END IF;n:=n+1;
 IF private.iberfit_gx_report_body_current_v1(c,jsonb_set(body,'{periodStart}','"2026-02-30"')) IS DISTINCT FROM false THEN RAISE EXCEPTION 'GX326_BAD_DATE';END IF;n:=n+1;
 PERFORM set_config('gx326.result','GX326_AUTH_OK: 36 authenticated + '||n||' trusted assertions, real SQL/RLS',true);
END $trusted$;


-- QA only, appended after GX326_AUTH_FIXTURE, before outer ROLLBACK.
DO $setupguards$
DECLARE f jsonb:=current_setting('gx324.fixture')::jsonb; c uuid:=(f->>'client')::uuid; actor uuid:=(f->>'coach')::uuid; rid uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid(); iid uuid:=gen_random_uuid(); legacy_iid uuid:=gen_random_uuid(); body jsonb:=current_setting('gx326.body')::jsonb; legacy_body jsonb; snapshot jsonb; rejected boolean; n int:=0;
BEGIN
 body:=body||jsonb_build_object('visibleToClient',true,'summary','Comparación revisada','conclusions','Observación registrada','recommendations','Mantener seguimiento');
 legacy_body:=jsonb_set(body,'{evidence}',jsonb_build_array(jsonb_build_object('label','Histórica','text','Evidencia histórica','source','sessionExecutions','quality','registrada')));
 INSERT INTO public.m26_canary_clients_v26(client_id,active,enabled_by,enabled_at,reason) VALUES(c,true,actor,now(),'GX326 synthetic');
 INSERT INTO public.reports(id,client_id,title,report_type,audience,content,status,revision,created_by) VALUES(rid,c,'GX326 sintético','monthly','cliente',body,'publicado',2,actor),(legacy,c,'GX326 histórico','monthly','cliente',legacy_body,'publicado',2,actor);n:=n+1;
 rejected:=false;BEGIN INSERT INTO public.reports(id,client_id,title,report_type,audience,content,status,revision,created_by) VALUES(gen_random_uuid(),c,'GX326 falso','monthly','cliente',jsonb_set(body,'{evidence,0,text}','"falso"'),'publicado',2,actor);EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'GX_REPORT_EVIDENCE_STALE_OR_FORGED' THEN RAISE;END IF;rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_FORGED_INSERT';END IF;n:=n+1;
 rejected:=false;BEGIN UPDATE public.reports SET content=legacy_body WHERE id=rid;EXCEPTION WHEN check_violation THEN IF SQLERRM<>'GX_REPORT_LINEAGE_REMOVAL' THEN RAISE;END IF;rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_DROPPED_LINEAGE';END IF;n:=n+1;
 snapshot:=public.iberfit_m44_private_issued_source_v1(rid);
 IF snapshot->'evidence' IS DISTINCT FROM body->'evidence' THEN RAISE EXCEPTION 'GX326_PROJECTION';END IF;n:=n+1;
 -- Synthetic ledger rows test authorization only. No file is uploaded or downloaded.
 INSERT INTO public.iberfit_evolution_report_issuances_v1(id,report_id,client_id,version,report_revision,issue_request_id,template_version,engine_version,source_snapshot,source_sha256,artifact_path,artifact_sha256,artifact_size_bytes,issued_by) VALUES(iid,rid,c,1,2,gen_random_uuid(),'gx326-test','gx326-test',snapshot,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),c||'/'||rid||'/'||iid||'/report.pdf',repeat('a',64),1024,actor),(legacy_iid,legacy,c,1,2,gen_random_uuid(),'gx326-test','gx326-test',public.iberfit_m44_private_issued_source_v1(legacy),repeat('b',64),c||'/'||legacy||'/'||legacy_iid||'/report.pdf',repeat('c',64),1024,actor);n:=n+1;
 rejected:=false;BEGIN INSERT INTO public.iberfit_evolution_report_issuances_v1(id,report_id,client_id,version,report_revision,issue_request_id,template_version,engine_version,source_snapshot,source_sha256,artifact_path,artifact_sha256,artifact_size_bytes,issued_by) VALUES(gen_random_uuid(),rid,c,2,3,gen_random_uuid(),'gx326-test','gx326-test',jsonb_set(snapshot,'{evidence,0,text}','"falso"'),repeat('d',64),c||'/'||rid||'/'||gen_random_uuid()||'/report.pdf',repeat('e',64),1024,actor);EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'GX_REPORT_EVIDENCE_STALE_OR_FORGED' THEN RAISE;END IF;rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_FORGED_ISSUE';END IF;n:=n+1;
 PERFORM set_config('gx326.guard_ids',jsonb_build_object('report',rid,'legacy',legacy,'issue',iid,'legacyIssue',legacy_iid,'n',n)::text,true);
END $setupguards$;
SET LOCAL ROLE authenticated;
DO $guardaccess$
DECLARE f jsonb:=current_setting('gx324.fixture')::jsonb; ids jsonb:=current_setting('gx326.guard_ids')::jsonb; c uuid:=(f->>'client')::uuid; rid uuid:=(ids->>'report')::uuid; legacy uuid:=(ids->>'legacy')::uuid; iid uuid:=(ids->>'issue')::uuid; legacy_iid uuid:=(ids->>'legacyIssue')::uuid; pub uuid:=split_part(current_setting('gx326.body')::jsonb->'evidence'->0->>'source',':',2)::uuid; rejected boolean; r jsonb; n int:=(ids->>'n')::int;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'coach','session_id',f->>'session','role','authenticated','aal','aal2')::text,true);
 r:=public.iberfit_m44_prepare_evolution_report_issue_v1(rid);IF r->>'reportId' IS DISTINCT FROM rid::text THEN RAISE EXCEPTION 'GX326_PREPARE';END IF;n:=n+1;
 r:=public.iberfit_m44_authorize_evolution_report_pdf_v1(iid);IF r->>'issuanceId' IS DISTINCT FROM iid::text THEN RAISE EXCEPTION 'GX326_COACH_AUTH';END IF;n:=n+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'person','session_id',f->>'clientSession','role','authenticated','aal','aal1')::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.reports WHERE id=rid) OR NOT EXISTS(SELECT 1 FROM public.reports WHERE id=legacy) THEN RAISE EXCEPTION 'GX326_VISIBLE_CURRENT';END IF;n:=n+1;
 r:=public.iberfit_m44_authorize_evolution_report_pdf_v1(iid);IF r->>'issuanceId' IS DISTINCT FROM iid::text THEN RAISE EXCEPTION 'GX326_CLIENT_AUTH';END IF;n:=n+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'outsider','session_id',f->>'outsiderSession','role','authenticated','aal','aal2')::text,true);
 IF EXISTS(SELECT 1 FROM public.reports WHERE id=rid) THEN RAISE EXCEPTION 'GX326_OTHER_CLIENT_VISIBLE';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_m44_authorize_evolution_report_pdf_v1(iid);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_OTHER_COACH_PDF';END IF;n:=n+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'coach','session_id',f->>'session','role','authenticated','aal','aal2')::text,true);
 PERFORM public.iberfit_gx_publication_write_v1(c,pub,gen_random_uuid(),1,'withdrawn',NULL);
 rejected:=false;BEGIN PERFORM public.iberfit_m44_prepare_evolution_report_issue_v1(rid);EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'M44_PDF_SOURCE_EVIDENCE_STALE' THEN RAISE;END IF;rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_PREPARE_STALE';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_m44_authorize_evolution_report_pdf_v1(iid);EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'M44_PDF_SOURCE_EVIDENCE_STALE' THEN RAISE;END IF;rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_COACH_PDF_STALE';END IF;n:=n+1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'person','session_id',f->>'clientSession','role','authenticated','aal','aal1')::text,true);
 IF EXISTS(SELECT 1 FROM public.reports WHERE id=rid) OR NOT EXISTS(SELECT 1 FROM public.reports WHERE id=legacy) THEN RAISE EXCEPTION 'GX326_STALE_CLIENT_VISIBLE';END IF;n:=n+1;
 rejected:=false;BEGIN PERFORM public.iberfit_m44_authorize_evolution_report_pdf_v1(iid);EXCEPTION WHEN serialization_failure THEN IF SQLERRM<>'M44_PDF_SOURCE_EVIDENCE_STALE' THEN RAISE;END IF;rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_CLIENT_PDF_STALE';END IF;n:=n+1;
 r:=public.iberfit_m44_authorize_evolution_report_pdf_v1(legacy_iid);IF r->>'issuanceId' IS DISTINCT FROM legacy_iid::text THEN RAISE EXCEPTION 'GX326_LEGACY_PDF';END IF;n:=n+1;
 PERFORM set_config('gx326.guards_result','GX326_GUARDS_OK: '||n||' report, RLS and M44 authorization assertions',true);
END $guardaccess$;
RESET ROLE;
DO $guardfinal$
DECLARE ids jsonb:=current_setting('gx326.guard_ids')::jsonb; rid uuid:=(ids->>'report')::uuid; iid uuid:=(ids->>'issue')::uuid; rejected boolean:=false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.reports WHERE id=rid) OR NOT EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 WHERE id=iid) THEN RAISE EXCEPTION 'GX326_LEDGER_LOST';END IF;
 BEGIN UPDATE public.reports SET title='GX326 no reemitir' WHERE id=rid;EXCEPTION WHEN serialization_failure THEN rejected:=true;END;IF NOT rejected THEN RAISE EXCEPTION 'GX326_STALE_WRITE';END IF;
 UPDATE public.reports SET status='retirado',audience='coach' WHERE id=rid;
END $guardfinal$;
SELECT current_setting('gx326.result')||'; '||current_setting('gx326.guards_result')||'; 3 ledger/retirement assertions; GX330 service scope OK (active, Solo IRI, paused, ended, reactivation, ACL)' AS result;

ROLLBACK;
