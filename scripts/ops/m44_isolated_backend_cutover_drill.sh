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
   # Diagnostic is strictly numeric/source-category; never print SQL,
   # restored role names, object names or private error messages.
   local source_line failure_class
   source_line="$(grep -Eo 'psql:/(release|migrations|rollbacks)/[A-Za-z0-9_.-]+:[0-9]{1,4}:' \
     "$out/apply-$code.log" | tail -n 1 | grep -Eo '[0-9]{1,4}' | tail -n 1 || true)"
   if [[ "$source_line" =~ ^[0-9]{1,4}$ ]]; then
     echo "M44_LOCAL_SQL_FAILURE_SOURCE_LINE:$code:$source_line" >&2
   fi
   failure_class='OTHER'
   if grep -Eqi 'permission denied to set role' "$out/apply-$code.log"; then
     failure_class='ROLE_SWITCH'
   elif grep -Eqi 'permission denied for schema' "$out/apply-$code.log"; then
     failure_class='SCHEMA_CREATE_ACL'
   elif grep -Eqi 'must be owner|permission denied for function' "$out/apply-$code.log"; then
     failure_class='FUNCTION_OWNERSHIP'
   elif grep -Eqi 'permission denied for relation' "$out/apply-$code.log"; then
     failure_class='TABLE_ACL'
   fi
   echo "M44_LOCAL_SQL_FAILURE_CLASS:$code:$failure_class" >&2
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
# PROD uses database owner postgres and schema public owned by the dynamic
# pg_database_owner role. The throwaway DB was created by supabase_admin:
# without correcting that LOCAL-only owner, SET ROLE postgres lacks CREATE
# on public despite all restored pg_auth_members memberships being correct.
# Never change ownership or privileges in QA/PROD; only this exact local DB.
db psql -X -q -v ON_ERROR_STOP=1 -d postgres \
  -c 'ALTER DATABASE "iberfit_recovery_acl_test" OWNER TO "postgres";' \
  >"$out/local-database-owner-private.log" 2>&1 || fail LOCAL_DB_OWNER_PARITY_DENIED
database_owner_ok="$(db psql -X -A -t -v ON_ERROR_STOP=1 -d "$PGDATABASE" \
  -c "SELECT (
    current_database()='iberfit_recovery_acl_test'
    AND (SELECT pg_get_userbyid(datdba)='postgres' FROM pg_database
      WHERE datname=current_database())
  )::int;" 2>"$out/local-database-owner-check-private.log")" ||
  fail LOCAL_DB_OWNER_READBACK_FAILED
[[ "$database_owner_ok" == 1 ]] || fail LOCAL_DB_OWNER_DRIFT
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
# Verify the same effective schema CREATE rights as the actual PROD
# database owner AFTER pg_restore, using the real SQL executor context.
executor_acl="$(db psql -X -q -A -t -v ON_ERROR_STOP=1 -d "$PGDATABASE" \
  -c 'SET ROLE postgres' \
  -c "SELECT (
    current_user='postgres'
    AND has_schema_privilege(current_user,'public','CREATE')
    AND has_schema_privilege(current_user,'private','CREATE')
    AND (SELECT nspowner='pg_database_owner'::regrole FROM pg_namespace
      WHERE nspname='public')
  )::int;" 2>"$out/executor-acl-private.log")" ||
  fail LOCAL_EFFECTIVE_OWNER_ACL_READBACK_FAILED
