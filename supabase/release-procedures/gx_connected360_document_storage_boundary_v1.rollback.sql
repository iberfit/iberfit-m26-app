-- Only undo a closed, empty stage; never erase history or reopen writes.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $dependency$ BEGIN
 IF to_regprocedure('private.gx_document_pdf_snapshot_current_v1(uuid,uuid,bigint,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'GX_DOCUMENT_ROLLBACK_REQUIRES_PDF_BOUNDARY_ROLLBACK'; END IF;
END $dependency$;
DO $rollback$
DECLARE d text; entry constant text:=$patch$INSERT INTO private.gx_document_write_permit_v1(transaction_id,report_id,client_id,request_id,actor_id,operation_id,target_status,revision,material_sha256)
 VALUES(pg_current_xact_id(),p_report,q.client_id,q.id,actor,p_operation,target_status,next_revision,q.publication_sha256);
 result:=private.gx_document_bus_internal_v1(command);$patch$;
 finish constant text:=$patch$DELETE FROM private.gx_document_write_permit_v1 WHERE transaction_id=pg_current_xact_id() AND operation_id=p_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_STORAGE_PERMIT_MISSING' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('schema','iberfit.connected360.document-transition.v1'$patch$;
BEGIN
 IF (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR EXISTS(SELECT 1 FROM private.gx_document_write_permit_v1)
 OR EXISTS(SELECT 1 FROM public.reports WHERE private.gx_document_has_external_v1(content))
 OR EXISTS(SELECT 1 FROM public.domain_entities_v26 WHERE entity_type='report' AND private.gx_document_has_external_v1(body))
 OR EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 WHERE private.gx_document_has_external_v1(source_snapshot))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_STORAGE_ROLLBACK_REQUIRES_CLOSED_EMPTY_FENCE'; END IF;
 d:=pg_get_functiondef('private.gx_document_apply_transition_v1(uuid,uuid,integer,uuid,text,boolean)'::regprocedure);
 IF length(d)-length(replace(d,entry,''))<>length(entry) OR length(d)-length(replace(d,finish,''))<>length(finish) THEN RAISE EXCEPTION 'GX_DOCUMENT_STORAGE_TRANSITION_ROLLBACK_DRIFT'; END IF;
 EXECUTE replace(replace(d,entry,'result:=private.gx_document_bus_internal_v1(command);'),finish,'RETURN jsonb_build_object(''schema'',''iberfit.connected360.document-transition.v1''');
END $rollback$;
DROP TRIGGER zz_gx_document_projected_write_v1 ON public.reports;
DROP TRIGGER zz_gx_document_canonical_write_v1 ON public.domain_entities_v26;
DROP FUNCTION private.gx_document_projected_write_v1() RESTRICT;
DROP FUNCTION private.gx_document_canonical_write_v1() RESTRICT;
DROP FUNCTION private.gx_document_terminal_actor_v1(uuid,text) RESTRICT;
DROP FUNCTION private.gx_document_write_permitted_v1(uuid,uuid,text,bigint,jsonb) RESTRICT;
DROP TABLE private.gx_document_write_permit_v1 RESTRICT;
COMMIT;
