-- Reverse only the exact read-boundary installation. Preserve data, refuse
-- rollback if any external material could become visible to another role.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $dependency$ BEGIN
 IF to_regprocedure('private.gx_document_pdf_snapshot_current_v1(uuid,uuid,bigint,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'GX_DOCUMENT_ROLLBACK_REQUIRES_PDF_BOUNDARY_ROLLBACK'; END IF;
END $dependency$;
DO $rollback$
DECLARE d text; old text; new text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.reports WHERE private.gx_document_has_external_v1(content))
 OR EXISTS(SELECT 1 FROM public.domain_entities_v26 WHERE entity_type='report' AND private.gx_document_has_external_v1(body))
 OR EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 WHERE private.gx_document_has_external_v1(source_snapshot))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_READ_ROLLBACK_REQUIRES_PROTECTION'; END IF;
 d:=pg_get_functiondef('public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)'::regprocedure);
 old:=$a$(CASE WHEN private.gx_document_has_external_v1(prepared->'sourceSnapshot') THEN private.gx_document_read_visible_v1(p_report_id,(prepared->>'clientId')::uuid,prepared->'sourceSnapshot') ELSE private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot') END)$a$;
 new:=$a$private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot')$a$;
 IF length(d)-length(replace(d,old,''))<>length(old) OR md5(replace(d,old,new)) IS DISTINCT FROM '61b5ec624800951afd06bfbe2e635490' THEN RAISE EXCEPTION 'GX_DOCUMENT_PREPARE_ROLLBACK_DRIFT'; END IF;
 EXECUTE replace(d,old,new);
 d:=pg_get_functiondef('public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)'::regprocedure);
 old:=$a$(CASE WHEN private.gx_document_has_external_v1(snapshot) THEN private.gx_document_read_visible_v1((result->>'reportId')::uuid,v_client,snapshot) ELSE private.iberfit_gx_report_body_current_v1(v_client,snapshot) END)$a$;
 new:=$a$private.iberfit_gx_report_body_current_v1(v_client,snapshot)$a$;
 IF length(d)-length(replace(d,old,''))<>length(old) OR md5(replace(d,old,new)) IS DISTINCT FROM 'fc964fabfd797e0a5cd1a8ed3aeb9aee' THEN RAISE EXCEPTION 'GX_DOCUMENT_AUTHORIZE_ROLLBACK_DRIFT'; END IF;
 EXECUTE replace(d,old,new);
END $rollback$;
DROP POLICY gx_document_canonical_read_v1 ON public.domain_entities_v26;
DROP POLICY gx_document_projected_read_v1 ON public.reports;
DROP FUNCTION private.gx_document_read_visible_v1(uuid,uuid,jsonb) RESTRICT;
DROP FUNCTION private.gx_document_read_scope_v1(uuid,uuid,jsonb,boolean) RESTRICT;
DROP FUNCTION private.gx_document_published_pair_current_v1(uuid,uuid,jsonb) RESTRICT;
DROP FUNCTION private.gx_document_approved_current_v1(uuid,uuid,jsonb) RESTRICT;
DROP FUNCTION private.gx_document_other_evidence_current_v1(uuid,jsonb) RESTRICT;
-- Retain the independent closed fence and its marker helper.
COMMIT;