[[ "$executor_acl" == 1 ]] || fail LOCAL_EFFECTIVE_OWNER_ACL_DRIFT
echo 'M44_ISOLATED_DATABASE_OWNER_AND_EXECUTOR_CREATE_PARITY_VERIFIED_ONLY'
# The live PROD source may be either pre-activation or active; other states
# fail closed. This is a read-only forensic snapshot of an isolated PG17 copy.
check_sql BASELINE "SELECT (
 (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment')='PRODUCTION'
 AND pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))='postgres'
 AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.training_session_occurrences_v1'::regclass)
 AND NOT has_table_privilege('authenticated','public.training_session_occurrences_v1','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('anon','public.training_session_occurrences_v1','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
 AND NOT has_function_privilege('authenticated','private.iberfit_u72_occurrence_pause_resume_v1(jsonb)','EXECUTE')
)::int;"
snapshot_state="$(db psql -X -q -t -A -v ON_ERROR_STOP=1 -c "SELECT CASE
 WHEN md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))='5914acf371015a6bbeeaf95f99e056e3'
  AND to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NULL
  AND NOT has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
  AND NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1 WHERE status='en_curso')
 THEN 'closed'
 WHEN md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))='944aaac897289954a9c589292d8faf87'
  AND md5(pg_get_functiondef('public.iberfit_occurrence_detail_v1(uuid,uuid)'::regprocedure))='00b8ee39c85fd92f593732c055902cf2'
  AND md5(pg_get_functiondef('private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'::regprocedure))='a022c4e11a7431775a5a76b710f17f0d'
  AND md5(pg_get_functiondef('private.iberfit_u60_dated_mirror_receipt_guard_v1()'::regprocedure))='65e675f56c67aa8f9ddc4b36f3a9a73d'
  AND md5(pg_get_functiondef('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)'::regprocedure))='1270cf1db8c9a162ccc5736207a258e1'
  AND md5(pg_get_functiondef('private.iberfit_u31_occurrence_transition_v1(jsonb)'::regprocedure))='6e63f97899c94d94192c23e669cfd347'
  AND md5(pg_get_functiondef('private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)'::regprocedure))='3eb919f3032f7ffed566a203b43ff453'
  AND has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
  AND has_function_privilege('authenticated','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
 THEN 'active'
 ELSE 'invalid' END;" 2>"$out/source-state-private.log")" || fail RELEASE_SOURCE_STATE_READ_FAILED
[[ "$snapshot_state" == closed || "$snapshot_state" == active ]] ||
 fail RELEASE_SOURCE_PARTIAL_OR_DRIFT
echo "M44_REAL_RESTORED_PROD_DATED_STATE_$snapshot_state"_EXACT_ONLY
# P0 M44: test ACTUAL restored production row visibility under the two
# genuine PostgreSQL web roles. Earlier synthetic ACL/RLS fixtures do not prove
# effective protection of restored real tables. Confirm the real six-policy
# inventory instead of falsely assuming these tables have no policies.
# All selects run on disposable
# PG17 with a READ ONLY transaction; no JWT, user identity or customer row is
# printed. This verifies DENIAL with no session, not positive app authorization.
check_sql RESTORED_RLS_SOURCE "SELECT (
 (SELECT count(*) FROM public.client_access_v26)>0
 AND (SELECT count(*) FROM public.session_executions)>0
 AND (SELECT count(*) FROM public.iberfit_system_settings)>0
 AND (SELECT relrowsecurity FROM pg_class
   WHERE oid='public.client_access_v26'::regclass)
 AND (SELECT relrowsecurity FROM pg_class
   WHERE oid='public.session_executions'::regclass)
 AND (SELECT relrowsecurity FROM pg_class
   WHERE oid='public.iberfit_system_settings'::regclass)
 AND (SELECT count(*) FROM pg_catalog.pg_policy
       WHERE polrelid='public.client_access_v26'::regclass)=1
 AND (SELECT count(*) FROM pg_catalog.pg_policy
       WHERE polrelid='public.session_executions'::regclass)=4
 AND (SELECT count(*) FROM pg_catalog.pg_policy
       WHERE polrelid='public.iberfit_system_settings'::regclass)=1
 AND EXISTS (SELECT 1 FROM pg_catalog.pg_policy
       WHERE polrelid='public.client_access_v26'::regclass
         AND polname='client_access_v26_select' AND polcmd='r')
 AND EXISTS (SELECT 1 FROM pg_catalog.pg_policy
       WHERE polrelid='public.session_executions'::regclass
         AND polname='session_executions_read' AND polcmd='r')
 AND EXISTS (SELECT 1 FROM pg_catalog.pg_policy
       WHERE polrelid='public.iberfit_system_settings'::regclass
         AND polname='system_settings_admin_read' AND polcmd='r')
)::int;"
role_rls_denial(){
 local actor="$1" scope="$2" observed settings_check
 [[ "$actor" == anon || "$actor" == authenticated ]] ||
  fail RESTORED_RLS_ROLE_NOT_ALLOWLISTED
 # PROD intentionally denies anon EXECUTE on iberfit_role() used by the
 # public settings RLS policy. Authenticated without JWT must see zero rows.
 settings_check="(SELECT count(*) FROM public.iberfit_system_settings)=0"
 if [[ "$actor" == anon ]]; then
  settings_check="NOT has_function_privilege(current_user,'public.iberfit_role()','EXECUTE')"
 fi
 # The variable SQL fragments are fixed literals below, not user-supplied.
 # Active U60 RPCs deliberately grant EXECUTE to authenticated, but still
 # require JWT/role checks to return any protected business data.
 local u60_authenticated_acl
 u60_authenticated_acl="NOT has_function_privilege(current_user,'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
      AND NOT has_function_privilege(current_user,'public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')"
 if [[ "$actor" == authenticated && "$snapshot_state" == active ]]; then
  u60_authenticated_acl="has_function_privilege(current_user,'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
      AND has_function_privilege(current_user,'public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')"
 fi
 observed="$(db psql -X -q -t -A -v ON_ERROR_STOP=1 \
  -c "BEGIN READ ONLY;
    SET LOCAL ROLE $actor;
    SELECT (
      current_user='$actor'
      AND has_table_privilege(current_user,'public.client_access_v26','SELECT')
      AND has_table_privilege(current_user,'public.iberfit_system_settings','SELECT')
      AND (SELECT count(*) FROM public.client_access_v26)=0
      AND ($settings_check)
      AND NOT has_table_privilege(current_user,
        'public.training_session_occurrences_v1','SELECT')
      AND ($u60_authenticated_acl)
      AND ($scope)
    )::int;
    ROLLBACK;" 2>"$out/real-rls-$actor-private.log")" ||
  fail "RESTORED_RLS_${actor^^}_SQL_FAILED"
 [[ "$observed" == 1 ]] || fail "RESTORED_RLS_${actor^^}_DENIAL_CHANGED"
}
role_rls_denial anon "NOT has_table_privilege(current_user,'public.session_executions','SELECT')"
role_rls_denial authenticated "has_table_privilege(current_user,'public.session_executions','SELECT') AND (SELECT count(*) FROM public.session_executions)=0"
# Direct anon settings SELECT must fail with SQLSTATE EXACTLY 42501.
# Its output and private errors never enter CI, and are removed at cleanup.
if db psql -X -q -t -A -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
    -c 'BEGIN READ ONLY;
        SET LOCAL ROLE anon;
        SELECT count(*) FROM public.iberfit_system_settings;
        ROLLBACK;' \
    >"$out/real-rls-anon-settings-stdout-private.log" \
    2>"$out/real-rls-anon-settings-private.log"; then
  fail RESTORED_RLS_ANON_SETTINGS_UNEXPECTEDLY_READABLE
