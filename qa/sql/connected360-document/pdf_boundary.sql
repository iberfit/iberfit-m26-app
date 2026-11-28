-- Synthetic exact source helper and PDF boundary. Run after storage fixture.
ALTER TABLE public.clients ADD COLUMN name text;
UPDATE public.clients SET name='Synthetic owner';
\ir pdf_boundary_generated.sql
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
SELECT gx_test.assert(private.gx_document_pdf_user_current_v1(r.id,r.client_id,r.revision,public.iberfit_m44_private_issued_source_v1(r.id)),'current original Coach PDF') FROM public.reports r JOIN gx_test.scenarios s ON s.report_id=r.id WHERE s.provider='apple_health';
SELECT gx_test.assert(NOT private.gx_document_pdf_user_current_v1(r.id,r.client_id,r.revision-1,public.iberfit_m44_private_issued_source_v1(r.id)),'stale issuance revision denied') FROM public.reports r JOIN gx_test.scenarios s ON s.report_id=r.id WHERE s.provider='apple_health';
SELECT gx_test.assert(NOT private.gx_document_pdf_user_current_v1(r.id,r.client_id,r.revision,public.iberfit_m44_private_issued_source_v1(r.id)||'{"clientName":"Forged"}'::jsonb),'forged snapshot denied') FROM public.reports r JOIN gx_test.scenarios s ON s.report_id=r.id WHERE s.provider='apple_health';
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SELECT gx_test.assert(private.gx_document_pdf_user_current_v1(r.id,r.client_id,r.revision,public.iberfit_m44_private_issued_source_v1(r.id)),'owner current PDF') FROM public.reports r JOIN gx_test.scenarios s ON s.report_id=r.id WHERE s.provider='apple_health';
SELECT gx_test.actor('10000000-0000-4000-8000-000000000003');
SELECT gx_test.assert(NOT private.gx_document_pdf_user_current_v1(r.id,r.client_id,r.revision,public.iberfit_m44_private_issued_source_v1(r.id)),'foreign owner PDF denied') FROM public.reports r JOIN gx_test.scenarios s ON s.report_id=r.id WHERE s.provider='apple_health';
-- Only fixture exposes a definer adapter for the synthetic service role.
CREATE FUNCTION gx_test.pdf_service_probe(actor_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $test$
 SELECT private.gx_document_pdf_service_lock_v1(r.id,r.client_id,r.revision,public.iberfit_m44_private_issued_source_v1(r.id),actor_id)
 FROM public.reports r JOIN gx_test.scenarios s ON s.report_id=r.id WHERE s.provider='apple_health'
$test$;
REVOKE ALL ON FUNCTION gx_test.pdf_service_probe(uuid) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA gx_test TO service_role;
GRANT EXECUTE ON FUNCTION gx_test.pdf_service_probe(uuid) TO service_role;
SELECT gx_test.assert(NOT gx_test.pdf_service_probe('10000000-0000-4000-8000-000000000002'),'non-service finalization denied');
SET ROLE service_role;
SELECT gx_test.assert(gx_test.pdf_service_probe('10000000-0000-4000-8000-000000000002'),'service original Coach proof');
SELECT gx_test.assert(NOT gx_test.pdf_service_probe('10000000-0000-4000-8000-000000000003'),'service foreign actor denied');
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SELECT gx_test.assert(private.gx_document_request_decide_v1(request_id,1,gen_random_uuid(),'withdrawn',draft_sha,evidence_sha)->>'decision'='withdrawn','withdraw before PDF replay') FROM gx_test.scenarios WHERE provider='apple_health';
SELECT gx_test.assert(NOT private.gx_document_pdf_user_current_v1(r.id,r.client_id,r.revision,public.iberfit_m44_private_issued_source_v1(r.id)),'withdrawn owner PDF denied') FROM public.reports r JOIN gx_test.scenarios s ON s.report_id=r.id WHERE s.provider='apple_health';
SET ROLE service_role;
SELECT gx_test.assert(NOT gx_test.pdf_service_probe('10000000-0000-4000-8000-000000000002'),'withdrawn service replay denied');
RESET ROLE;
\echo GX_DOCUMENT_PDF_BOUNDARY_PG17_OK
