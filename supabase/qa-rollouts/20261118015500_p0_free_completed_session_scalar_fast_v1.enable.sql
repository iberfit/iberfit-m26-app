-- P0 #1209 · manual QA-only rollout after source and client-owner equivalence proof.
DO $rollout$
BEGIN
 IF (SELECT s.value#>>'{}' FROM public.iberfit_system_settings s WHERE s.key='environment') IS DISTINCT FROM 'QA'
  OR md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure)) IS DISTINCT FROM 'edeb0f40727e033ff0f85721fd6f7b93'
  OR md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure)) IS DISTINCT FROM '004eadbeb59ef8e45a74327ce3b66aba'
  OR NOT EXISTS(SELECT 1 FROM public.iberfit_system_settings s WHERE s.key='free_client_completed_history_demand_qa' AND s.value#>>'{}'='true')
  OR md5(pg_get_functiondef('public.iberfit_m43_client_safe_session_v2(jsonb)'::regprocedure)) IS DISTINCT FROM '2c0f16829cd8731af964f107969f025a'
  OR md5(pg_get_functiondef('public.iberfit_m43_client_scalar_fields_v1(jsonb,text[])'::regprocedure)) IS DISTINCT FROM '34df411a2b9ce5b60635d6db84ecd240'
 THEN RAISE EXCEPTION 'P0_QA_SCALAR_ROLLOUT_GUARD_FAILED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.iberfit_system_settings(key,value)
 VALUES ('free_client_completed_session_scalar_fast_v1','true'::jsonb)
 ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
END
$rollout$;
