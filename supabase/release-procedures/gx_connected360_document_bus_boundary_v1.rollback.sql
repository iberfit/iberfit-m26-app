-- Only reverse the closed stage, before any external material is stored.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE original text; transition text; anchor constant text:='result:=private.gx_document_bus_internal_v1(command);';
BEGIN
 IF (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR EXISTS(SELECT 1 FROM public.reports WHERE private.gx_document_has_external_v1(content))
 OR EXISTS(SELECT 1 FROM public.domain_entities_v26 WHERE entity_type='report' AND private.gx_document_has_external_v1(body))
 OR EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 WHERE private.gx_document_has_external_v1(source_snapshot))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_BUS_ROLLBACK_REQUIRES_CLOSED_FENCE'; END IF;
 original:=replace(pg_get_functiondef('private.gx_document_bus_internal_v1(jsonb)'::regprocedure),'FUNCTION private.gx_document_bus_internal_v1(','FUNCTION public.iberfit_execute_command_v26(');
 IF md5(original) IS DISTINCT FROM 'dda28c8b1b48944adf8fa4c1317224a9' THEN RAISE EXCEPTION 'GX_DOCUMENT_BUS_ROLLBACK_DRIFT'; END IF;
 transition:=pg_get_functiondef('private.gx_document_apply_transition_v1(uuid,uuid,integer,uuid,text,boolean)'::regprocedure);
 IF length(transition)-length(replace(transition,anchor,''))<>length(anchor) THEN RAISE EXCEPTION 'GX_DOCUMENT_BUS_TRANSITION_ROLLBACK_DRIFT'; END IF;
 -- Do not overwrite an unrelated later public wrapper.
 IF (SELECT prosrc FROM pg_proc WHERE oid='public.iberfit_execute_command_v26(jsonb)'::regprocedure) IS DISTINCT FROM $body$
DECLARE rejection text;
BEGIN
 rejection:=private.gx_document_generic_rejection_v1(p_command);
 IF rejection IS NOT NULL THEN
  RETURN jsonb_build_object('kind','rejected','operationId',p_command->>'operationId','remoteRevision',NULL,'reason',rejection,'serverAt',now());
 END IF;
 RETURN private.gx_document_bus_internal_v1(p_command);
END $body$ THEN RAISE EXCEPTION 'GX_DOCUMENT_BUS_WRAPPER_ROLLBACK_DRIFT'; END IF;
 EXECUTE original;
 EXECUTE replace(transition,anchor,'result:=public.iberfit_execute_command_v26(command);');
END $rollback$;
DROP FUNCTION private.gx_document_generic_rejection_v1(jsonb) RESTRICT;
DROP FUNCTION private.gx_document_bus_internal_v1(jsonb) RESTRICT;
COMMIT;
