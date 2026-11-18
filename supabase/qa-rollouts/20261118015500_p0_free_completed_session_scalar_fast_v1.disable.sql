-- P0 #1209 · kill-switch without any function, data or privilege change.
DO $disable$
BEGIN
 IF (SELECT s.value#>>'{}' FROM public.iberfit_system_settings s WHERE s.key='environment') IS DISTINCT FROM 'QA'
 THEN RAISE EXCEPTION 'P0_QA_SCALAR_DISABLE_NOT_QA' USING ERRCODE='42501'; END IF;
 UPDATE public.iberfit_system_settings SET value='false'::jsonb
 WHERE key='free_client_completed_session_scalar_fast_v1';
END
$disable$;
