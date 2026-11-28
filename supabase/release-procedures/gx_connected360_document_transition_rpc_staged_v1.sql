-- QA candidate only. No API grants or storage-fence changes. Same transaction
-- as private transition; no browser evidence, client id or arbitrary command.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$ BEGIN
 IF to_regprocedure('private.gx_document_apply_transition_v1(uuid,uuid,integer,uuid,text,boolean)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolbypassrls OR rolsuper))
 OR (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_RPC_PREREQUISITES'; END IF;
END $guard$;
CREATE FUNCTION public.iberfit_gx_document_transition_v1(p_report uuid,p_request uuid,p_expected_revision integer,p_operation uuid,p_action text,p_preview_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF auth.uid() IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
 OR private.m26_v49_live_session() IS DISTINCT FROM true OR public.iberfit_current_role_v26() IS DISTINCT FROM 'coach'
 OR EXISTS(SELECT 1 FROM public.user_application_roles p WHERE p.user_id=auth.uid() AND p.active AND p.role::text='admin')
 THEN RAISE EXCEPTION 'GX_DOCUMENT_TRANSITION_RPC_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Authoritative helper repeats identity, scope, assurance, evidence, CAS,
 -- source and request locks, canonical ACK/receipt and readback checks.
 RETURN private.gx_document_apply_transition_v1(p_report,p_request,p_expected_revision,p_operation,p_action,p_preview_confirmed);
END $f$;
REVOKE ALL ON FUNCTION public.iberfit_gx_document_transition_v1(uuid,uuid,integer,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
