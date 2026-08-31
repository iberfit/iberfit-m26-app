-- IBERFIT M26 · RC65-C2/C3 corrective compatibility
-- Purpose: preserve SECURITY INVOKER + RLS on data RPCs while allowing those
-- RPCs to compose the privileged-assurance assertion helper for authenticated
-- callers. Client remains second-factor free; privileged Coach/Admin remain
-- fail-closed until IBERFIT WebAuthn assurance is verified.

DO $rc65_invoker_precheck$
DECLARE
  v_context_definer boolean;
  v_helper_definer boolean;
  v_backend_definer boolean;
  v_wearable_definer boolean;
  v_backend_source text;
  v_wearable_source text;
BEGIN
  IF to_regprocedure('public.iberfit_privileged_assurance_context_v65d()') IS NULL THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_CONTEXT_MISSING';
  END IF;
  IF to_regprocedure('public.iberfit_require_privileged_assurance_v65d()') IS NULL THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_HELPER_MISSING';
  END IF;
  IF to_regprocedure('public.m26_backend_bootstrap_v43()') IS NULL
     OR to_regprocedure('public.m26_wearable_bootstrap_v44()') IS NULL THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_CLIENT_BOOTSTRAP_SURFACE_MISSING';
  END IF;

  SELECT prosecdef INTO v_context_definer
  FROM pg_proc
  WHERE oid='public.iberfit_privileged_assurance_context_v65d()'::regprocedure;

  SELECT prosecdef INTO v_helper_definer
  FROM pg_proc
  WHERE oid='public.iberfit_require_privileged_assurance_v65d()'::regprocedure;

  SELECT prosecdef,prosrc INTO v_backend_definer,v_backend_source
  FROM pg_proc
  WHERE oid='public.m26_backend_bootstrap_v43()'::regprocedure;

  SELECT prosecdef,prosrc INTO v_wearable_definer,v_wearable_source
  FROM pg_proc
  WHERE oid='public.m26_wearable_bootstrap_v44()'::regprocedure;

  IF NOT v_context_definer THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_CONTEXT_SECURITY_CONTRACT_DRIFT';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.iberfit_privileged_assurance_context_v65d()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_CONTEXT_NOT_AUTHENTICATED_CALLABLE';
  END IF;
  IF NOT v_helper_definer THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_HELPER_BASELINE_DRIFT';
  END IF;
  IF v_backend_definer OR v_wearable_definer THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_RLS_INVOKER_CONTRACT_DRIFT';
  END IF;
  IF position('iberfit_require_privileged_assurance_v65d' in v_backend_source)=0
     OR position('iberfit_require_privileged_assurance_v65d' in v_wearable_source)=0 THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_GUARD_COMPOSITION_MISSING';
  END IF;
END
$rc65_invoker_precheck$;

CREATE OR REPLACE FUNCTION public.iberfit_require_privileged_assurance_v65d()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path=''
AS $function$
DECLARE
  v_context jsonb;
BEGIN
  v_context:=public.iberfit_privileged_assurance_context_v65d();
  IF coalesce((v_context->>'privileged')::boolean,false)
     AND coalesce(v_context->>'iberfitAssurance','required')<>'verified' THEN
    RAISE EXCEPTION 'IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED' USING errcode='42501';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.iberfit_require_privileged_assurance_v65d()
  FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_require_privileged_assurance_v65d()
  TO authenticated;

COMMENT ON FUNCTION public.iberfit_require_privileged_assurance_v65d() IS
  'RC65-C2/C3 assertion-only helper. Authenticated callers may compose it from RLS-preserving SECURITY INVOKER RPCs. It returns no data, performs no mutation, and privileged Coach/Admin remain blocked until IBERFIT WebAuthn assurance is verified.';

DO $rc65_invoker_postcheck$
DECLARE
  v_helper_definer boolean;
  v_backend_definer boolean;
  v_wearable_definer boolean;
  v_backend_source text;
  v_wearable_source text;
BEGIN
  SELECT prosecdef INTO v_helper_definer
  FROM pg_proc
  WHERE oid='public.iberfit_require_privileged_assurance_v65d()'::regprocedure;

  SELECT prosecdef,prosrc INTO v_backend_definer,v_backend_source
  FROM pg_proc
  WHERE oid='public.m26_backend_bootstrap_v43()'::regprocedure;

  SELECT prosecdef,prosrc INTO v_wearable_definer,v_wearable_source
  FROM pg_proc
  WHERE oid='public.m26_wearable_bootstrap_v44()'::regprocedure;

  IF v_helper_definer THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_HELPER_MUST_BE_INVOKER';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.iberfit_require_privileged_assurance_v65d()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_AUTHENTICATED_EXECUTE_MISSING';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.iberfit_require_privileged_assurance_v65d()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_ANON_EXECUTE_PRESENT';
  END IF;
  IF v_backend_definer OR v_wearable_definer THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_DATA_RPC_DEFINER_BYPASS';
  END IF;
  IF position('iberfit_require_privileged_assurance_v65d' in v_backend_source)=0
     OR position('iberfit_require_privileged_assurance_v65d' in v_wearable_source)=0 THEN
    RAISE EXCEPTION 'RC65_INV_COMPAT_DATA_RPC_GUARD_REMOVED';
  END IF;
END
$rc65_invoker_postcheck$;
