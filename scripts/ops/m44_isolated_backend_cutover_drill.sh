#!/usr/bin/env bash
# M44 REAL PROD BACKEND: test full owner/ACL restore and the exact U72/U60 +
# Coach invite install/rollback on a disposable LOCAL database, never PROD/QA.
# A passing result proves SQL reversibility only, not Auth/JWT/Vault/Edge runtime.
set -euo pipefail
fail(){ echo "M44_ISOLATED_BACKEND_DRILL_$1" >&2; exit 71; }
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux &&
   "${M44_SQL_DRILL_ENABLED:-}" == true ]] || fail ISOLATED_RUNNER_REQUIRED
[[ "${PGHOST:-}" == 127.0.0.1 && "${PGPORT:-}" == 5432 &&
   "${PGUSER:-}" == supabase_admin &&
   "${PGDATABASE:-}" == iberfit_recovery_acl_test ]] || fail POSTGRES_TARGET_INVALID
[[ -n "${PGPASSWORD:-}" && -z "${IBERFIT_PROD_DATABASE_URL:-}" &&
   -z "${SUPABASE_ACCESS_TOKEN:-}" && -z "${IBERFIT_PROD_STORAGE_SERVICE_KEY:-}" ]] ||
 fail PRODUCTION_CONNECTION_OR_TOKEN_PRESENT
[[ "$#" == 1 && -n "${RUNNER_TEMP:-}" &&
   "$1" == "$RUNNER_TEMP/iberfit-recovery/isolated" ]] || fail RESTORE_PATH_INVALID
work="$1"
[[ -d "$work" && ! -L "$work" && -f "$work/database.pgcustom" &&
   ! -L "$work/database.pgcustom" ]] || fail PG17_ARCHIVE_INVALID
[[ -f "$work/global-roles.sql" && ! -L "$work/global-roles.sql" ]] ||
 fail GLOBAL_ROLES_MISSING
[[ "$(docker inspect --format '{{.State.Running}}' iberfit-m44-local-restore 2>/dev/null)" == true ]] ||
 fail ISOLATED_PG17_NOT_RUNNING
[[ "$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostIp}}' iberfit-m44-local-restore 2>/dev/null)" == 127.0.0.1 ]] ||
 fail ISOLATED_PG17_NOT_LOOPBACK
for file in \
  20261117_m1_u72_prod_guarded_materialized_v1.sql \
  20261117_m1_u72_prod_guarded_materialized_v1.rollback.sql \
  20261112_m1_u60_prod_guarded_enable.sql \
  20261112_m1_u60_prod_guarded_disable.sql; do
 [[ -f "supabase/release-procedures/$file" ]] || fail RELEASE_SQL_MISSING
done
[[ -f supabase/migrations/20261117235000_coach_scoped_hosted_invitation_v1.sql &&
   -f supabase/rollbacks/20261117235000_coach_scoped_hosted_invitation_v1.rollback.sql ]] ||
 fail COACH_ROLLBACK_SQL_MISSING
umask 077
out="$work/backend-drill-private"
mkdir -m 700 -p "$out"
test -d "$out" || fail PRIVATE_LOG_DIR_REQUIRED
# All commands in this script point at the *same local* 127.0.0.1:5432.
db(){ docker run --rm --network host -e PGPASSWORD -e PGHOST -e PGPORT \
 -e PGUSER -e PGDATABASE \
 -v "$work:/backup:ro" \
 -v "$PWD/supabase/release-procedures:/release:ro" \
 -v "$PWD/supabase/migrations:/migrations:ro" \
 -v "$PWD/supabase/rollbacks:/rollbacks:ro" \
 postgres:17-alpine "$@"; }
check_sql(){
 local code="$1" query="$2" observed
 observed="$(db psql -X -t -A -v ON_ERROR_STOP=1 -c "$query" 2>"$out/check-$code.log")" ||
  fail "SQL_CHECK_$code"
 [[ "$observed" == 1 ]] || fail "SQL_ASSERTION_$code"
}
apply(){
 local code="$1" pathname="$2" policy sqlstate
 # Execute migration SQL as the restored owner, never as supabase_admin.
 # This psql client targets only the localhost isolated recovery database.
 if ! db psql -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose \
    -c 'SET ROLE postgres' -f "$pathname" \
    >"$out/apply-$code.log" 2>&1; then
   policy="$(grep -Eo 'M1_U72_[A-Z0-9_]+|U60_[A-Z0-9_]+|M26_COACH_INVITE_[A-Z0-9_]+' "$out/apply-$code.log" | head -n 1 || true)"
   if [[ "$policy" =~ ^(M1_U72_|U60_|M26_COACH_INVITE_)[A-Z0-9_]{3,80} ]]; then
     echo "M44_LOCAL_SQL_POLICY_DENIAL:$code:$policy" >&2
   fi
   sqlstate="$(grep -Eo 'ERROR:[[:space:]]+[0-9A-Z]{5}' "$out/apply-$code.log" | tail -n 1 | awk '{print $2}' || true)"
   if [[ "$sqlstate" =~ ^[0-9A-Z]{5} ]]; then
     echo "M44_LOCAL_SQL_APPLY_SQLSTATE:$code:$sqlstate" >&2
   else
     echo "M44_LOCAL_SQL_APPLY_SQLSTATE:$code:UNAVAILABLE" >&2
   fi
   fail "SQL_APPLY_$code"
 fi
}
# On the REAL Supabase PG17 snapshot, some owner/ACL roles may be absent
# from a fresh local Supabase image. Reconcile NAMES ONLY, using inert
# NOLOGIN placeholders. NEVER replay archived options or role memberships,
# never create a login or treat this as successful hosted Auth recovery.
# This is a strictly isolated prerequisite before owner+ACL restore.
db psql -X -A -t -v ON_ERROR_STOP=1 -d postgres \
  -c "SELECT rolname FROM pg_catalog.pg_roles WHERE rolname NOT LIKE 'pg_%' ORDER BY rolname" \
  >"$out/existing-roles.txt" 2>"$out/role-catalog-private.log" || fail LOCAL_ROLE_CATALOG_FAILED
