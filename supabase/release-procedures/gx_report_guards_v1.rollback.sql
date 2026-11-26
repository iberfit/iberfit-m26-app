-- Refuse disabling validation after marked reports or issuance snapshots exist.
-- In that case a forward fix is required; preserve lineage and access control.
BEGIN;
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM public.reports WHERE private.iberfit_gx_report_body_has_refs_v1(content)) OR EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 WHERE private.iberfit_gx_report_body_has_refs_v1(source_snapshot)) THEN RAISE EXCEPTION 'GX_REPORT_GUARD_ROLLBACK_REQUIRES_FORWARD_FIX'; END IF;
END $guard$;
DROP TRIGGER gx326_issuance_evidence_guard ON public.iberfit_evolution_report_issuances_v1;
DROP TRIGGER gx326_report_evidence_guard ON public.reports;
DROP POLICY gx326_client_evidence_current ON public.reports;
DROP FUNCTION private.iberfit_gx_issuance_write_guard_v1();
DROP FUNCTION private.iberfit_gx_report_write_guard_v1();
REVOKE EXECUTE ON FUNCTION private.iberfit_gx_report_body_has_refs_v1(jsonb) FROM authenticated;
CREATE OR REPLACE FUNCTION public.iberfit_m44_prepare_evolution_report_issue_v1(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.iberfit_m44_require_privileged_assurance_v1();
 RETURN public.iberfit_m44_prepare_evolution_report_issue_impl_v1(p_report_id);
END $function$;
CREATE OR REPLACE FUNCTION public.iberfit_m44_authorize_evolution_report_pdf_v1(p_issuance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF public.iberfit_current_role_v26() IN ('coach','admin')
 THEN PERFORM public.iberfit_m44_require_privileged_assurance_v1(); END IF;
 RETURN public.iberfit_m44_authorize_evolution_report_pdf_impl_v1(p_issuance_id);
END $function$;
COMMIT;
