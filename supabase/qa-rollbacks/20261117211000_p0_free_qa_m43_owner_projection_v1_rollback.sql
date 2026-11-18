-- IBERFIT #1209: reversible QA-only removal; no user tables or existing RPC changed.
DO $guard$
DECLARE v_oid regprocedure:=to_regprocedure('public.iberfit_qa_m43_owner_projection_v1(text,uuid)');
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    OR v_oid IS NULL
    OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM false
    OR (SELECT provolatile FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM 's'
    OR has_function_privilege('anon',v_oid,'EXECUTE')
    OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
    OR position('P0_QA_M43_OWNER_PROJECTION_CLIENT_ONLY' in pg_get_functiondef(v_oid))=0
 THEN RAISE EXCEPTION 'P0_QA_M43_OWNER_PROJECTION_ROLLBACK_DRIFT'
      USING ERRCODE='42501';
 END IF;
 EXECUTE 'DROP FUNCTION public.iberfit_qa_m43_owner_projection_v1(text,uuid)';
END
$guard$;
