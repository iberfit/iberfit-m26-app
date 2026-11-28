-- The operational rollback intentionally preserves consent ledger and helpers.
-- This is not a claim of structural down-migration after real consent/data.
SELECT gx_test.assert(NOT has_function_privilege('authenticated','public.m26_wearable_v58_apple_coach_trends_v1(uuid,integer)','EXECUTE'),'V58 disabled');
SELECT gx_test.assert(NOT has_function_privilege('authenticated','public.m26_wearable_v56_apple_coach_exercise_days_v1(uuid)','EXECUTE'),'V56 disabled');
SELECT gx_test.assert(NOT has_function_privilege('authenticated','public.m26_wearable_v49_coach_exercise_days_v1(uuid)','EXECUTE'),'V49 disabled');
SELECT gx_test.assert(to_regprocedure('public.m26_wearable_v54_import_apple_exercise_v1(uuid,jsonb)') IS NULL,'V54 writer removed');
SELECT gx_test.assert(to_regprocedure('public.m26_wearable_v55_apple_owner_history_v1(timestamptz,uuid)') IS NULL,'V55 reader removed');
SELECT gx_test.assert(to_regprocedure('public.m26_wearable_v57_apple_owner_trends_v1(integer)') IS NULL,'V57 reader removed');
SELECT gx_test.assert(to_regclass('private.m26_wearable_coach_consent_v49') IS NOT NULL,'ledger retained');
SELECT gx_test.assert((SELECT NOT enabled AND NOT swimming_enabled AND NOT apple_exercise_enabled FROM public.m26_wearable_v46_release_control_prod WHERE id),'switches closed');
