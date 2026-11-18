-- QA-only guarded rollout, never enable production.
DO $p0_on$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
 OR (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='free_client_completed_execution_details_demand_qa_v1') IS DISTINCT FROM 'true'
 OR md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure)) IS DISTINCT FROM '2dd44be13127df848e335c33febfd183'
 OR md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure)) IS DISTINCT FROM 'e460264e965db3688709101bc30e10fa'
 OR md5(pg_get_functiondef('public.iberfit_m43_client_safe_execution_v1(jsonb)'::regprocedure)) IS DISTINCT FROM '29f09c54467ac50aaa91bce79ebe5680'
 OR md5(pg_get_functiondef('public.iberfit_m43_client_scalar_fields_v1(jsonb,text[])'::regprocedure)) IS DISTINCT FROM '34df411a2b9ce5b60635d6db84ecd240'
 OR md5(pg_get_functiondef('public.iberfit_client_completed_history_page_free_v1(text,timestamptz,jsonb,bigint,text,integer)'::regprocedure)) IS DISTINCT FROM 'a254291ca0e199d176b10aefa8b2fd61'
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE lower(email)='qa.rc74.client-a@iberfit.cl')
 THEN RAISE EXCEPTION 'P0_QA_EXEC_ENABLE_GUARD_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.iberfit_system_settings(key,value)
 VALUES('free_client_completed_execution_scalar_fast_v1','true'::jsonb)
 ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
END
$p0_on$;
