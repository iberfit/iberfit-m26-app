-- Staged generic ingress isolation. Do NOT remove any storage constraint or
-- enable any document RPC here. The private consumer retains every M26 guard.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $install$
DECLARE original text; transition text; anchor constant text:='result:=public.iberfit_execute_command_v26(command);';
BEGIN
 IF to_regprocedure('private.gx_document_bus_internal_v1(jsonb)') IS NOT NULL
 OR to_regprocedure('private.gx_document_generic_rejection_v1(jsonb)') IS NOT NULL
 OR to_regprocedure('private.gx_document_has_external_v1(jsonb)') IS NULL
 OR to_regprocedure('private.gx_document_apply_transition_v1(uuid,uuid,integer,uuid,text,boolean)') IS NULL
 OR (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.iberfit_execute_command_v26(jsonb)'::regprocedure AND proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND prosecdef)
 OR NOT has_function_privilege('authenticated','public.iberfit_execute_command_v26(jsonb)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.iberfit_execute_command_v26(jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.iberfit_execute_command_v26(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'GX_DOCUMENT_BUS_BOUNDARY_PREREQUISITES'; END IF;
 original:=pg_get_functiondef('public.iberfit_execute_command_v26(jsonb)'::regprocedure);
 IF md5(original) IS DISTINCT FROM 'dda28c8b1b48944adf8fa4c1317224a9' THEN RAISE EXCEPTION 'GX_DOCUMENT_BUS_BOUNDARY_DRIFT'; END IF;
 transition:=pg_get_functiondef('private.gx_document_apply_transition_v1(uuid,uuid,integer,uuid,text,boolean)'::regprocedure);
 IF length(transition)-length(replace(transition,anchor,''))<>length(anchor) THEN RAISE EXCEPTION 'GX_DOCUMENT_BUS_TRANSITION_DRIFT'; END IF;
 -- Clone the exact *outer* wrapper, including receipt, service and delivery
 -- guards. Do not jump to any historical pre_* implementation.
 EXECUTE replace(original,'FUNCTION public.iberfit_execute_command_v26(','FUNCTION private.gx_document_bus_internal_v1(');
 REVOKE ALL ON FUNCTION private.gx_document_bus_internal_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
 EXECUTE replace(transition,anchor,'result:=private.gx_document_bus_internal_v1(command);');
END $install$;
CREATE FUNCTION private.gx_document_generic_rejection_v1(p_command jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE v_report_id uuid; v_client_id uuid; command_type text; marked boolean; patch jsonb; terminal_status text;
BEGIN
 command_type:=upper(btrim(coalesce(p_command->>'type','')));
 IF p_command->>'entityType' IS DISTINCT FROM 'report' AND command_type NOT LIKE 'INFORME_%' THEN RETURN NULL; END IF;
 patch:=p_command#>'{payload,patch}';
 -- This check examines only the caller's input, including noncanonical case
 -- and leading whitespace. It runs before the original receipt fast path.
 IF private.gx_document_has_external_v1(patch) OR private.gx_document_has_external_v1(p_command->'payload') OR private.gx_document_has_external_v1(p_command)
 THEN RETURN 'GX_DOCUMENT_AUTHORIZED_TRANSITION_REQUIRED'; END IF;
 -- Do not look up report state for an unauthenticated/unauthorized target.
 -- Malformed and out-of-scope ordinary commands retain the original checks.
 BEGIN
  v_report_id:=(p_command->>'entityId')::uuid;
  v_client_id:=(p_command->>'clientId')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
 END;
 IF v_report_id IS NULL OR v_client_id IS NULL OR auth.uid() IS NULL OR coalesce(public.iberfit_current_role_v26(),'') NOT IN ('coach','admin') OR NOT coalesce(public.iberfit_can_access_client_v26(v_client_id),false) THEN RETURN NULL; END IF;
 -- Same lock as rc29 and the document adapter; do not inspect a stale row
 -- before waiting for a competing publication. Return a recoverable rejection
 -- rather than introducing a wait or lock-order cycle in the outer wrapper.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('report:'||v_report_id::text,0)) THEN RETURN 'GX_DOCUMENT_COMMAND_BUSY'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.domain_entities_v26 d WHERE d.entity_type='report' AND d.entity_id=v_report_id AND d.client_id=v_client_id AND private.gx_document_has_external_v1(d.body))
 OR EXISTS(SELECT 1 FROM public.reports r WHERE r.id=v_report_id AND r.client_id=v_client_id AND private.gx_document_has_external_v1(r.content)) INTO marked;
 IF NOT marked THEN RETURN NULL; END IF;
 -- Preserve the existing legitimate retirement/annulment escape hatch, but
 -- never let an arbitrary patch remove lineage or rewrite authorized content.
 -- The original bus still enforces role, reason, state and revision.
 IF command_type IN ('INFORME_RETIRAR','INFORME_ANULAR') THEN
  IF patch IS NULL OR patch='{}'::jsonb THEN RETURN NULL; END IF;
  terminal_status:='retirado';
  IF command_type='INFORME_ANULAR' THEN terminal_status:='anulado'; END IF;
  -- Existing buildPublicationCommand emits status, withdrawnAt, visibility
  -- and reason. Permit only this administrative patch; the bus assigns the
  -- authoritative status/retiredAt/actor. Never accept evidence or identity.
  IF jsonb_typeof(patch)='object'
   AND patch-ARRAY['status','withdrawnAt','visibleToClient','reason']::text[]='{}'::jsonb
   AND (NOT (patch?'status') OR patch->>'status'=terminal_status)
   AND (NOT (patch?'visibleToClient') OR patch->'visibleToClient'='false'::jsonb)
   AND (NOT (patch?'withdrawnAt') OR (command_type='INFORME_RETIRAR' AND jsonb_typeof(patch->'withdrawnAt')='string' AND length(patch->>'withdrawnAt')<=40))
   AND (NOT (patch?'reason') OR (jsonb_typeof(patch->'reason')='string' AND length(patch->>'reason')<=1000))
  THEN RETURN NULL; END IF;
 END IF;
 RETURN 'GX_DOCUMENT_AUTHORIZED_TRANSITION_REQUIRED';
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_generic_rejection_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.iberfit_execute_command_v26(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE rejection text;
BEGIN
 rejection:=private.gx_document_generic_rejection_v1(p_command);
 IF rejection IS NOT NULL THEN
  RETURN jsonb_build_object('kind','rejected','operationId',p_command->>'operationId','remoteRevision',NULL,'reason',rejection,'serverAt',now());
 END IF;
 RETURN private.gx_document_bus_internal_v1(p_command);
END $f$;
-- CREATE OR REPLACE preserves the public entry point's ACL and OID.
-- The new internal function and guard have no API grants.
COMMIT;
