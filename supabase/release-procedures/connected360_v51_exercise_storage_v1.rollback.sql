-- CANDIDATE ONLY. Refuse rollback if any new information would be lost.
-- Do not erase data to make rollback possible. Disable future writers first.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.m26_wearable_exercise_evidence_v46 IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure)) <> '5f8d8f5e93d9a09bc66d2af8f1a88bad' THEN
    RAISE EXCEPTION 'M26_V51_V50_REQUIRED';
  END IF;
  IF to_regprocedure('public.m26_wearable_v48_my_activity_page_prod_v1(timestamptz,uuid)') IS NULL
    OR to_regprocedure('public.m26_wearable_v49_coach_exercise_days_v1(uuid)') IS NULL
    OR strpos(pg_get_functiondef('public.m26_wearable_v46_my_summary_prod_v1()'::regprocedure),
      'AND provider=''health_connect'' AND link_status=''unlinked''')=0 THEN
    RAISE EXCEPTION 'M26_V51_PROVIDER_SCOPED_READERS_REQUIRED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.m26_wearable_exercise_evidence_v46'::regclass AND relrowsecurity AND relforcerowsecurity)
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r(role_name)
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) a(action)
      WHERE has_table_privilege(r.role_name,'public.m26_wearable_exercise_evidence_v46',a.action))
    OR EXISTS(SELECT 1 FROM information_schema.column_privileges WHERE table_schema='public'
      AND table_name='m26_wearable_exercise_evidence_v46' AND grantee IN ('anon','authenticated','PUBLIC')) THEN
    RAISE EXCEPTION 'M26_V51_STORAGE_ACL_DRIFT';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_index i
      WHERE i.indexrelid=to_regclass('public.m26_v46_workout_owner_source_uq')
        AND i.indrelid='public.m26_wearable_exercise_evidence_v46'::regclass AND i.indisunique AND i.indisvalid AND i.indisready
        AND i.indpred IS NULL AND i.indexprs IS NULL
        AND pg_get_indexdef(i.indexrelid)='CREATE UNIQUE INDEX m26_v46_workout_owner_source_uq ON public.m26_wearable_exercise_evidence_v46 USING btree (owner_user_id, client_id, provider, source_record_key)') THEN
    RAISE EXCEPTION 'M26_V51_SOURCE_INDEX_DRIFT';
  END IF;
  IF EXISTS(SELECT 1 FROM public.m26_wearable_exercise_evidence_v46 WHERE provider <> 'health_connect' OR sport NOT IN ('running','interval_running','hiit','cycling','walking','strength','other') OR active_seconds IS NOT NULL) THEN
    RAISE EXCEPTION 'M26_V51_ROLLBACK_REQUIRES_DATA_PRESERVATION';
  END IF;
  IF to_regprocedure('public.m26_wearable_v51_import_apple_prod_v1(uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'M26_V51_ROLLBACK_WRITER_PRESENT';
  END IF;
END $guard$;
ALTER TABLE public.m26_wearable_exercise_evidence_v46
  DROP CONSTRAINT m26_v51_apple_workout_minimal_check,
  DROP CONSTRAINT m26_v51_workout_active_seconds_check,
  DROP CONSTRAINT m26_wearable_exercise_evidence_v46_provider_check,
  DROP CONSTRAINT m26_wearable_exercise_evidence_v46_sport_check,
  DROP COLUMN active_seconds,
  ADD CONSTRAINT m26_wearable_exercise_evidence_v46_provider_check CHECK (provider='health_connect'),
  ADD CONSTRAINT m26_wearable_exercise_evidence_v46_sport_check CHECK (sport IN ('running','interval_running','hiit','cycling','walking','strength','other'));
COMMIT;
