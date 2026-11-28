-- Synthetic approved/read boundary exercise. Run after lifecycle.sql and
-- before races. No hosted schema or policy assumptions; roll back all fixtures.
BEGIN;
ALTER TABLE public.domain_entities_v26 ADD COLUMN entity_id uuid, ADD COLUMN client_id uuid, ADD COLUMN status text, ADD COLUMN revision integer;
CREATE TYPE public.publication_status AS ENUM ('borrador','aprobado','publicado','retirado','revisión');
ALTER TABLE public.reports ALTER COLUMN status TYPE public.publication_status USING status::public.publication_status;
ALTER TABLE public.reports ADD COLUMN summary text, ADD COLUMN published_at timestamptz, ADD COLUMN approved_at timestamptz;
-- Exact M44 private-body and sanitized projection triggers, no hosted changes.
\ir private_read_m44_generated.sql
-- This fixture has no professional follow-up tables. Exercise the real
-- document-side boundary with a deliberately strict synthetic legacy adapter.
CREATE FUNCTION private.iberfit_gx_report_body_current_v1(uuid,jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements($2->'evidence') e WHERE e->>'source' LIKE 'gx-professional:%' OR e->>'source' LIKE 'connected360:%')
$$;
-- Exact functions and restrictive policies extracted from the candidate by
-- the harness in this same transaction (no activation of the release script).
\ir private_read_generated.sql
-- The full hosted M26 command registry and its entire persistence chain are
-- deliberately NOT installed in this minimal fixture. This synthetic adapter
-- exercises the actual transaction wrapper, receipt checks and rollback with
-- the exact M44 projection triggers. Hosted bus certification remains separate.
CREATE TABLE public.command_receipts_v26(operation_id uuid PRIMARY KEY,command_type text,entity_type text,entity_id uuid,client_id uuid,actor_user_id uuid,base_revision bigint,remote_revision bigint);
CREATE FUNCTION public.iberfit_execute_command_v26(p_command jsonb) RETURNS jsonb LANGUAGE plpgsql AS $bus$
DECLARE op uuid:=(p_command->>'operationId')::uuid; report uuid:=(p_command->>'entityId')::uuid;
 client uuid:=(p_command->>'clientId')::uuid; rev bigint:=(p_command->>'baseRevision')::bigint;
 target text; fault text:=current_setting('gx_test.bus_fault',true);
BEGIN
 IF p_command->>'type'='INFORME_APROBAR' THEN target:='aprobado';
 ELSIF p_command->>'type'='INFORME_PUBLICAR' THEN target:='publicado';
 ELSE RAISE EXCEPTION 'unexpected synthetic command'; END IF;
 UPDATE public.domain_entities_v26 SET status=target,revision=rev+1,
 body=body||coalesce(p_command->'payload'->'patch','{}'::jsonb)||jsonb_build_object('status',target,'revision',rev+1)
 WHERE entity_type='report' AND entity_id=report AND client_id=client AND revision=rev;
 IF NOT FOUND THEN RAISE EXCEPTION 'synthetic revision missing'; END IF;
 INSERT INTO public.command_receipts_v26 VALUES(op,p_command->>'type','report',report,client,
 CASE WHEN fault='receipt' THEN '10000000-0000-4000-8000-000000000003'::uuid ELSE auth.uid() END,rev,rev+1);
 IF fault='projection' THEN UPDATE public.reports SET revision=revision+1 WHERE id=report; END IF;
 RETURN jsonb_build_object('kind',CASE WHEN fault='ack' THEN 'conflict' ELSE 'ack' END,'operationId',op,'remoteRevision',rev+1,'duplicate',false);
END $bus$;
\ir private_read_transition_generated.sql
-- Restore original exact draft material from the scenario, dropping only the
-- server-generated last evidence row (the synthetic lifecycle already accepted it).
UPDATE public.reports r SET status='borrador',audience='coach',revision=1,
 content=jsonb_set(s.body,'{evidence}',(s.body->'evidence')-(-1)) FROM gx_test.scenarios s WHERE r.id=s.report_id;
INSERT INTO public.domain_entities_v26(entity_type,entity_id,client_id,status,revision,body)
 SELECT 'report',id,client_id,status::text,revision,content FROM public.reports WHERE id IN (SELECT report_id FROM gx_test.scenarios);
SELECT gx_test.assert(bool_and(private.gx_document_draft_sha_v1(r)=s.draft_sha),'exact original draft restored') FROM public.reports r JOIN gx_test.scenarios s ON r.id=s.report_id;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
DO $tests$
DECLARE s gx_test.scenarios%rowtype; fault text; op uuid;
BEGIN
 SELECT * INTO s FROM gx_test.scenarios WHERE provider='health_connect';
 FOREACH fault IN ARRAY ARRAY['ack','receipt','projection'] LOOP
  PERFORM set_config('gx_test.bus_fault',fault,true);
  op:=gen_random_uuid();
  PERFORM gx_test.expect_error(format('SELECT private.gx_document_apply_transition_v1(%L,%L,1,%L,%L,false)',s.report_id,s.request_id,op,'approve'),'40001','invalid transition rollback');
  PERFORM gx_test.assert(NOT EXISTS(SELECT 1 FROM public.command_receipts_v26 WHERE operation_id=op),'invalid transition receipt rolled back');
  PERFORM gx_test.assert(EXISTS(SELECT 1 FROM public.reports WHERE id=s.report_id AND status='borrador' AND revision=1),'invalid transition projection rolled back');
  PERFORM gx_test.assert(EXISTS(SELECT 1 FROM public.domain_entities_v26 WHERE entity_id=s.report_id AND status='borrador' AND revision=1),'invalid transition canonical rolled back');
 END LOOP;
 PERFORM set_config('gx_test.bus_fault','',true);
