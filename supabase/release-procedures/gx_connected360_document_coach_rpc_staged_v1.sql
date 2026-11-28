-- Coach-only staged entry point. Existing private creation remains the single
-- authority for report identity, assignment, source consent and idempotency.
-- No EXECUTE grants until the canonical write and hosted role tests pass.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF to_regprocedure('private.gx_document_request_create_v1(uuid,text,integer)') IS NULL
 OR to_regprocedure('private.m26_v49_live_session()') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolbypassrls OR rolsuper))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_COACH_RPC_PREREQUISITES'; END IF;
END $guard$;
CREATE FUNCTION public.iberfit_gx_document_request_v1(p_report uuid,p_provider text,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE actor uuid:=auth.uid(); created jsonb; q private.gx_connected360_document_request_v1%rowtype;
 prior private.gx_connected360_document_decision_v1%rowtype;
BEGIN
 IF actor IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
 OR private.m26_v49_live_session() IS DISTINCT FROM true OR public.iberfit_current_role_v26() IS DISTINCT FROM 'coach'
 OR EXISTS(SELECT 1 FROM public.user_application_roles p WHERE p.user_id=actor AND p.active AND p.role::text='admin')
 OR p_report IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
 OR p_provider IS NULL OR p_provider NOT IN ('apple_health','health_connect')
 THEN RAISE EXCEPTION 'GX_DOCUMENT_COACH_RPC_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- The private routine acquires report and source locks, checks WebAuthn,
 -- assignment, organization and source proof, and deduplicates exact material.
 created:=private.gx_document_request_create_v1(p_report,p_provider,p_expected_revision);
 SELECT * INTO q FROM private.gx_connected360_document_request_v1
 WHERE id=(created->>'requestId')::uuid AND report_id=p_report AND coach_id=actor
 AND provider=p_provider AND report_revision=p_expected_revision FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'GX_DOCUMENT_COACH_RECEIPT_STALE' USING ERRCODE='40001'; END IF;
 SELECT * INTO prior FROM private.gx_connected360_document_decision_v1 WHERE request_id=q.id ORDER BY revision DESC LIMIT 1;
 -- Historical decision only. Never return proof, hashes, owner ID, source grant
 -- or an "authorized" field; canonical publication must check validity anew.
 RETURN pg_catalog.jsonb_build_object('schema','iberfit.connected360.document-coach-receipt.v1',
 'requestId',q.id,'reportId',q.report_id,'clientId',q.client_id,'reportRevision',q.report_revision,
 'provider',q.provider,'revision',coalesce(prior.revision,0),'decision',coalesce(prior.decision,'pending'));
END $f$;
REVOKE ALL ON FUNCTION public.iberfit_gx_document_request_v1(uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
