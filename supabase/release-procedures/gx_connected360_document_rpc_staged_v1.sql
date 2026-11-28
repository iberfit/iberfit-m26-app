-- Staged owner-only facade. NO API grants: a later certified atomic release
-- must explicitly grant authenticated EXECUTE, not install this as activation.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF to_regprocedure('private.gx_document_inbox_v1(uuid)') IS NULL
 OR to_regprocedure('private.gx_document_request_review_v1(uuid,boolean)') IS NULL
 OR to_regprocedure('private.gx_document_request_decide_v1(uuid,integer,uuid,text,text,text)') IS NULL
 OR to_regprocedure('private.m26_v49_live_session()') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolbypassrls OR rolsuper))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_RPC_PREREQUISITES'; END IF;
END $guard$;
CREATE FUNCTION private.gx_document_require_owner_v1()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE actor uuid:=auth.uid(); client uuid:=public.iberfit_client_id();
BEGIN
 IF actor IS NULL OR client IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
 OR private.m26_v49_live_session() IS DISTINCT FROM true OR public.iberfit_current_role_v26() IS DISTINCT FROM 'cliente'
 OR NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.user_id=actor AND p.client_id=client AND p.role::text='client')
 OR EXISTS(SELECT 1 FROM public.user_application_roles p WHERE p.user_id=actor AND p.active AND p.role::text IN ('coach','admin'))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_RPC_FORBIDDEN' USING ERRCODE='42501'; END IF;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_require_owner_v1() FROM PUBLIC,anon,authenticated,service_role;
-- Definer required solely to access the forced-RLS private ledger. The
-- helper and delegated operation both check the signed caller, never input IDs.
CREATE FUNCTION public.iberfit_gx_document_inbox_v1(p_after uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'GX_DOCUMENT_RPC_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM private.gx_document_require_owner_v1();
 RETURN private.gx_document_inbox_v1(p_after);
END $f$;
CREATE FUNCTION public.iberfit_gx_document_review_v1(p_request uuid,p_preview boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'GX_DOCUMENT_RPC_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM private.gx_document_require_owner_v1();
 RETURN private.gx_document_request_review_v1(p_request,p_preview);
END $f$;
CREATE FUNCTION public.iberfit_gx_document_decide_v1(p_request uuid,p_expected_revision integer,p_operation uuid,p_decision text,p_draft_sha text,p_evidence_sha text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'GX_DOCUMENT_RPC_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM private.gx_document_require_owner_v1();
 RETURN private.gx_document_request_decide_v1(p_request,p_expected_revision,p_operation,p_decision,p_draft_sha,p_evidence_sha);
END $f$;
REVOKE ALL ON FUNCTION public.iberfit_gx_document_inbox_v1(uuid),public.iberfit_gx_document_review_v1(uuid,boolean),public.iberfit_gx_document_decide_v1(uuid,integer,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
