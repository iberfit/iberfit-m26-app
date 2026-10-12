-- QA ONLY rollback; refuse to discard even one heart-rate observation.
-- If any newly introduced field is in use, STOP and create a data-preserving migration.
BEGIN;
DO $guard$
BEGIN
  IF to_regclass('public.m26_wearable_source_daily_v45') IS NULL THEN
    RAISE EXCEPTION 'M26_CONNECTED360_V45_BASE_SCHEMA_MISSING';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.m26_wearable_source_daily_v45
    WHERE general_heart_rate_samples IS NOT NULL
       OR general_heart_rate_min_bpm IS NOT NULL
       OR general_heart_rate_max_bpm IS NOT NULL
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'M26_CONNECTED360_V45_GENERAL_HR_ROLLBACK_DATA_PRESENT';
  END IF;
END;
$guard$;

ALTER TABLE public.m26_wearable_source_daily_v45
  DROP CONSTRAINT m26_wearable_source_daily_v45_nonempty_metric;
ALTER TABLE public.m26_wearable_source_daily_v45
  ADD CONSTRAINT m26_wearable_source_daily_v45_nonempty_metric
    CHECK (
      steps IS NOT NULL OR active_minutes IS NOT NULL OR
      sleep_minutes IS NOT NULL OR resting_heart_rate IS NOT NULL OR
      hrv_ms IS NOT NULL OR active_energy_kcal IS NOT NULL OR
      workout_minutes IS NOT NULL
    );
ALTER TABLE public.m26_wearable_source_daily_v45
  DROP CONSTRAINT m26_wearable_source_daily_v45_general_hr_bounds,
  DROP COLUMN general_heart_rate_samples,
  DROP COLUMN general_heart_rate_min_bpm,
  DROP COLUMN general_heart_rate_max_bpm;
COMMIT;
