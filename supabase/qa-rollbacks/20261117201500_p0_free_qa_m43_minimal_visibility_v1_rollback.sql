-- QA ONLY · manual atomic rollback of minimal M43 bootstrap visibility RPC.
-- No other function, table, user, record, RLS policy or permission is changed.
DO $guard$
DECLARE v_oid regprocedure := to_regprocedure(
  'public.iberfit_qa_m43_bootstrap_visibility_v1(text,uuid)');
BEGIN
  IF (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment')
       IS DISTINCT FROM 'QA'
     OR v_oid IS NULL
     OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM false
     OR has_function_privilege('anon',v_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
  THEN RAISE EXCEPTION 'P0_QA_M43_MINIMAL_VISIBILITY_ROLLBACK_GUARD'
    USING ERRCODE='42501'; END IF;
  EXECUTE 'DROP FUNCTION public.iberfit_qa_m43_bootstrap_visibility_v1(text,uuid)';
END
$guard$;
