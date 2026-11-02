-- QA-only instant functional rollback: feature flag disabled, no DDL.
DO $p0_disable$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings
      WHERE key='environment') IS DISTINCT FROM 'QA' THEN
   RAISE EXCEPTION 'P0_QA_PROJECT_ONLY' USING ERRCODE='42501';
 END IF;
 UPDATE public.iberfit_system_settings
 SET value='false'::jsonb
 WHERE key='free_client_body_envelope_compact_v1';
END
$p0_disable$;
