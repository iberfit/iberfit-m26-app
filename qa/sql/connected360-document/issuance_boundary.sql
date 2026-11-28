-- Disposable fixture: exercise new issuance trigger with exact source helper.
-- Actual M44 finalizer and its hosted wrapper preflight remain separate.
ALTER TABLE public.iberfit_evolution_report_issuances_v1 ADD COLUMN id uuid, ADD COLUMN report_id uuid, ADD COLUMN client_id uuid, ADD COLUMN report_revision bigint, ADD COLUMN issue_request_id uuid, ADD COLUMN source_sha256 text, ADD COLUMN artifact_path text, ADD COLUMN issued_by uuid, ADD COLUMN status text, ADD COLUMN withdrawn_by uuid, ADD COLUMN withdrawn_at timestamptz, ADD COLUMN withdrawn_reason text;
\ir issuance_boundary_generated.sql
-- Source fixture remains published and accepted until the later withdrawal.
CREATE FUNCTION gx_test.issue_candidate(actor uuid,forge boolean DEFAULT false) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $test$
 INSERT INTO public.iberfit_evolution_report_issuances_v1(id,report_id,client_id,report_revision,issue_request_id,source_snapshot,source_sha256,artifact_path,issued_by,status)
 SELECT gen_random_uuid(),r.id,r.client_id,r.revision,op.id,src.body,CASE WHEN forge THEN repeat('0',64) ELSE encode(sha256(convert_to(src.body::text,'UTF8')),'hex') END,r.client_id::text||'/'||r.id::text||'/'||op.id::text||'/report.pdf',actor,'issued'
 FROM public.reports r JOIN gx_test.scenarios s ON s.report_id=r.id CROSS JOIN LATERAL (SELECT gen_random_uuid() AS id) op CROSS JOIN LATERAL (SELECT public.iberfit_m44_private_issued_source_v1(r.id) AS body) src WHERE s.provider='apple_health'
$test$;
REVOKE ALL ON FUNCTION gx_test.issue_candidate(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION gx_test.issue_candidate(uuid,boolean) TO service_role;
SELECT gx_test.expect_error('SELECT gx_test.issue_candidate(''10000000-0000-4000-8000-000000000002'')','42501','nonservice issue denied');
SET ROLE service_role;
DO $test$ BEGIN
 BEGIN PERFORM gx_test.issue_candidate('10000000-0000-4000-8000-000000000002',true); RAISE EXCEPTION 'forged issue unexpectedly accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM gx_test.issue_candidate('10000000-0000-4000-8000-000000000003'); RAISE EXCEPTION 'foreign issue unexpectedly accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM gx_test.issue_candidate('10000000-0000-4000-8000-000000000002');
END $test$;
RESET ROLE;
SELECT gx_test.assert((SELECT count(*) FROM public.iberfit_evolution_report_issuances_v1 WHERE status='issued')=1,'exact service issue recorded');
SELECT gx_test.expect_error('UPDATE public.iberfit_evolution_report_issuances_v1 SET source_sha256=repeat(''0'',64) WHERE status=''issued''','42501','immutable source hash');
SELECT gx_test.expect_error('UPDATE public.iberfit_evolution_report_issuances_v1 SET source_snapshot=''{}'' WHERE status=''issued''','42501','immutable source lineage');
