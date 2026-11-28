-- Disable the longitudinal API only, preserving recorded decisions and history.
BEGIN;
REVOKE ALL ON FUNCTION public.m26_wearable_v58_set_apple_coach_trend_consent_v1(uuid,uuid,integer,boolean),private.m26_v58_set_apple_coach_trend_consent(uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.m26_wearable_v58_my_apple_coach_trend_recipients_v1(),private.m26_v58_my_apple_coach_trend_recipients() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.m26_wearable_v58_apple_coach_trends_v1(uuid,integer),private.m26_v58_apple_coach_trends(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
