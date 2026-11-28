-- Staged internal preparation only. Does not remove the storage fence, invoke
-- the command bus, change status, publish, or grant an RPC to any API role.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF to_regclass('public.domain_entities_v26') IS NULL
 OR to_regprocedure('private.gx_document_expected_publication_body_v1(public.reports,uuid,jsonb)') IS NULL
 OR to_regprocedure('private.gx_document_request_proof_v1(private.gx_connected360_document_request_v1)') IS NULL
 OR to_regprocedure('private.gx_document_accepted_material_matches_v1(uuid,uuid,jsonb)') IS NULL
 OR to_regprocedure('private.gx_document_other_evidence_current_v1(uuid,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'GX_DOCUMENT_APPROVAL_PREREQUISITES'; END IF;
END $guard$;
CREATE FUNCTION private.gx_document_prepare_approval_v1(p_report uuid,p_request uuid,p_expected_revision integer,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE actor uuid:=auth.uid(); context jsonb; r public.reports%rowtype;
 q private.gx_connected360_document_request_v1%rowtype;
 canonical jsonb; proof jsonb; body jsonb;
BEGIN
 IF actor IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
 OR private.m26_v49_live_session() IS DISTINCT FROM true OR public.iberfit_current_role_v26() IS DISTINCT FROM 'coach'
 OR EXISTS(SELECT 1 FROM public.user_application_roles a WHERE a.user_id=actor AND a.active AND a.role::text='admin')
 OR current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
 OR p_report IS NULL OR p_request IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_operation IS NULL
 THEN RAISE EXCEPTION 'GX_DOCUMENT_APPROVAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM public.iberfit_require_privileged_assurance_v65d();
 context:=public.iberfit_application_context_v14();
 IF context->>'membershipStatus' IS DISTINCT FROM 'active' OR NOT coalesce(context->'roles'?'coach',false) OR coalesce(context->'roles'?'admin',false)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_APPROVAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM private.gx_connected360_document_request_v1 WHERE id=p_request AND report_id=p_report AND coach_id=actor AND report_revision=p_expected_revision;
 IF NOT FOUND OR context->>'organizationId' IS DISTINCT FROM q.organization_id::text
 OR NOT coalesce(public.iberfit_can_access_client_v26(q.client_id),false) OR NOT coalesce(public.is_assigned_coach(q.client_id),false)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_APPROVAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Same report lock as command bus; never wait while holding a different
 -- report/source lock. NOWAIT makes contention a recoverable conflict.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('report:'||p_report::text,0))
 OR NOT pg_try_advisory_xact_lock(1781042601,hashtext(q.client_id::text))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_APPROVAL_BUSY' USING ERRCODE='40001'; END IF;
 SELECT d.body INTO canonical FROM public.domain_entities_v26 d WHERE d.entity_type='report' AND d.entity_id=p_report AND d.client_id=q.client_id AND d.status::text='borrador' AND d.revision=p_expected_revision FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_APPROVAL_CANONICAL_STALE' USING ERRCODE='40001'; END IF;
 SELECT * INTO r FROM public.reports WHERE id=p_report AND client_id=q.client_id AND created_by=actor AND revision=p_expected_revision AND status::text='borrador' AND audience='coach' AND report_type='weekly' FOR UPDATE NOWAIT;
 IF NOT FOUND OR canonical IS DISTINCT FROM r.content OR r.content->'visibleToClient' IS DISTINCT FROM 'false'::jsonb
 OR private.gx_document_draft_sha_v1(r) IS DISTINCT FROM q.draft_sha256
 THEN RAISE EXCEPTION 'GX_DOCUMENT_APPROVAL_CANONICAL_STALE' USING ERRCODE='40001'; END IF;
 -- Reuse the original source, assignment and exact row builder; no evidence
 -- or user identity from the browser. Source proof holds its original locks.
 proof:=private.gx_document_request_proof_v1(q);
 IF proof->>'evidenceSha256' IS DISTINCT FROM q.evidence_sha256 THEN RAISE EXCEPTION 'GX_DOCUMENT_EVIDENCE_STALE' USING ERRCODE='40001'; END IF;
 body:=private.gx_document_expected_publication_body_v1(r,q.id,proof);
 IF body IS NULL OR private.gx_document_publication_material_sha_v1(r.id,r.client_id,body) IS DISTINCT FROM q.publication_sha256
 OR private.gx_document_other_evidence_current_v1(r.client_id,body) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'GX_DOCUMENT_MATERIAL_STALE' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM private.gx_connected360_document_request_v1 WHERE id=q.id FOR UPDATE;
 IF NOT FOUND OR private.m26_v49_live_session() IS DISTINCT FROM true
 OR private.gx_document_accepted_material_matches_v1(r.id,r.client_id,body) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'GX_DOCUMENT_APPROVAL_NOT_ACCEPTED' USING ERRCODE='40001'; END IF;
 -- Internal handoff to existing INFORME_APROBAR. This value MUST be consumed
 -- in the SAME transaction; returning it to a browser would release locks.
 -- Only evidence is patched, retaining all other canonical fields and the
 -- existing command bus's status, audit, revision and operation handling.
 RETURN jsonb_build_object('operationId',p_operation,'type','INFORME_APROBAR','entityType','report','entityId',r.id,'clientId',r.client_id,'baseRevision',r.revision,'conflictSensitive',true,
  'payload',jsonb_build_object('patch',jsonb_build_object('evidence',body->'evidence')));
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'GX_DOCUMENT_APPROVAL_BUSY' USING ERRCODE='40001';
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_prepare_approval_v1(uuid,uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
