-- Fresh separate synthetic database inside the disposable PG17 cluster.
-- Exact M44 finalizer migration; synthetic professional proof adapter only.
CREATE SCHEMA private;
CREATE SCHEMA gx_test;
CREATE SCHEMA storage;
CREATE TABLE public.domain_entities_v26(entity_type text,body jsonb);
CREATE TABLE public.user_profiles(user_id uuid PRIMARY KEY,role text);
CREATE TABLE public.client_assignments(client_id uuid,coach_user_id uuid,active boolean);
CREATE TABLE public.reports(id uuid PRIMARY KEY,client_id uuid,revision bigint,status text,audience text,content jsonb);
CREATE TABLE public.iberfit_evolution_report_issuances_v1(id uuid PRIMARY KEY,report_id uuid,client_id uuid,version integer,report_revision bigint,issue_request_id uuid,template_version text,engine_version text,source_snapshot jsonb,source_sha256 text,artifact_path text,artifact_sha256 text,artifact_size_bytes bigint,issued_by uuid,status text DEFAULT 'issued',issued_at timestamptz DEFAULT now());
CREATE TABLE public.domain_events_v26(operation_id uuid,command_type text,entity_type text,entity_id uuid,client_id uuid,actor_user_id uuid,actor_role text,phase text,from_status text,to_status text,base_revision bigint,remote_revision bigint,details jsonb);
CREATE TABLE storage.objects(bucket_id text,name text);
CREATE FUNCTION public.iberfit_m44_private_issued_source_v1(p_report uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT content FROM public.reports WHERE id=p_report $$;
CREATE FUNCTION private.iberfit_gx_report_body_has_refs_v1(b jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'evidence') e WHERE e->>'source' LIKE 'gx-professional:%') $$;
CREATE FUNCTION private.iberfit_gx_report_body_current_v1(c uuid,b jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('gx_test.professional_current',true)='yes' $$;
-- The migration has a prior-existence check; this placeholder is replaced by its exact definition.
CREATE FUNCTION public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
-- PostgreSQL permits adding names to previously unnamed input parameters.
\ir ../../../supabase/migrations/20261015214000_m44_pdf_privileged_invoker_guard_v1.sql
\ir ../../../supabase/release-procedures/gx_connected360_document_closed_fence_v1.sql
\ir ../../../supabase/release-procedures/gx_connected360_document_finalize_closed_v1.sql
CREATE FUNCTION gx_test.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_TEST_FAILED: %',label; END IF; END $$;
INSERT INTO user_profiles VALUES ('10000000-0000-4000-8000-000000000002','coach');
INSERT INTO client_assignments VALUES ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',true);
INSERT INTO reports SELECT id,'30000000-0000-4000-8000-000000000001',1,'publicado','cliente',jsonb_build_object('evidence',jsonb_build_array(jsonb_build_object('source',source))) FROM (VALUES ('70000000-0000-4000-8000-000000000001'::uuid,'gx-professional:synthetic'),('70000000-0000-4000-8000-000000000002'::uuid,'sessionExecutions')) r(id,source);
INSERT INTO storage.objects SELECT 'iberfit-evolution-issued-reports',client_id::text||'/'||id::text||'/80000000-0000-4000-8000-00000000000'||right(id::text,1)||'/report.pdf' FROM reports;
-- Test adapter has no privileges over tables; inputs/hash built from fixed fixture constants.
CREATE FUNCTION gx_test.finalize(p_report uuid,p_request uuid,p_source text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$ SELECT public.iberfit_m44_finalize_evolution_report_issue_v1(p_report,p_request,1,encode(sha256(convert_to(jsonb_build_object('evidence',jsonb_build_array(jsonb_build_object('source',p_source)))::text,'UTF8')),'hex'),'30000000-0000-4000-8000-000000000001/'||p_report::text||'/'||p_request::text||'/report.pdf',repeat('a',64),2048,'template-v1','engine-v1','10000000-0000-4000-8000-000000000002') $$;
GRANT USAGE ON SCHEMA gx_test TO service_role;
SET ROLE service_role;
SET gx_test.professional_current='yes';
SELECT gx_test.assert(gx_test.finalize('70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','gx-professional:synthetic')->>'kind'='issued','current professional evidence issues');
SELECT gx_test.assert(gx_test.finalize('70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','gx-professional:synthetic')->>'kind'='already-issued','current professional evidence retries');
SET gx_test.professional_current='no';
DO $test$ BEGIN
 BEGIN
  PERFORM gx_test.finalize('70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','gx-professional:synthetic');
  RAISE EXCEPTION 'GX_STALE_RETRY_UNEXPECTEDLY_ALLOWED';
 EXCEPTION WHEN serialization_failure THEN
  IF SQLERRM<>'M44_PDF_SOURCE_EVIDENCE_STALE' THEN RAISE; END IF;
 END;
END $test$;
SELECT gx_test.assert(gx_test.finalize('70000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002','sessionExecutions')->>'kind'='issued','ordinary evidence unaffected');
SELECT gx_test.assert(gx_test.finalize('70000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002','sessionExecutions')->>'kind'='already-issued','ordinary retry unaffected');
RESET ROLE;
SELECT gx_test.assert((SELECT count(*) FROM iberfit_evolution_report_issuances_v1)=2 AND (SELECT count(*) FROM domain_events_v26)=2,'no duplicated ledger/events');
\ir ../../../supabase/release-procedures/gx_connected360_document_finalize_closed_v1.rollback.sql
SELECT gx_test.assert(md5(pg_get_functiondef('public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)'::regprocedure))='e7956fc7a0bb237082f10743e6492f36','exact original finalizer restored');
SELECT gx_test.assert((SELECT count(*) FROM pg_constraint WHERE conname IN ('gx_document_canonical_closed_v1','gx_document_projected_closed_v1','gx_document_issuance_closed_v1') AND convalidated)=3,'fence retained');
\echo GX_DOCUMENT_FINALIZE_CLOSED_PG17_OK
