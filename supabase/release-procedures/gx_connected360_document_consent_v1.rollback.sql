-- Never discard consent history to roll back a release.
BEGIN;
LOCK TABLE private.gx_connected360_document_request_v1,private.gx_connected360_document_decision_v1 IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM private.gx_connected360_document_request_v1) OR EXISTS(SELECT 1 FROM private.gx_connected360_document_decision_v1)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_CONSENT_ROLLBACK_REQUIRES_HISTORY_RETENTION'; END IF;
END $guard$;
DROP FUNCTION private.gx_document_request_review_v1(uuid,boolean) RESTRICT;
DROP FUNCTION private.gx_document_request_decide_v1(uuid,integer,uuid,text,text,text) RESTRICT;
DROP FUNCTION private.gx_document_request_create_v1(uuid,text,integer) RESTRICT;
DROP FUNCTION private.gx_document_publication_lock_v1(uuid,uuid,jsonb) RESTRICT;
DROP FUNCTION private.gx_document_publication_current_v1(uuid,uuid,jsonb) RESTRICT;
DROP FUNCTION private.gx_document_request_proof_snapshot_v1(private.gx_connected360_document_request_v1) RESTRICT;
DROP FUNCTION private.gx_document_request_proof_v1(private.gx_connected360_document_request_v1) RESTRICT;
DROP FUNCTION private.gx_document_accepted_material_matches_v1(uuid,uuid,jsonb) RESTRICT;
DROP FUNCTION private.gx_document_expected_publication_sha_v1(public.reports,uuid,jsonb) RESTRICT;
DROP FUNCTION private.gx_document_expected_publication_body_v1(public.reports,uuid,jsonb) RESTRICT;
DROP FUNCTION private.gx_document_publication_material_sha_v1(uuid,uuid,jsonb) RESTRICT;
DROP FUNCTION private.gx_document_draft_sha_v1(public.reports) RESTRICT;
DROP TABLE private.gx_connected360_document_decision_v1 RESTRICT;
DROP TABLE private.gx_connected360_document_request_v1 RESTRICT;
COMMIT;
