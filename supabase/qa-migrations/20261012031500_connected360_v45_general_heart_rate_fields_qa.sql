-- IBERFIT Connected360 V45 QA ONLY — general pulse is NOT resting pulse.
-- NEVER move this file into supabase/migrations or enable production health ingestion.
-- No writes to personal measurements are made here; rows in QA must be empty.
-- This migration only defines storage for future, separately authorized daily aggregates.
-- source_record_count denotes source records, NOT HeartRateRecord samples.
BEGIN;

DO $guard$
DECLARE
  v_rls boolean;
  v_force boolean;
BEGIN
  IF to_regclass('public.m26_wearable_source_daily_v45') IS NULL THEN
    RAISE EXCEPTION 'M26_CONNECTED360_V45_BASE_SCHEMA_MISSING';
  END IF;
  SELECT relrowsecurity, relforcerowsecurity
  INTO v_rls, v_force
  FROM pg_class WHERE oid = 'public.m26_wearable_source_daily_v45'::regclass;
  IF v_rls IS DISTINCT FROM true OR v_force IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'M26_CONNECTED360_V45_GENERAL_HR_RLS_REQUIRED';
  END IF;
  IF has_table_privilege('anon','public.m26_wearable_source_daily_v45','INSERT')
     OR has_table_privilege('authenticated','public.m26_wearable_source_daily_v45','INSERT') THEN
    RAISE EXCEPTION 'M26_CONNECTED360_V45_GENERAL_HR_TABLE_ACCESS_UNSAFE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.m26_wearable_source_daily_v45 LIMIT 1) THEN
    RAISE EXCEPTION 'M26_CONNECTED360_V45_GENERAL_HR_EXPECTS_EMPTY_QA_STAGING';
  END IF;
END;
$guard$;

ALTER TABLE public.m26_wearable_source_daily_v45
  ADD COLUMN general_heart_rate_samples integer NULL,
  ADD COLUMN general_heart_rate_min_bpm integer NULL,
  ADD COLUMN general_heart_rate_max_bpm integer NULL;

-- Resting HR remains a wholly separate nullable field and is NEVER backfilled
-- from general pulse minima/averages/maxima.
ALTER TABLE public.m26_wearable_source_daily_v45
  ADD CONSTRAINT m26_wearable_source_daily_v45_general_hr_bounds
    CHECK (
      (general_heart_rate_samples IS NULL
        AND general_heart_rate_min_bpm IS NULL
        AND general_heart_rate_max_bpm IS NULL)
      OR (
        general_heart_rate_samples BETWEEN 1 AND 250000
        AND (
          (general_heart_rate_min_bpm IS NULL
            AND general_heart_rate_max_bpm IS NULL)
          OR
          (general_heart_rate_min_bpm BETWEEN 25 AND 300
            AND general_heart_rate_max_bpm BETWEEN 25 AND 300
            AND general_heart_rate_min_bpm <= general_heart_rate_max_bpm)
        )
      )
    );

-- A future native authorized writer may produce a day with FC general only.
-- Existing V44/V45 metrics remain accepted; this is NOT a writer activation.
ALTER TABLE public.m26_wearable_source_daily_v45
  DROP CONSTRAINT m26_wearable_source_daily_v45_nonempty_metric;
ALTER TABLE public.m26_wearable_source_daily_v45
  ADD CONSTRAINT m26_wearable_source_daily_v45_nonempty_metric
    CHECK (
      steps IS NOT NULL OR active_minutes IS NOT NULL OR
      sleep_minutes IS NOT NULL OR resting_heart_rate IS NOT NULL OR
      hrv_ms IS NOT NULL OR active_energy_kcal IS NOT NULL OR
      workout_minutes IS NOT NULL OR general_heart_rate_samples IS NOT NULL
    );

-- No GRANT, no PUBLIC policy, no RPC, no automatic_sync_certified change,
-- no consent epoch change and no alteration of truthful source timestamps.
COMMIT;