fi
if ! grep -Eq '^ERROR:[[:space:]]+42501[[:space:]]*$' \
    "$out/real-rls-anon-settings-private.log"; then
  fail RESTORED_RLS_ANON_SETTINGS_UNEXPECTED_DENIAL_CLASS
fi
echo M44_REAL_RESTORED_PROD_ANON_ROLE_HELPER_42501_DENIED_ONLY
echo M44_REAL_RESTORED_PROD_EFFECTIVE_RLS_UNAUTHENTICATED_DENIAL_VERIFIED_ONLY

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
if [[ "$snapshot_state" == closed ]]; then
 # Legacy staged snapshot: genuinely install U72 and rollback, with verified
 # locked ACL before and after. No effect outside the isolated PG17 database.
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
 echo M44_REAL_PROD_BACKEND_SQL_INSTALL_AND_ROLLBACK_ISOLATED_ONLY
else
 # The active production source already contains U72 + autonomous U31/U33.
 # Replaying the old schema installation/rollback would be unsound after
 # historical dated training. Certify the restored functions exactly, and
 # only exercise the supported U60 permission toggle if no workout is live.
 check_sql U72_ACTIVE_RESTORED "SELECT (
  md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))='944aaac897289954a9c589292d8faf87'
  AND md5(pg_get_functiondef('public.iberfit_occurrence_detail_v1(uuid,uuid)'::regprocedure))='00b8ee39c85fd92f593732c055902cf2'
  AND md5(pg_get_functiondef('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)'::regprocedure))='1270cf1db8c9a162ccc5736207a258e1'
  AND md5(pg_get_functiondef('private.iberfit_u31_occurrence_transition_v1(jsonb)'::regprocedure))='6e63f97899c94d94192c23e669cfd347'
  AND md5(pg_get_functiondef('private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)'::regprocedure))='3eb919f3032f7ffed566a203b43ff453'
  AND has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
  AND has_function_privilege('authenticated','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.training_session_occurrences_v1'::regclass)
 )::int;"
 active_count="$(db psql -X -q -t -A -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.training_session_occurrences_v1 WHERE status='en_curso';" 2>"$out/active-executions-private.log")" || fail DATED_EXECUTION_STATUS_READ_FAILED
 [[ "$active_count" =~ ^[0-9]{1,9}$ ]] || fail DATED_EXECUTION_COUNT_INVALID
 if [[ "$active_count" == 0 ]]; then
  # Fail-closed guarded grant revocation and re-enable, exclusively on the
  # disposable local snapshot. This is NOT a U72 schema rollback.
  apply U60_DISABLE_ACTIVE /release/20261112_m1_u60_prod_guarded_disable.sql
  check_sql U60_CLOSED_ACTIVE "SELECT (
   NOT has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
   AND NOT has_function_privilege('authenticated','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
   AND NOT has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
  )::int;"
  apply U60_REENABLE_ACTIVE /release/20261112_m1_u60_prod_guarded_enable.sql
  check_sql U72_ACTIVE_RESTORED_AFTER "SELECT (
   md5(pg_get_functiondef('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)'::regprocedure))='1270cf1db8c9a162ccc5736207a258e1'
   AND md5(pg_get_functiondef('private.iberfit_u31_occurrence_transition_v1(jsonb)'::regprocedure))='6e63f97899c94d94192c23e669cfd347'
   AND md5(pg_get_functiondef('private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)'::regprocedure))='3eb919f3032f7ffed566a203b43ff453'
   AND has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
   AND has_function_privilege('authenticated','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
   AND NOT has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
   AND NOT has_table_privilege('authenticated','public.training_session_occurrences_v1','SELECT,INSERT,UPDATE,DELETE')
  )::int;"
  echo M44_REAL_ACTIVE_U60_GRANT_REVERSAL_RESTORED_ISOLATED_ONLY
 else
  # Preserve active workouts. A source readback and effective RLS denial prove
  # the current state is recoverable without disrupting live training.
  echo M44_ACTIVE_TRAINING_RESTORE_READONLY_NO_GRANT_REVOCATION_ONLY
 fi
 echo M44_REAL_PROD_ACTIVE_U72_U60_RECOVERY_BOUNDARY_VERIFIED_ONLY
