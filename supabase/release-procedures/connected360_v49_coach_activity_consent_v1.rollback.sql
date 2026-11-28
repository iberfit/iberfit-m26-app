-- Disable all new public/private callable surfaces; retain consent records
-- and invalidation triggers. No deletion of user data or prior consent state.
BEGIN;
SET LOCAL lock_timeout='3s';
REVOKE ALL ON FUNCTION public.m26_wearable_v49_set_coach_consent_v1(uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.m26_wearable_v49_my_coach_consent_status_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.m26_wearable_v49_coach_exercise_days_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.m26_v49_set_coach_consent(uuid,uuid,integer,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.m26_v49_my_coach_consent_status(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.m26_v49_coach_exercise_days(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.m26_wearable_v49_my_coach_recipients_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.m26_v49_my_coach_recipients() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
