-- Production V46 dormant schema rollback; protects all stored measurements.
-- Operational rollback for a future enabled writer must first revoke EXECUTE.
BEGIN;
DO $guard$
BEGIN
  IF to_regclass('public.m26_wearable_exercise_evidence_v46') IS NULL
    OR to_regclass('public.m26_wearable_heart_rate_daily_v46') IS NULL THEN
    RAISE EXCEPTION 'M26_V46_PROD_ROLLBACK_REVIEW_SCHEMA_FIRST';
  END IF;
  IF EXISTS (SELECT 1 FROM public.m26_wearable_exercise_evidence_v46 LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.m26_wearable_heart_rate_daily_v46 LIMIT 1) THEN
    RAISE EXCEPTION 'M26_V46_PROD_ROLLBACK_HAS_HEALTH_DATA_PRESERVE';
  END IF;
  IF to_regprocedure('public.m26_wearable_v46_import_explicit_qa_v1(uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'M26_V46_PROD_ROLLBACK_WRITER_EXISTS';
  END IF;
END;$guard$;
DROP TABLE public.m26_wearable_exercise_evidence_v46;
DROP TABLE public.m26_wearable_heart_rate_daily_v46;
COMMIT;