node scripts/ops/m44_prepare_missing_local_roles.mjs \
  "$work/global-roles.sql" "$out/existing-roles.txt" "$out/missing-role-ddl.sql" \
  >"$out/role-plan-private.log" 2>&1 || fail ROLE_PLAN_REJECTED
if ! db psql -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
  -d postgres -f /backup/backend-drill-private/missing-role-ddl.sql \
  >"$out/role-create-private.log" 2>&1; then
  # SQLSTATE-only diagnostics; no SQL statements, role names or private paths.
  state="$(grep -Eo 'ERROR:[[:space:]]+[0-9A-Z]{5}' "$out/role-create-private.log" \
    | tail -n 1 | grep -Eo '[0-9A-Z]{5}$' || true)"
  if [[ "$state" =~ ^[0-9A-Z]{5}$ ]]; then
    echo "M44_LOCAL_ROLE_PLACEHOLDERS_SQLSTATE:$state" >&2
  else
    echo 'M44_LOCAL_ROLE_PLACEHOLDERS_SQLSTATE:UNAVAILABLE' >&2
  fi
  fail LOCAL_ROLE_PLACEHOLDERS_FAILED
fi
echo 'M44_LOCAL_ROLE_PLACEHOLDERS_NOLOGIN_ONLY'
# Recover the genuine production executor's BYPASSRLS/CREATEROLE and
# memberships, but NEVER LOGIN or passwords in the isolated PG17 cluster.
# The archived pg_dumpall source must match the audited nine-role baseline.
node scripts/ops/m44_reconcile_postgres_executor.mjs \
  "$work/global-roles.sql" "$out/postgres-owner-restore.sql" \
  >"$out/postgres-owner-plan-private.log" 2>&1 || fail LOCAL_OWNER_ROLE_PLAN_DENIED
db psql -X -q -v ON_ERROR_STOP=1 -d postgres \
  -f /backup/backend-drill-private/postgres-owner-restore.sql \
  >"$out/postgres-owner-restore-private.log" 2>&1 || fail LOCAL_OWNER_ROLE_REPLAY_DENIED
owner_ok="$(db psql -X -A -t -v ON_ERROR_STOP=1 -d postgres \
  -c "SELECT (EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres' AND
    NOT rolcanlogin AND NOT rolsuper AND rolcreatedb AND rolcreaterole
    AND rolreplication AND rolbypassrls) AND
    (SELECT count(*) FROM pg_auth_members WHERE member='postgres'::regrole
      AND roleid IN ('anon'::regrole,'authenticated'::regrole,
        'authenticator'::regrole,'pg_create_subscription'::regrole,
        'pg_monitor'::regrole,'pg_read_all_data'::regrole,
        'pg_signal_backend'::regrole,'service_role'::regrole,
        'supabase_privileged_role'::regrole)
      AND admin_option=(roleid<>'supabase_privileged_role'::regrole)
      AND inherit_option AND set_option)=9)::int;" \
  2>"$out/postgres-owner-verify-private.log")" || fail LOCAL_OWNER_ROLE_READBACK_FAILED
[[ "$owner_ok" == 1 ]] || fail LOCAL_OWNER_ROLE_ATTRIBUTES_DRIFT
echo 'M44_ISOLATED_POSTGRES_EXECUTOR_PARITY_NOLOGIN_VERIFIED_ONLY'

