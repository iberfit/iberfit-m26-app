-- Retain all consent decisions and invalidation triggers; do not change HC.
BEGIN;
-- V58 uses the same private authorization helpers. Disable V58 first.
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname IN ('m26_v58_set_apple_coach_trend_consent','m26_wearable_v58_set_apple_coach_trend_consent_v1','m26_v58_my_apple_coach_trend_recipients','m26_wearable_v58_my_apple_coach_trend_recipients_v1','m26_v58_apple_coach_trends','m26_wearable_v58_apple_coach_trends_v1') AND has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'M26_V56_DISABLE_V58_FIRST'; END IF;
END $guard$;
REVOKE ALL ON FUNCTION public.m26_wearable_v56_set_apple_coach_consent_v1(uuid,uuid,integer,boolean),private.m26_v56_set_apple_coach_consent(uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.m26_wearable_v56_my_apple_coach_recipients_v1(),private.m26_v56_my_apple_coach_recipients() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.m26_wearable_v56_apple_coach_exercise_days_v1(uuid),private.m26_v56_apple_coach_exercise_days(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