END $tests$;
SELECT gx_test.assert(private.gx_document_apply_transition_v1(report_id,request_id,1,gen_random_uuid(),'approve',false)->>'status'='aprobado','transaction approval with exact receipt and readback') FROM gx_test.scenarios;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_entities_v26 ENABLE ROW LEVEL SECURITY;
CREATE POLICY gx_fixture_permissive_reports ON public.reports FOR SELECT TO authenticated USING (true);
CREATE POLICY gx_fixture_permissive_canonical ON public.domain_entities_v26 FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.reports,public.domain_entities_v26 TO authenticated;
GRANT USAGE ON SCHEMA gx_test,auth TO authenticated;
-- Only synthetic identity adapter needs these permissions.
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON gx_test.scenarios TO authenticated;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
SET ROLE authenticated;
SELECT gx_test.assert((SELECT count(*) FROM public.reports WHERE status='aprobado')=2,'Coach approved projection');
SELECT gx_test.assert((SELECT count(*) FROM public.domain_entities_v26 WHERE status='aprobado')=2,'Coach approved canonical');
SELECT gx_test.assert(bool_and(NOT private.gx_document_read_visible_v1(report_id,client_id,body)),'Coach cannot use PDF before publication') FROM gx_test.scenarios;
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SELECT gx_test.assert((SELECT count(*) FROM public.reports WHERE status='aprobado')=0,'owner cannot read approved private projection');
SELECT gx_test.assert((SELECT count(*) FROM public.domain_entities_v26 WHERE status='aprobado')=0,'owner cannot read approved private canonical');
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000003');
SET ROLE authenticated;
SELECT gx_test.assert((SELECT count(*) FROM public.reports WHERE status='aprobado')=0,'foreign client denied');
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
SAVEPOINT drift;
UPDATE public.reports SET revision=revision+1 WHERE status='aprobado';
SET ROLE authenticated;
SELECT gx_test.assert((SELECT count(*) FROM public.reports WHERE status='aprobado')=0,'canonical drift denies projection');
RESET ROLE;
ROLLBACK TO drift;
SAVEPOINT mixed_role;
INSERT INTO public.user_application_roles VALUES ('10000000-0000-4000-8000-000000000002','admin',true);
SET ROLE authenticated;
SELECT gx_test.assert((SELECT count(*) FROM public.reports WHERE status='aprobado')=0,'mixed Admin denied');
RESET ROLE;
ROLLBACK TO mixed_role;
SAVEPOINT revoke_source;
UPDATE public.m26_wearable_connections_v44 SET sync_enabled=false;
SET ROLE authenticated;
SELECT gx_test.assert((SELECT count(*) FROM public.reports WHERE status='aprobado')=0,'source revocation denies private read');
RESET ROLE;
ROLLBACK TO revoke_source;
UPDATE public.domain_entities_v26 SET body=body||'{"coachComment":"PRIVATE SYNTHETIC"}'::jsonb WHERE status='aprobado';
SELECT gx_test.expect_error(format('SELECT private.gx_document_apply_transition_v1(%L,%L,2,%L,%L,false)',report_id,request_id,gen_random_uuid(),'publish'),'42501','publish requires explicit preview') FROM gx_test.scenarios;
SELECT gx_test.assert(private.gx_document_apply_transition_v1(report_id,request_id,2,gen_random_uuid(),'publish',true)->>'status'='publicado','transaction publication with exact receipt and readback') FROM gx_test.scenarios;
SELECT gx_test.assert((SELECT bool_and(content->'visibleToClient'='true'::jsonb AND NOT (content?'coachComment')) FROM public.reports WHERE status='publicado'),'M44 projection strips private fields');
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SELECT gx_test.assert((SELECT count(*) FROM public.reports WHERE status='publicado')=2,'owner sees published material');
SELECT gx_test.assert((SELECT count(*) FROM public.domain_entities_v26 WHERE status='publicado')=0,'owner never sees private canonical material');
SELECT gx_test.assert(bool_and(private.gx_document_read_visible_v1(report_id,client_id,body)),'owner published PDF permitted by document boundary') FROM gx_test.scenarios;
RESET ROLE;
SAVEPOINT published_drift;
UPDATE public.reports SET revision=revision+1 WHERE status='publicado';
SET ROLE authenticated;
SELECT gx_test.assert((SELECT count(*) FROM public.reports WHERE status='publicado')=0,'published revision drift denies projection');
RESET ROLE;
ROLLBACK TO published_drift;
SAVEPOINT private_projection;
UPDATE public.reports SET content=content||'{"coachComment":"PRIVATE SYNTHETIC"}'::jsonb WHERE status='publicado';
SET ROLE authenticated;
SELECT gx_test.assert((SELECT count(*) FROM public.reports WHERE status='publicado')=0,'unexpected private fields deny projection');
RESET ROLE;
ROLLBACK TO private_projection;
SELECT gx_test.assert((SELECT count(*) FROM private.gx_connected360_document_decision_v1)=2,'fixture leaves decisions intact');
ROLLBACK;
\echo GX_DOCUMENT_PRIVATE_READ_PG17_OK
\echo GX_DOCUMENT_TRANSITION_ADAPTER_PG17_OK
