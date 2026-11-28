-- CANDIDATE ONLY. Refuse rollback if any new information would be lost.
-- Do not erase data to make rollback possible. Disable future writers first.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.m26_wearable_exercise_evidence_v46 IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  -- Refuse a missing, replaced or exposed guard rather than bypassing it.
  IF to_regprocedure('private.m26_v51_assert_storage_prerequisites()') IS NULL THEN RAISE EXCEPTION 'M26_V51_ROLLBACK_GUARD_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='private.m26_v51_assert_storage_prerequisites()'::regprocedure AND (md5(p.prosrc) IS DISTINCT FROM '896c0c14d899c8652b60659ac55d9cb3' OR p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]))
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r(role_name) WHERE has_function_privilege(r.role_name,'private.m26_v51_assert_storage_prerequisites()','EXECUTE'))
    OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='private.m26_v51_assert_storage_prerequisites()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')
    THEN RAISE EXCEPTION 'M26_V51_ROLLBACK_GUARD_DRIFT'; END IF;
  PERFORM private.m26_v51_assert_storage_prerequisites();
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
DROP FUNCTION private.m26_v51_assert_storage_prerequisites();
COMMIT;
