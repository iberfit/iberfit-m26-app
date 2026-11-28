-- Disable and remove the writer only; preserve all observations and grants.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.m26_wearable_v46_release_control_prod IN ACCESS EXCLUSIVE MODE;
UPDATE public.m26_wearable_v46_release_control_prod SET apple_exercise_enabled=false WHERE id=true;
DROP FUNCTION public.m26_wearable_v54_import_apple_exercise_v1(uuid,jsonb);
DROP FUNCTION private.m26_v54_import_apple_exercise(uuid,jsonb);
DROP FUNCTION private.m26_v54_apple_workout_valid(jsonb,timestamptz);
COMMIT;