fi
# Rehearse both possible real PROD states without touching PROD/QA:
# before rollout: install -> rollback; after rollout: rollback -> reinstall.
# Restoring the CURRENT upgraded backup must not mistake a healthy Coach
# upgrade for source drift. Both paths preserve all user/Auth table counts.
before_coach="$(db psql -X -t -A -v ON_ERROR_STOP=1 -c \
 "SELECT md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure));" \
 2>"$out/coach-source.log")" || fail COACH_BASELINE_UNAVAILABLE
coach_guard_installed="$(db psql -X -t -A -v ON_ERROR_STOP=1 -c \
 "SELECT (to_regprocedure('private.iberfit_coach_invite_source_guard_v1()') IS NOT NULL)::int;" \
 2>"$out/coach-install-state.log")" || fail COACH_INSTALL_STATE_UNAVAILABLE
[[ "$coach_guard_installed" == 0 || "$coach_guard_installed" == 1 ]] ||
 fail COACH_INSTALL_STATE_INVALID
if [[ "$coach_guard_installed" == 1 ]]; then
 check_sql COACH_PREINSTALLED_SOURCE "SELECT (
  md5(pg_get_functiondef('public.iberfit_admin_client_invitation_prepare_v26(uuid,text)'::regprocedure))='c6ce72f2333fbc369b66792b735dc8ef'
  AND md5(pg_get_functiondef('public.iberfit_admin_client_invitation_bind_v26(uuid,uuid)'::regprocedure))='c8bbd63ace0634a4b1ad5f444fdd0d98'
  AND md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure))='168dc6bd262169a58a6d9ff12558078d'
  AND NOT has_function_privilege('anon','public.iberfit_admin_client_invitation_prepare_v26(uuid,text)','EXECUTE')
 )::int;"
 apply COACH_ROLLBACK /rollbacks/20261117235000_coach_scoped_hosted_invitation_v1.rollback.sql
 check_sql COACH_ROLLED_BACK "SELECT (
  to_regprocedure('private.iberfit_coach_invite_source_guard_v1()') IS NULL
  AND md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure))='66743cf255b81523a4733b63d1c98fc0'
 )::int;"
 apply COACH_REINSTALL /migrations/20261117235000_coach_scoped_hosted_invitation_v1.sql
 check_sql COACH_REINSTALLED "SELECT (
  to_regprocedure('private.iberfit_coach_invite_source_guard_v1()') IS NOT NULL
  AND md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure))='168dc6bd262169a58a6d9ff12558078d'
 )::int;"
 echo M44_ISOLATED_COACH_FORWARD_RECOVERY_VERIFIED_ONLY
