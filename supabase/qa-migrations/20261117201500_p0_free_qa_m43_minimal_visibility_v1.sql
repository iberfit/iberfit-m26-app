-- IBERFIT #1209 · QA-only, read-only canonical bootstrap visibility probe.
-- The same authenticated canonical bootstrap is executed server-side;
-- ONLY two booleans cross the network for a synthetic Client's foreign entity.
-- No write, no caching, no publication shortcut, no PROD creation.
DO $guard$
BEGIN
  IF (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment')
       IS DISTINCT FROM 'QA'
     OR to_regprocedure('public.iberfit_qa_m43_bootstrap_visibility_v1(text,uuid)')
       IS NOT NULL
     OR NOT has_function_privilege('authenticated',
       'public.iberfit_bootstrap_v26()','EXECUTE')
     OR has_function_privilege('anon','public.iberfit_bootstrap_v26()','EXECUTE')
  THEN RAISE EXCEPTION 'P0_QA_M43_MINIMAL_VISIBILITY_ENV_OR_BASE_DRIFT'
    USING ERRCODE='42501'; END IF;
END
$guard$;

CREATE FUNCTION public.iberfit_qa_m43_bootstrap_visibility_v1(
  p_entity_type text, p_entity_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO ''
AS $probe$
DECLARE
  v_environment jsonb;
  v_snapshot jsonb;
  v_canonical boolean;
  v_legacy boolean;
BEGIN
  v_environment := public.iberfit_environment();
  IF v_environment->>'environment' IS DISTINCT FROM 'QA'
     OR v_environment->>'realDataAllowed' IS DISTINCT FROM 'false'
     OR v_environment->>'productionBlocked' IS DISTINCT FROM 'true'
     OR auth.uid() IS NULL
     OR lower(coalesce(auth.jwt()->>'email','')) NOT IN
       ('qa.rc74.client-a@iberfit.cl','qa.rc74.client-b@iberfit.cl')
     OR public.iberfit_current_role_v26() NOT IN ('client','cliente')
     OR public.iberfit_client_id() IS NULL
  THEN RAISE EXCEPTION 'P0_QA_M43_MINIMAL_VISIBILITY_CLIENT_ONLY'
    USING ERRCODE='42501'; END IF;
  IF p_entity_id IS NULL OR p_entity_type NOT IN ('session','session_execution')
  THEN RAISE EXCEPTION 'P0_QA_M43_MINIMAL_VISIBILITY_INVALID_ARGUMENT'
    USING ERRCODE='22023'; END IF;

  -- Do not replace the canonical bootstrap with a different RLS query.
  -- This is the genuine authenticated HTTP projection, evaluated ONCE.
  v_snapshot := public.iberfit_bootstrap_v26();
  IF jsonb_typeof(v_snapshot#>'{data,m26Entities}') IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_snapshot#>'{data,sessions}') IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_snapshot#>'{data,sessionExecutions}') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'P0_QA_M43_MINIMAL_VISIBILITY_BOOTSTRAP_MALFORMED'
    USING ERRCODE='22023'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_snapshot#>'{data,m26Entities}') item
    WHERE item->>'entityType'=p_entity_type AND item->>'entityId'=p_entity_id::text
  ) INTO v_canonical;
  IF p_entity_type='session' THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_snapshot#>'{data,sessions}') item
      WHERE item->>'id'=p_entity_id::text
    ) INTO v_legacy;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_snapshot#>'{data,sessionExecutions}') item
      WHERE item->>'id'=p_entity_id::text
    ) INTO v_legacy;
  END IF;

  RETURN jsonb_build_object(
    'schema','iberfit.qa.m43.bootstrap-visibility.v1',
    'canonicalVisible',v_canonical,'legacyVisible',v_legacy
  );
END
$probe$;

REVOKE ALL ON FUNCTION public.iberfit_qa_m43_bootstrap_visibility_v1(text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iberfit_qa_m43_bootstrap_visibility_v1(text,uuid)
  TO authenticated;

DO $readback$
DECLARE v_oid regprocedure := 'public.iberfit_qa_m43_bootstrap_visibility_v1(text,uuid)'::regprocedure;
BEGIN
  IF (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment')
       IS DISTINCT FROM 'QA'
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM false
     OR (SELECT provolatile FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM 's'
     OR (SELECT proconfig FROM pg_proc WHERE oid=v_oid)
       IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR has_function_privilege('anon',v_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
  THEN RAISE EXCEPTION 'P0_QA_M43_MINIMAL_VISIBILITY_READBACK_FAILED'
    USING ERRCODE='42501'; END IF;
END
$readback$;
