-- QA-only emergency off, safe even if source has drifted.
DO $p0_off$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
 THEN RAISE EXCEPTION 'P0_QA_EXEC_DISABLE_NOT_QA' USING ERRCODE='42501'; END IF;
 UPDATE public.iberfit_system_settings SET value='false'::jsonb
 WHERE key='free_client_completed_execution_scalar_fast_v1' AND value#>>'{}'='true';
END
$p0_off$;
