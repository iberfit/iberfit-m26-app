#!/usr/bin/env bash
# Exact release installers on a new local synthetic PG17 only. Never hosted.
set -Eeuo pipefail
if [[ "${IBERFIT_PG17_SYNTHETIC_ONLY:-}" != YES || "${PGHOST:-}" != 127.0.0.1 ||
      "${PGPORT:-}" != 5432 || "${PGUSER:-}" != postgres ||
      "${PGDATABASE:-}" != postgres || ! "${PGPASSWORD:-}" =~ ^[a-f0-9]{64}$ ]]; then
  echo 'CONNECTED360_CHAIN_ISOLATED_PG17_ONLY' >&2
  exit 65
fi
psql_synthetic(){
  docker run --interactive --rm --network host \
    -e PGPASSWORD -e PGHOST -e PGPORT -e PGUSER -e PGDATABASE \
    -v "$PWD:/repo:ro" postgres:17-alpine psql -X -q -v ON_ERROR_STOP=1 "$@"
}
psql_synthetic <<'SQL'
DO $guard$
BEGIN
 IF current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('auth','private','gx_test'))
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f'))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
 THEN RAISE EXCEPTION 'CONNECTED360_CHAIN_FRESH_PG17_REQUIRED'; END IF;
END
$guard$;
SQL
psql_synthetic -f /repo/qa/sql/connected360-release-chain/legacy_fixture.sql
psql_synthetic -f /repo/supabase/migrations/20261008190500_connected360_authorization_provider_domain_v5.sql
psql_synthetic -f /repo/supabase/migrations/20261012070000_connected360_v46_production_closed_staging.sql
psql_synthetic -f /repo/supabase/migrations/20261012160000_connected360_production_native_e2e_macro.sql
psql_synthetic -f /repo/supabase/migrations/20261012230000_connected360_v47_prod_daily_health_macro.sql
psql_synthetic -f /repo/supabase/migrations/20261103114500_connected360_v47_bounded_owner_history_read.sql
psql_synthetic -f /repo/supabase/migrations/20261111131000_connected360_v47_last_seven_owner_history.sql
psql_synthetic -f /repo/qa/sql/connected360-release-chain/baseline_fingerprints.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v48_owner_activity_history_v1.sql
# Certify exact V48 inverse before any dependent stage; then reinstall.
psql_synthetic -f /repo/supabase/release-procedures/connected360_v48_owner_activity_history_v1.rollback.sql
psql_synthetic -c "SELECT gx_test.assert(md5(pg_get_functiondef('public.m26_wearable_v46_my_summary_prod_v1()'::regprocedure))='6dbbb0b2fb17b97fb10cdfb4a158dd33' AND to_regprocedure('public.m26_wearable_v48_my_activity_page_prod_v1(timestamptz,uuid)') IS NULL,'V48 exact rollback');"
v48_install=/repo/supabase/release-procedures/connected360_v48_owner_activity_history_v1.sql
psql_synthetic -f "$v48_install"
echo 'CONNECTED360_V48_EXACT_ROLLBACK_REINSTALL_SUCCESS'
psql_synthetic -f /repo/supabase/release-procedures/connected360_v49_coach_activity_consent_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v50_provider_selective_cleanup_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v51_exercise_storage_v1.sql
# Certify both directions before V52, including private guard and complete rollback.
psql_synthetic -c "SELECT gx_test.assert(NOT has_function_privilege('authenticated','private.m26_v51_assert_storage_prerequisites()','EXECUTE') AND NOT has_function_privilege('service_role','private.m26_v51_assert_storage_prerequisites()','EXECUTE'),'V51 guard inaccessible');"
psql_synthetic -f /repo/supabase/release-procedures/connected360_v51_exercise_storage_v1.rollback.sql
psql_synthetic -c "SELECT gx_test.assert(to_regprocedure('private.m26_v51_assert_storage_prerequisites()') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.m26_wearable_exercise_evidence_v46'::regclass AND attname='active_seconds' AND NOT attisdropped),'V51 exact storage rollback');"
v51_install=/repo/supabase/release-procedures/connected360_v51_exercise_storage_v1.sql
psql_synthetic -f "$v51_install"
echo 'CONNECTED360_V51_ROLLBACK_REINSTALL_SUCCESS'
psql_synthetic -f /repo/supabase/release-procedures/connected360_v52_android_swimming_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v53_apple_exercise_authorization_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v54_apple_exercise_import_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v55_apple_owner_history_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v56_apple_coach_consent_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v57_apple_owner_trends_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v58_apple_coach_trends_v1.sql
echo 'CONNECTED360_V48_V58_EXACT_INSTALLERS_SUCCESS'
psql_synthetic -f /repo/qa/sql/connected360-release-chain/role_lifecycle.sql
psql_synthetic -f /repo/qa/sql/connected360-release-chain/android_isolation.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v58_apple_coach_trends_v1.rollback.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v57_apple_owner_trends_v1.rollback.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v56_apple_coach_consent_v1.rollback.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v55_apple_owner_history_v1.rollback.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v54_apple_exercise_import_v1.rollback.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v49_coach_activity_consent_v1.rollback.sql
psql_synthetic -f /repo/qa/sql/connected360-release-chain/disabled_surfaces.sql
echo 'CONNECTED360_V48_V58_SYNTHETIC_ROLE_LIFECYCLE_AND_DISABLE_SUCCESS'