else
 check_sql COACH_PREINSTALL_SOURCE "SELECT (
  md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure))='66743cf255b81523a4733b63d1c98fc0'
 )::int;"
 apply COACH_INSTALL /migrations/20261117235000_coach_scoped_hosted_invitation_v1.sql
 check_sql COACH_INSTALLED "SELECT (
  to_regprocedure('private.iberfit_coach_invite_source_guard_v1()') IS NOT NULL
  AND md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure))='168dc6bd262169a58a6d9ff12558078d'
 )::int;"
 apply COACH_ROLLBACK /rollbacks/20261117235000_coach_scoped_hosted_invitation_v1.rollback.sql
 check_sql COACH_RESTORED "SELECT (
  to_regprocedure('private.iberfit_coach_invite_source_guard_v1()') IS NULL
  AND md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure))='66743cf255b81523a4733b63d1c98fc0'
 )::int;"
 echo M44_ISOLATED_COACH_ROLLBACK_REHEARSAL_VERIFIED_ONLY
fi
after_coach="$(db psql -X -t -A -v ON_ERROR_STOP=1 -c \
 "SELECT md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure));" \
 2>"$out/coach-after.log")" || fail COACH_READBACK_UNAVAILABLE
[[ "$before_coach" == "$after_coach" ]] || fail COACH_SOURCE_CHANGED
after="$(db psql -X -t -A -v ON_ERROR_STOP=1 -c "$count_query" 2>"$out/count-after.log")" ||
 fail RESTORED_COUNTS_FAILED
[[ "$before" == "$after" ]] || fail CUSTOMER_OR_AUTH_TABLE_COUNT_DRIFT
# In the active lane, no U72 schema rollback is claimed; all restored roles,
# RLS, dated functions and their real grants must match the protected source.
echo M44_HOSTED_AUTH_VAULT_EDGE_RUNTIME_NOT_CERTIFIED
