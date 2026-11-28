-- Run against installed, unmodified GX routines. Calls as fixture DB owner
-- simulate internal invoker call sites; no public wrappers exist yet.
SELECT gx_test.assert(NOT has_table_privilege('authenticated','private.gx_connected360_document_request_v1','SELECT'),'no direct ledger read');
SELECT gx_test.assert(NOT has_function_privilege('authenticated','private.gx_document_request_create_v1(uuid,text,integer)','EXECUTE'),'no direct create');
SELECT gx_test.assert(NOT has_function_privilege('anon','private.gx_document_request_decide_v1(uuid,integer,uuid,text,text,text)','EXECUTE'),'no anonymous decide');
SELECT gx_test.assert(NOT has_function_privilege('service_role','private.gx_document_publication_lock_v1(uuid,uuid,jsonb)','EXECUTE'),'no direct service grant');
-- Prove an actual API role cannot call private routines, not just metadata.
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM private.gx_document_request_create_v1('70000000-0000-4000-8000-000000000001','health_connect',1);
 EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
 RAISE EXCEPTION 'GX_TEST_DIRECT_API_EXECUTION_GRANTED';
END $$;
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SELECT gx_test.assert((public.m26_wearable_v49_set_coach_consent_v1('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',0,true)->>'shared')::boolean,'real V49 consultation');
-- The V53 source helper is extracted unchanged; full V53/V56 release guard
-- and Apple consent issuance are NOT certified by this fixture.
SELECT gx_test.assert((private.m26_v53_apple_exercise_source_state('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',true)->>'authorized')::boolean,'real V53 source helper');
INSERT INTO private.m26_wearable_coach_consent_v49(owner_user_id,client_id,coach_user_id,assignment_id,assignment_revision,legacy_assignment_created_at,source_grant_id,source_cursor,consent_revision,provider,purpose)
SELECT g.owner_user_id,g.client_id,g.coach_user_id,g.assignment_id,g.assignment_revision,g.legacy_assignment_created_at,'60000000-0000-4000-8000-000000000002',0,1,'apple_health','coaching-apple-exercise-days-v1' FROM private.m26_wearable_coach_consent_v49 g WHERE provider='health_connect';
CREATE TABLE gx_test.scenarios(provider text PRIMARY KEY,request_id uuid,report_id uuid,client_id uuid,body jsonb,draft_sha text,evidence_sha text);
DO $$
DECLARE provider text; report uuid; r public.reports; q private.gx_connected360_document_request_v1; req jsonb; preview jsonb; receipt jsonb; body jsonb; op uuid;
BEGIN
 FOREACH provider IN ARRAY ARRAY['health_connect','apple_health'] LOOP
  report:=CASE provider WHEN 'health_connect' THEN '70000000-0000-4000-8000-000000000001'::uuid ELSE '70000000-0000-4000-8000-000000000002'::uuid END;
  PERFORM gx_test.actor('10000000-0000-4000-8000-000000000002',false);
  PERFORM gx_test.expect_error(format('SELECT private.gx_document_request_create_v1(%L,%L,1)',report,provider),'42501','no assurance');
  PERFORM gx_test.actor('10000000-0000-4000-8000-000000000002');
  req:=private.gx_document_request_create_v1(report,provider,1);
  PERFORM gx_test.assert(req->>'requestId'=private.gx_document_request_create_v1(report,provider,1)->>'requestId','idempotent request');
  SELECT * INTO STRICT q FROM private.gx_connected360_document_request_v1 WHERE id=(req->>'requestId')::uuid;
  SELECT * INTO STRICT r FROM public.reports WHERE id=report;
  body:=private.gx_document_expected_publication_body_v1(r,q.id,req->'evidence');
  PERFORM gx_test.assert((req->'evidence'->>'observedDays')::int=1,'deduplicated days');
  PERFORM gx_test.assert(private.gx_document_publication_lock_v1(report,q.client_id,body)=false,'consultation alone denied');
  PERFORM gx_test.actor('10000000-0000-4000-8000-000000000003');
  PERFORM gx_test.expect_error(format('SELECT private.gx_document_request_review_v1(%L,true)',q.id),'42501','cross-owner preview');
  PERFORM gx_test.expect_error(format('SELECT private.gx_document_request_decide_v1(%L,0,%L,%L,%L,%L)',q.id,gen_random_uuid(),'accepted',q.draft_sha256,q.evidence_sha256),'42501','cross-owner acceptance');
  PERFORM gx_test.actor('10000000-0000-4000-8000-000000000001');
  preview:=private.gx_document_request_review_v1(q.id,true);
  PERFORM gx_test.assert(preview->'preview'->'evidence'->>'evidenceSha256'=q.evidence_sha256,'exact owner preview');
  op:=gen_random_uuid(); receipt:=private.gx_document_request_decide_v1(q.id,0,op,'accepted',q.draft_sha256,q.evidence_sha256);
  PERFORM gx_test.assert(receipt->>'decision'='accepted' AND receipt->>'revision'='1','acceptance');
  PERFORM gx_test.assert((private.gx_document_request_decide_v1(q.id,0,op,'accepted',q.draft_sha256,q.evidence_sha256)->>'duplicate')::boolean,'acceptance replay');
  PERFORM gx_test.actor('10000000-0000-4000-8000-000000000002');
  PERFORM gx_test.assert(private.gx_document_publication_lock_v1(report,q.client_id,body),'exact accepted write');
  PERFORM gx_test.assert(NOT private.gx_document_publication_lock_v1(report,q.client_id,jsonb_set(body,'{summary}','"changed"')),'changed content denied');
  -- Synthetic transition only: canonical M44 approval/publication is not yet wired.
  UPDATE reports SET content=body||'{"status":"publicado","revision":3,"visibleToClient":true}'::jsonb,status='publicado',revision=3,audience='cliente' WHERE id=report;
  PERFORM gx_test.assert(private.gx_document_publication_current_v1(report,q.client_id,body),'current publication');
  INSERT INTO gx_test.scenarios VALUES(provider,q.id,report,q.client_id,body,q.draft_sha256,q.evidence_sha256);
 END LOOP;
END $$;
-- A true read-only transaction proves the STABLE proof does not need write locks.
BEGIN READ ONLY;
SELECT gx_test.assert(bool_and(private.gx_document_publication_current_v1(report_id,client_id,body)),'both providers read-only') FROM gx_test.scenarios;
COMMIT;
-- A correction invalidates exact evidence without changing total count.
BEGIN;
UPDATE m26_wearable_exercise_evidence_v46 SET sport='cycling' WHERE provider='apple_health';
SELECT gx_test.assert(NOT private.gx_document_publication_current_v1(report_id,client_id,body),'corrected activity invalidated') FROM gx_test.scenarios WHERE provider='apple_health';
ROLLBACK;
BEGIN;
UPDATE client_assignments SET active=false;
SELECT gx_test.assert(bool_and(NOT private.gx_document_publication_current_v1(report_id,client_id,body)),'assignment retired') FROM gx_test.scenarios;
ROLLBACK;
BEGIN;
INSERT INTO m26_wearable_revocation_events_v2 VALUES(1,'10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','apple_health');
SELECT gx_test.assert(NOT private.gx_document_publication_current_v1(report_id,client_id,body),'source generation retired') FROM gx_test.scenarios WHERE provider='apple_health';
ROLLBACK;
