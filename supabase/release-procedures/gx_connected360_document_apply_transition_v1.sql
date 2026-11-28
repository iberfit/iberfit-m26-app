-- Staged same-transaction consumer of the existing command bus. This installer
-- deliberately retains the closed storage fence and grants no API execution.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF to_regprocedure('private.gx_document_prepare_approval_v1(uuid,uuid,integer,uuid)') IS NULL
 OR to_regprocedure('private.gx_document_published_pair_current_v1(uuid,uuid,jsonb)') IS NULL
 OR to_regprocedure('private.gx_document_approved_current_v1(uuid,uuid,jsonb)') IS NULL
 OR to_regprocedure('public.iberfit_execute_command_v26(jsonb)') IS NULL
 OR md5(pg_get_functiondef('public.iberfit_execute_command_v26(jsonb)'::regprocedure)) IS DISTINCT FROM 'dda28c8b1b48944adf8fa4c1317224a9'
 OR md5(pg_get_functiondef('public.iberfit_m44_report_public_projection_v1()'::regprocedure)) IS DISTINCT FROM 'd1ee7050ad8b4a0a1a47d4a52fa62cae'
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.domain_entities_v26'::regclass AND tgname='trg_m44_report_client_safe_projection' AND tgenabled='O')
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_PREREQUISITES'; END IF;
END $guard$;
CREATE FUNCTION private.gx_document_apply_transition_v1(p_report uuid,p_request uuid,p_expected_revision integer,p_operation uuid,p_action text,p_preview_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE actor uuid:=auth.uid(); context jsonb; q private.gx_connected360_document_request_v1%rowtype;
 r public.reports%rowtype; command jsonb; result jsonb; receipt public.command_receipts_v26%rowtype;
 expected_type text; target_status text; next_revision bigint; required_revision bigint;
BEGIN
 IF actor IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
 OR private.m26_v49_live_session() IS DISTINCT FROM true OR public.iberfit_current_role_v26() IS DISTINCT FROM 'coach'
 OR EXISTS(SELECT 1 FROM public.user_application_roles a WHERE a.user_id=actor AND a.active AND a.role::text='admin')
 OR current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
 OR p_report IS NULL OR p_request IS NULL OR p_operation IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
 OR p_action IS NULL OR p_action NOT IN ('approve','publish') OR (p_action='publish' AND p_preview_confirmed IS DISTINCT FROM true)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM public.iberfit_require_privileged_assurance_v65d();
 context:=public.iberfit_application_context_v14();
 SELECT * INTO q FROM private.gx_connected360_document_request_v1 WHERE id=p_request AND report_id=p_report AND coach_id=actor;
 IF NOT FOUND OR context->>'membershipStatus' IS DISTINCT FROM 'active'
 OR context->>'organizationId' IS DISTINCT FROM q.organization_id::text
 OR NOT coalesce(context->'roles'?'coach',false) OR coalesce(context->'roles'?'admin',false)
 OR NOT coalesce(public.iberfit_can_access_client_v26(q.client_id),false) OR NOT coalesce(public.is_assigned_coach(q.client_id),false)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('report:'||p_report::text,0))
 OR NOT pg_try_advisory_xact_lock(1781042601,hashtext(q.client_id::text))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_BUSY' USING ERRCODE='40001'; END IF;
 expected_type:=CASE p_action WHEN 'approve' THEN 'INFORME_APROBAR' ELSE 'INFORME_PUBLICAR' END;
 target_status:=CASE p_action WHEN 'approve' THEN 'aprobado' ELSE 'publicado' END;
 next_revision:=p_expected_revision::bigint+1;
 -- Calculate separately: a bare CASE inside a PL/pgSQL IF condition can
 -- terminate the parser's condition at the inner THEN.
 required_revision:=q.report_revision::bigint;
 IF p_action='publish' THEN required_revision:=required_revision+1; END IF;
 IF p_expected_revision::bigint IS DISTINCT FROM required_revision
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_REVISION_STALE' USING ERRCODE='40001'; END IF;
 -- An existing operation is never replayed as fresh authorization. The caller
 -- must reload the authoritative state after a lost response, not resubmit.
 IF EXISTS(SELECT 1 FROM public.command_receipts_v26 WHERE operation_id=p_operation)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_RELOAD_REQUIRED' USING ERRCODE='40001'; END IF;
 IF p_action='approve' THEN
  command:=private.gx_document_prepare_approval_v1(p_report,p_request,p_expected_revision,p_operation);
 ELSE
  SELECT * INTO r FROM public.reports WHERE id=p_report AND client_id=q.client_id AND created_by=actor AND revision=p_expected_revision FOR UPDATE NOWAIT;
  IF NOT FOUND OR private.gx_document_approved_current_v1(p_report,q.client_id,r.content) IS DISTINCT FROM true
   OR private.gx_document_publication_material_sha_v1(p_report,q.client_id,r.content) IS DISTINCT FROM q.publication_sha256
   OR private.gx_document_other_evidence_current_v1(q.client_id,r.content) IS DISTINCT FROM true
   OR private.gx_document_publication_lock_v1(p_report,q.client_id,r.content) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_STALE' USING ERRCODE='40001'; END IF;
  command:=jsonb_build_object('operationId',p_operation,'type',expected_type,'entityType','report','entityId',p_report,'clientId',q.client_id,'baseRevision',p_expected_revision,'conflictSensitive',true,
    'payload',jsonb_build_object('previewConfirmed',true,'targetClientId',q.client_id));
 END IF;
 -- Keep the locks and the exact command in the same transaction. No client
 -- supplied patch, no direct update, no alternate audit or projection path.
 result:=public.iberfit_execute_command_v26(command);
 IF result->>'kind' IS DISTINCT FROM 'ack' OR result->>'operationId' IS DISTINCT FROM p_operation::text
 OR result->>'remoteRevision' IS DISTINCT FROM next_revision::text OR result->'duplicate' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_ACK_INVALID' USING ERRCODE='40001'; END IF;
 SELECT * INTO receipt FROM public.command_receipts_v26 WHERE operation_id=p_operation;
 IF NOT FOUND OR receipt.actor_user_id IS DISTINCT FROM actor OR receipt.command_type IS DISTINCT FROM expected_type
 OR receipt.entity_type IS DISTINCT FROM 'report' OR receipt.entity_id IS DISTINCT FROM p_report OR receipt.client_id IS DISTINCT FROM q.client_id
 OR receipt.base_revision IS DISTINCT FROM p_expected_revision::bigint OR receipt.remote_revision IS DISTINCT FROM next_revision
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_RECEIPT_INVALID' USING ERRCODE='40001'; END IF;
 SELECT * INTO r FROM public.reports WHERE id=p_report AND client_id=q.client_id AND created_by=actor AND revision=next_revision AND status::text=target_status;
 IF NOT FOUND OR private.m26_v49_live_session() IS DISTINCT FROM true
 OR private.gx_document_publication_material_sha_v1(p_report,q.client_id,r.content) IS DISTINCT FROM q.publication_sha256
 OR private.gx_document_other_evidence_current_v1(q.client_id,r.content) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_READBACK_INVALID' USING ERRCODE='40001'; END IF;
 IF (p_action='approve' AND private.gx_document_approved_current_v1(p_report,q.client_id,r.content) IS DISTINCT FROM true)
 OR (p_action='publish' AND (private.gx_document_publication_current_v1(p_report,q.client_id,r.content) IS DISTINCT FROM true OR private.gx_document_published_pair_current_v1(p_report,q.client_id,r.content) IS DISTINCT FROM true))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_READBACK_INVALID' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('schema','iberfit.connected360.document-transition.v1','reportId',p_report,'requestId',p_request,'operationId',p_operation,'revision',next_revision,'status',target_status);
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_BUSY' USING ERRCODE='40001';
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_apply_transition_v1(uuid,uuid,integer,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