# This is a NEW database in the already isolated local service; unlike the
# initial M44 data-only proof, owners and ACL are not disabled.
db createdb "$PGDATABASE" >"$out/createdb.log" 2>&1 || fail FRESH_DATABASE_CREATION_FAILED
if ! db pg_restore --exit-on-error -d "$PGDATABASE" /backup/database.pgcustom \
  >"$out/pg-restore-full-acl.log" 2>&1; then
  # Categorize privately; never log object identifiers, names or SQL.
  if grep -Eqi 'role [^[:space:]]+ does not exist' "$out/pg-restore-full-acl.log"; then
    echo 'M44_BACKEND_DRILL_RESTORE_FAILURE_CLASS:OWNER_ROLE_MISSING' >&2
  elif grep -Eqi 'permission denied|must be owner' "$out/pg-restore-full-acl.log"; then
    echo 'M44_BACKEND_DRILL_RESTORE_FAILURE_CLASS:LOCAL_PRIVILEGES' >&2
  elif grep -Eqi 'already exists' "$out/pg-restore-full-acl.log"; then
    echo 'M44_BACKEND_DRILL_RESTORE_FAILURE_CLASS:OBJECT_CONFLICT' >&2
  else
    echo 'M44_BACKEND_DRILL_RESTORE_FAILURE_CLASS:OTHER' >&2
  fi
  fail FULL_OWNER_ACL_RESTORE_FAILED
fi
echo 'M44_REAL_SNAPSHOT_FULL_OWNER_ACL_RESTORED_ISOLATED_ONLY'
check_sql BASELINE "SELECT (
 (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment')='PRODUCTION'
 AND md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))='5914acf371015a6bbeeaf95f99e056e3'
 AND pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))='postgres'
 AND to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NULL
 AND NOT has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
 AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.training_session_occurrences_v1'::regclass)
 AND NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1 WHERE status='en_curso')
)::int;"
# No identifiers/row data are logged; compare only counts of protected tables.
count_query="SELECT
 (SELECT count(*) FROM auth.users)::text||','||
 (SELECT count(*) FROM auth.sessions)::text||','||
 (SELECT count(*) FROM public.training_session_occurrences_v1)::text||','||
 (SELECT count(*) FROM public.session_executions)::text||','||
 (SELECT count(*) FROM public.client_access_v26)::text||','||
 (SELECT count(*) FROM vault.secrets)::text;"
before="$(db psql -X -t -A -v ON_ERROR_STOP=1 -c "$count_query" 2>"$out/count-source.log")" ||
 fail SOURCE_COUNTS_FAILED
apply U72_INSTALL /release/20261117_m1_u72_prod_guarded_materialized_v1.sql
check_sql U72_INSTALLED "SELECT (
 to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NOT NULL
 AND md5(pg_get_functiondef('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)'::regprocedure))='1270cf1db8c9a162ccc5736207a258e1'
 AND md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))='944aaac897289954a9c589292d8faf87'
 AND NOT has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
)::int;"
apply U60_ENABLE /release/20261112_m1_u60_prod_guarded_enable.sql
check_sql U60_OPEN "SELECT (
 has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
)::int;"
apply U60_DISABLE /release/20261112_m1_u60_prod_guarded_disable.sql
check_sql U60_CLOSED "SELECT (
 NOT has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
)::int;"
apply U72_ROLLBACK /release/20261117_m1_u72_prod_guarded_materialized_v1.rollback.sql
check_sql U72_RESTORED "SELECT (
 to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NULL
 AND md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))='5914acf371015a6bbeeaf95f99e056e3'
 AND NOT has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
)::int;"
# Test Coach installation and rollback as a separate exact transaction.
before_coach="$(db psql -X -t -A -v ON_ERROR_STOP=1 -c \
 "SELECT md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure));" \
 2>"$out/coach-source.log")" || fail COACH_BASELINE_UNAVAILABLE
apply COACH_INSTALL /migrations/20261117235000_coach_scoped_hosted_invitation_v1.sql
check_sql COACH_INSTALLED "SELECT (to_regprocedure('private.iberfit_coach_invite_source_guard_v1()') IS NOT NULL)::int;"
apply COACH_ROLLBACK /rollbacks/20261117235000_coach_scoped_hosted_invitation_v1.rollback.sql
check_sql COACH_RESTORED "SELECT (to_regprocedure('private.iberfit_coach_invite_source_guard_v1()') IS NULL)::int;"
after_coach="$(db psql -X -t -A -v ON_ERROR_STOP=1 -c \
 "SELECT md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure));" \
 2>"$out/coach-after.log")" || fail COACH_READBACK_UNAVAILABLE
[[ "$before_coach" == "$after_coach" ]] || fail COACH_SOURCE_CHANGED
after="$(db psql -X -t -A -v ON_ERROR_STOP=1 -c "$count_query" 2>"$out/count-after.log")" ||
 fail RESTORED_COUNTS_FAILED
[[ "$before" == "$after" ]] || fail CUSTOMER_OR_AUTH_TABLE_COUNT_DRIFT
echo M44_REAL_PROD_BACKEND_SQL_INSTALL_AND_ROLLBACK_ISOLATED_ONLY
echo M44_HOSTED_AUTH_VAULT_EDGE_RUNTIME_NOT_CERTIFIED
