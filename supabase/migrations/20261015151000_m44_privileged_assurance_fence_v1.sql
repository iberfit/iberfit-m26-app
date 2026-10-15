-- IBERFIT M44: enforce an existing verified privileged session on every
-- direct or Edge-mediated Coach/Admin report mutation and sensitive PDF read.
-- Origin is not proof of identity; the existing v65d context crosschecks
-- auth.uid(), active auth.sessions and session-bound WebAuthn / email OTP.
-- Renamed implementations are private to service_role: browser cannot bypass.
-- Never weaken or redefine the application's existing assurance policy.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.iberfit_privileged_assurance_context_v65d()') IS NULL
    OR to_regprocedure('public.iberfit_m44_create_report_draft_v1(uuid,uuid,jsonb)') IS NULL
    OR to_regprocedure('public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)') IS NULL
    OR to_regprocedure('public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)') IS NULL
    OR to_regprocedure('public.iberfit_m44_report_issued_pdf_history_v1(uuid)') IS NULL
    OR to_regprocedure('public.iberfit_m44_withdraw_evolution_report_pdf_v1(uuid,text)') IS NULL
 THEN RAISE EXCEPTION 'M44_PRIVILEGED_ASSURANCE_PRECONDITION_FAILED'; END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.iberfit_m44_require_privileged_assurance_v1()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_role text := public.iberfit_current_role_v26();
  v_context jsonb;
BEGIN
  IF auth.uid() IS NULL OR coalesce(v_role,'') NOT IN ('coach','admin')
  THEN RAISE EXCEPTION 'M44_PRIVILEGED_ROLE_REQUIRED' USING errcode='42501'; END IF;
  v_context:=public.iberfit_privileged_assurance_context_v65d();
  IF v_context->>'iberfitAssurance' IS DISTINCT FROM 'verified'
     OR coalesce((v_context->>'privileged')::boolean,false) IS DISTINCT FROM true
     -- Dual-role accounts may have active Coach while assurance correctly
     -- resolves the strongest authorized application role as Admin.
     OR coalesce(v_context->>'origin','') NOT IN
      ('https://m26-canary.iberfit.cl','https://app.iberfit.cl','https://coach.iberfit.cl')
     OR nullif(v_context->>'verifiedAt','') IS NULL
     OR nullif(v_context->>'expiresAt','') IS NULL
  THEN RAISE EXCEPTION 'M44_PRIVILEGED_ASSURANCE_REQUIRED' USING errcode='42501'; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.iberfit_m44_require_privileged_assurance_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_require_privileged_assurance_v1() TO service_role;

-- Create private implementations. A direct request to an impl must fail
-- even with a valid standard authenticated session.
ALTER FUNCTION public.iberfit_m44_create_report_draft_v1(uuid,uuid,jsonb)
 RENAME TO iberfit_m44_create_report_draft_impl_v1;
ALTER FUNCTION public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)
 RENAME TO iberfit_m44_prepare_evolution_report_issue_impl_v1;
ALTER FUNCTION public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)
 RENAME TO iberfit_m44_authorize_evolution_report_pdf_impl_v1;
ALTER FUNCTION public.iberfit_m44_report_issued_pdf_history_v1(uuid)
 RENAME TO iberfit_m44_report_issued_pdf_history_impl_v1;
ALTER FUNCTION public.iberfit_m44_withdraw_evolution_report_pdf_v1(uuid,text)
 RENAME TO iberfit_m44_withdraw_evolution_report_pdf_impl_v1;
REVOKE ALL ON FUNCTION public.iberfit_m44_create_report_draft_impl_v1(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.iberfit_m44_prepare_evolution_report_issue_impl_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.iberfit_m44_authorize_evolution_report_pdf_impl_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.iberfit_m44_report_issued_pdf_history_impl_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.iberfit_m44_withdraw_evolution_report_pdf_impl_v1(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.iberfit_m44_create_report_draft_v1(p_client_id uuid,p_report_id uuid,p_draft jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 PERFORM public.iberfit_m44_require_privileged_assurance_v1();
 RETURN public.iberfit_m44_create_report_draft_impl_v1(p_client_id,p_report_id,p_draft);
END $function$;

CREATE FUNCTION public.iberfit_m44_prepare_evolution_report_issue_v1(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 PERFORM public.iberfit_m44_require_privileged_assurance_v1();
 RETURN public.iberfit_m44_prepare_evolution_report_issue_impl_v1(p_report_id);
END $function$;

CREATE FUNCTION public.iberfit_m44_authorize_evolution_report_pdf_v1(p_issuance_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 IF public.iberfit_current_role_v26() IN ('coach','admin')
 THEN PERFORM public.iberfit_m44_require_privileged_assurance_v1(); END IF;
 RETURN public.iberfit_m44_authorize_evolution_report_pdf_impl_v1(p_issuance_id);
END $function$;

CREATE FUNCTION public.iberfit_m44_report_issued_pdf_history_v1(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 IF public.iberfit_current_role_v26() IN ('coach','admin')
 THEN PERFORM public.iberfit_m44_require_privileged_assurance_v1(); END IF;
 RETURN public.iberfit_m44_report_issued_pdf_history_impl_v1(p_report_id);
END $function$;

CREATE FUNCTION public.iberfit_m44_withdraw_evolution_report_pdf_v1(p_issuance_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 PERFORM public.iberfit_m44_require_privileged_assurance_v1();
 RETURN public.iberfit_m44_withdraw_evolution_report_pdf_impl_v1(p_issuance_id,p_reason);
END $function$;

REVOKE ALL ON FUNCTION public.iberfit_m44_create_report_draft_v1(uuid,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.iberfit_m44_prepare_evolution_report_issue_v1(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.iberfit_m44_report_issued_pdf_history_v1(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.iberfit_m44_withdraw_evolution_report_pdf_v1(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_create_report_draft_v1(uuid,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_prepare_evolution_report_issue_v1(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_report_issued_pdf_history_v1(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_withdraw_evolution_report_pdf_v1(uuid,text) TO authenticated,service_role;

DO $assertions$
DECLARE v text;
BEGIN
 FOREACH v IN ARRAY ARRAY[
 'iberfit_m44_create_report_draft_impl_v1(uuid,uuid,jsonb)',
 'iberfit_m44_prepare_evolution_report_issue_impl_v1(uuid)',
 'iberfit_m44_authorize_evolution_report_pdf_impl_v1(uuid)',
 'iberfit_m44_report_issued_pdf_history_impl_v1(uuid)',
 'iberfit_m44_withdraw_evolution_report_pdf_impl_v1(uuid,text)']
 LOOP
  IF has_function_privilege('authenticated',('public.'||v)::regprocedure,'EXECUTE')
     OR has_function_privilege('anon',('public.'||v)::regprocedure,'EXECUTE')
  THEN RAISE EXCEPTION 'M44_PRIVILEGED_IMPL_EXPOSED: %',v; END IF;
 END LOOP;
END $assertions$;
COMMIT;
