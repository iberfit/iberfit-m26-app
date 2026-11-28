-- CANDIDATE ONLY. Do not destroy consent history or exercise data.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.m26_wearable_v46_release_control_prod IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.m26_wearable_v46_consents_prod IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.m26_wearable_v46_release_control_prod WHERE apple_exercise_enabled)
 OR EXISTS(SELECT 1 FROM public.m26_wearable_v46_consents_prod WHERE provider='apple_health')
 OR EXISTS(SELECT 1 FROM public.m26_wearable_exercise_evidence_v46 WHERE provider='apple_health')
 OR to_regprocedure('public.m26_wearable_v54_import_apple_exercise_v1(uuid,jsonb)') IS NOT NULL
 THEN RAISE EXCEPTION 'M26_V53_ROLLBACK_REQUIRES_DATA_PRESERVATION'; END IF;
END $guard$;
DROP FUNCTION public.m26_wearable_v53_apple_exercise_status_v1();
DROP FUNCTION private.m26_v53_apple_exercise_status();
DROP FUNCTION public.m26_wearable_v53_authorize_apple_exercise_v1(uuid,bigint,boolean);
DROP FUNCTION private.m26_v53_authorize_apple_exercise(uuid,bigint,boolean);
DROP FUNCTION private.m26_v53_apple_client_context();
ALTER TABLE public.m26_wearable_v46_consents_prod DROP CONSTRAINT m26_wearable_v46_consents_prod_provider_check,
 ADD CONSTRAINT m26_wearable_v46_consents_prod_provider_check CHECK (provider='health_connect');
ALTER TABLE public.m26_wearable_v46_release_control_prod DROP COLUMN apple_exercise_enabled;
COMMIT;
