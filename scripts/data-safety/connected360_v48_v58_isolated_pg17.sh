#!/usr/bin/env bash
# Exact release installers on a new local synthetic PG17 only. Never hosted.
set -Eeuo pipefail
if [[ "${IBERFIT_PG17_SYNTHETIC_ONLY:-}" != YES || "${PGHOST:-}" != 127.0.0.1 ||
      "${PGPORT:-}" != 5432 || "${PGUSER:-}" != postgres ||
      "${PGDATABASE:-}" != postgres || "${PGPASSWORD:-}" != synthetic-local-only ]]; then
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
psql_synthetic -f /repo/supabase/release-procedures/connected360_v49_coach_activity_consent_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v50_provider_selective_cleanup_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v51_exercise_storage_v1.sql
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
