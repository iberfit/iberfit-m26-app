-- QA-only guarded ENABLE. No training data changes.
DO $rollout$
BEGIN
 IF (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
  OR md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure)) IS DISTINCT FROM '88220acc54e26bb1ee91332d9b89a3b3'
  OR md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure)) IS DISTINCT FROM '0813cbe612bf24b2f08f99bf42a96662'
  OR md5(pg_get_functiondef('public.iberfit_client_completed_history_page_free_v1(text,timestamptz,jsonb,bigint,text,integer)'::regprocedure)) IS DISTINCT FROM 'ae01c1771319b99f0404612a4b84fd2a'
 THEN RAISE EXCEPTION 'P0_FREE_QA_ROLLOUT_DRIFT' USING ERRCODE='42501'; END IF;
 INSERT INTO public.iberfit_system_settings(key,value,updated_at)
 VALUES('free_client_completed_execution_details_demand_qa_v1','true'::jsonb,now())
 ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at;
END
$rollout$;