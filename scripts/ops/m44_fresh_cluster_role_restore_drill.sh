#!/usr/bin/env bash
# Synthetic-only, fresh PostgreSQL 17 cluster recovery. Never use real data.
set -euo pipefail
if [[ "${IBERFIT_M44_FRESH_CLUSTER_SYNTHETIC_ONLY:-}" != true ||
      "${GITHUB_ACTIONS:-}" != true || "${RUNNER_OS:-}" != Linux ]]; then
 echo 'IBERFIT_M44_FRESH_CLUSTER_ISOLATION_REQUIRED' >&2; exit 60
fi
for key in IBERFIT_PROD_DATABASE_URL SUPABASE_ACCESS_TOKEN SUPABASE_SERVICE_ROLE_KEY; do
 if [[ -n "${!key:-}" ]]; then
  echo 'IBERFIT_M44_FRESH_CLUSTER_PRODUCTION_ENV_FORBIDDEN' >&2; exit 61
 fi
done
umask 077
work="$(mktemp -d)"
chmod 700 "$work"
src="iberfit-m44-fresh-source-${GITHUB_RUN_ID:-synthetic}-${GITHUB_RUN_ATTEMPT:-1}"
dst="iberfit-m44-fresh-target-${GITHUB_RUN_ID:-synthetic}-${GITHUB_RUN_ATTEMPT:-1}"
pass="m44-only-synthetic-cluster-fixture"
cleanup() {
 docker rm -f "$src" "$dst" >/dev/null 2>&1 || true
 rm -rf "$work"
}
trap cleanup EXIT
start() {
 docker run -d --name "$1" --network none \
  -e POSTGRES_USER=supabase_admin -e "POSTGRES_PASSWORD=$pass" \
  -e POSTGRES_DB=postgres -v "$work:/work" \
  supabase/postgres:17.6.1.147 >/dev/null
 [[ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$1")" == none ]]
 [[ -z "$(docker port "$1")" ]]
 local ok=false
 for n in {1..90}; do
  if [[ "$(sql "$1" -c 'SELECT 1' 2>/dev/null || true)" == 1 ]]; then
   ok=true;break
  fi
  sleep 2
 done
 [[ "$ok" == true ]] ||
  { echo 'IBERFIT_M44_FRESH_CLUSTER_START_FAILED' >&2; exit 62; }
}
sql() {
 docker exec -i -e "PGPASSWORD=$pass" "$1" \
  psql -X -A -t -v ON_ERROR_STOP=1 -h 127.0.0.1 -U supabase_admin -d postgres "${@:2}"
}
start "$src"
start "$dst"
[[ "$(sql "$dst" -c "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'iberfit_m44_fresh_%'")" == 0 ]] ||
 { echo 'IBERFIT_M44_FRESH_CLUSTER_TARGET_NOT_CLEAN' >&2; exit 63; }
sql "$src" >"$work/private-setup.log" 2>&1 <<'SQL'
CREATE ROLE iberfit_m44_fresh_owner NOLOGIN;
CREATE ROLE iberfit_m44_fresh_reader NOLOGIN;
CREATE ROLE iberfit_m44_fresh_coach NOLOGIN;
CREATE ROLE iberfit_m44_fresh_intruder NOLOGIN;
GRANT iberfit_m44_fresh_reader TO iberfit_m44_fresh_coach;
CREATE SCHEMA iberfit_m44_fresh_fixture AUTHORIZATION iberfit_m44_fresh_owner;
CREATE TABLE iberfit_m44_fresh_fixture.rows(id integer PRIMARY KEY, tenant_id integer NOT NULL, label text NOT NULL);
ALTER TABLE iberfit_m44_fresh_fixture.rows OWNER TO iberfit_m44_fresh_owner;
INSERT INTO iberfit_m44_fresh_fixture.rows VALUES(1,1,'visible-synthetic'),(2,2,'hidden-synthetic');
ALTER TABLE iberfit_m44_fresh_fixture.rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY m44_fresh_reader_scope ON iberfit_m44_fresh_fixture.rows
 FOR SELECT TO iberfit_m44_fresh_reader USING (tenant_id=1);
GRANT USAGE ON SCHEMA iberfit_m44_fresh_fixture TO iberfit_m44_fresh_reader;
GRANT SELECT ON iberfit_m44_fresh_fixture.rows TO iberfit_m44_fresh_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE iberfit_m44_fresh_owner
 IN SCHEMA iberfit_m44_fresh_fixture GRANT SELECT ON TABLES TO iberfit_m44_fresh_reader;
-- A high-risk SECURITY DEFINER entry point must keep its owner,
-- explicit search_path and restricted EXECUTE grant after pg_restore.
CREATE FUNCTION iberfit_m44_fresh_fixture.visible_row_count()
 RETURNS integer LANGUAGE sql SECURITY DEFINER
 SET search_path = pg_catalog, iberfit_m44_fresh_fixture
 AS 'SELECT count(*)::integer FROM iberfit_m44_fresh_fixture.rows WHERE tenant_id=1';
ALTER FUNCTION iberfit_m44_fresh_fixture.visible_row_count()
 OWNER TO iberfit_m44_fresh_owner;
REVOKE ALL ON FUNCTION iberfit_m44_fresh_fixture.visible_row_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iberfit_m44_fresh_fixture.visible_row_count()
 TO iberfit_m44_fresh_coach;
GRANT USAGE ON SCHEMA iberfit_m44_fresh_fixture TO iberfit_m44_fresh_intruder;
SQL
# Assert the client shares only the source's isolated namespace and can
# reach the synthetic PostgreSQL server before attempting the roles dump.
if ! docker run --rm --network "container:$src" postgres:17-alpine \
 pg_isready -h 127.0.0.1 -p 5432 -U supabase_admin -d postgres \
 > "$work/private-connectivity.log" 2>&1; then
 echo 'IBERFIT_M44_FRESH_CLUSTER_CLIENT_CONNECTIVITY_FAILED' >&2; exit 64
fi
docker run --rm --network "container:$src" \
 -e "PGPASSWORD=$pass" -e PGDATABASE=postgres \
 -e PGHOST=127.0.0.1 -e PGUSER=supabase_admin \
 -v "$work:/work" postgres:17-alpine \
 pg_dumpall --roles-only --no-role-passwords -f /work/global-roles.sql \
 >"$work/private-export.log" 2>&1 ||
 { if grep -Eqi 'permission denied|could not open|read-only file system' "$work/private-export.log"; then
     echo 'IBERFIT_M44_FRESH_CLUSTER_GLOBALS_OUTPUT_DENIED' >&2
   elif grep -Eqi 'superuser|database.*permission|role.*permission' "$work/private-export.log"; then
     echo 'IBERFIT_M44_FRESH_CLUSTER_GLOBALS_DB_DENIED' >&2
   elif grep -Eqi 'unrecognized option|invalid option' "$work/private-export.log"; then
     echo 'IBERFIT_M44_FRESH_CLUSTER_GLOBALS_OPTION_UNSUPPORTED' >&2
   elif grep -Eqi 'not found|not installed|no such file|unknown command' "$work/private-export.log"; then
     echo 'IBERFIT_M44_FRESH_CLUSTER_GLOBALS_CLIENT_UNAVAILABLE' >&2
   elif grep -Eqi 'network|container|daemon|runtime|oci|bridge' "$work/private-export.log"; then
     echo 'IBERFIT_M44_FRESH_CLUSTER_GLOBALS_DOCKER_EXEC_FAILED' >&2
   elif grep -Eqi 'could not connect|connection refused|authentication failed|pg_hba.conf|timeout' "$work/private-export.log"; then
     echo 'IBERFIT_M44_FRESH_CLUSTER_GLOBALS_DB_CONNECTION_FAILED' >&2
   else
     # A bounded diagnostics string from an entirely synthetic PostgreSQL
     # cluster. Strip numbers, punctuation, paths and special characters
     # before logging to prevent leaking raw SQL, paths or secrets.
     hint="$(head -n 2 "$work/private-export.log" | sed -E 's/[^[:alpha:] ]/ /g' | tr -s ' ' | cut -c 1-140)"
     echo 'IBERFIT_M44_FRESH_CLUSTER_GLOBALS_FAILED' >&2
     printf 'IBERFIT_M44_FRESH_CLUSTER_SYNTHETIC_ERROR_CLASS:%s\n' "$hint" >&2
   fi
   exit 64
 }
docker run --rm --network "container:$src" \
 -e "PGPASSWORD=$pass" -v "$work:/work" postgres:17-alpine \
 pg_dump -h 127.0.0.1 -U supabase_admin -d postgres \
 -Fc -n iberfit_m44_fresh_fixture -f /work/data.pgcustom \
 >>"$work/private-export.log" 2>&1 ||
 { echo 'IBERFIT_M44_FRESH_CLUSTER_DUMP_FAILED' >&2; exit 65; }
for role in owner reader coach intruder; do
 grep -Eq "^CREATE ROLE iberfit_m44_fresh_$role;$" "$work/global-roles.sql" ||
  { echo 'IBERFIT_M44_FRESH_CLUSTER_ROLE_MISSING' >&2; exit 66; }
done
# The exported GLOBAL archive itself must retain the membership. Checking
# target membership alone could otherwise conceal a broken roles archive.
if ! grep -Eq '^GRANT[[:space:]]+iberfit_m44_fresh_reader[[:space:]]+TO[[:space:]]+iberfit_m44_fresh_coach([[:space:];]|$)' "$work/global-roles.sql"; then
 echo 'IBERFIT_M44_FRESH_CLUSTER_GLOBAL_MEMBERSHIP_NOT_ARCHIVED' >&2; exit 71
fi
if grep -Eiq '\bPASSWORD\b' "$work/global-roles.sql"; then
 echo 'IBERFIT_M44_FRESH_CLUSTER_PASSWORD_FORBIDDEN' >&2; exit 67
fi
# Only explicit, audited fixture roles are reconciled; never execute
# pg_dumpall globals blindly against Supabase-managed roles.
sql "$dst" >"$work/private-target.log" 2>&1 <<'SQL'
CREATE ROLE iberfit_m44_fresh_owner NOLOGIN;
CREATE ROLE iberfit_m44_fresh_reader NOLOGIN;
CREATE ROLE iberfit_m44_fresh_coach NOLOGIN;
CREATE ROLE iberfit_m44_fresh_intruder NOLOGIN;
GRANT iberfit_m44_fresh_reader TO iberfit_m44_fresh_coach;
SQL
docker run --rm --network "container:$dst" \
 -e "PGPASSWORD=$pass" -v "$work:/work" postgres:17-alpine \
 pg_restore --exit-on-error -h 127.0.0.1 -U supabase_admin -d postgres \
 /work/data.pgcustom >"$work/private-restore.log" 2>&1 ||
 { echo 'IBERFIT_M44_FRESH_CLUSTER_RESTORE_FAILED' >&2; exit 68; }
check_cluster() {
 local db="$1" structure count member definer noaccess privileges
 structure="$(sql "$db" -c "
 SELECT concat_ws(',',
  (n.nspowner='iberfit_m44_fresh_owner'::regrole)::int,
  (c.relowner='iberfit_m44_fresh_owner'::regrole)::int,
  c.relrowsecurity::int,
  has_schema_privilege('iberfit_m44_fresh_reader',n.oid,'USAGE')::int,
  has_table_privilege('iberfit_m44_fresh_reader',c.oid,'SELECT')::int,
  EXISTS(SELECT 1 FROM pg_default_acl d JOIN LATERAL aclexplode(d.defaclacl) x ON true
    WHERE d.defaclrole='iberfit_m44_fresh_owner'::regrole
    AND d.defaclnamespace=n.oid AND d.defaclobjtype='r'
    AND x.grantee='iberfit_m44_fresh_reader'::regrole
    AND x.privilege_type='SELECT')::int,
  EXISTS(SELECT 1 FROM pg_auth_members m
    WHERE m.roleid='iberfit_m44_fresh_reader'::regrole
    AND m.member='iberfit_m44_fresh_coach'::regrole
    AND m.inherit_option)::int
 ) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='iberfit_m44_fresh_fixture' AND c.relname='rows';")" || { echo 'IBERFIT_M44_FRESH_CLUSTER_STRUCTURE_QUERY_FAILED' >&2; return 1; }
 [[ "$structure" == '1,1,1,1,1,1,1' ]] || { echo 'IBERFIT_M44_FRESH_CLUSTER_STRUCTURAL_ACL_MISMATCH' >&2; return 1; }
 # Record *effective* execution rights and the dangerous owner/security
 # combination without printing function bodies or private SQL.
 privileges="$(sql "$db" -c "
 SELECT concat_ws(',',
  p.prosecdef::int,
  (p.proowner='iberfit_m44_fresh_owner'::regrole)::int,
  (p.proconfig @> ARRAY['search_path=pg_catalog, iberfit_m44_fresh_fixture'])::int,
  has_function_privilege('iberfit_m44_fresh_coach',p.oid,'EXECUTE')::int,
  (NOT has_function_privilege('iberfit_m44_fresh_reader',p.oid,'EXECUTE'))::int,
  (NOT has_function_privilege('iberfit_m44_fresh_intruder',p.oid,'EXECUTE'))::int,
  (NOT EXISTS(
   SELECT 1 FROM aclexplode(COALESCE(p.proacl,acl_default('f',p.proowner))) x
   WHERE x.grantee=0 AND x.privilege_type='EXECUTE'))::int
 ) FROM pg_proc p
 WHERE p.oid='iberfit_m44_fresh_fixture.visible_row_count()'::regprocedure;")" || { echo 'IBERFIT_M44_FRESH_CLUSTER_FUNCTION_QUERY_FAILED' >&2; return 1; }
 [[ "$privileges" == '1,1,1,1,1,1,1' ]] || { echo 'IBERFIT_M44_FRESH_CLUSTER_FUNCTION_SECURITY_MISMATCH' >&2; return 1; }
 noaccess="$(sql "$db" -c "
 SELECT concat_ws(',',
  (NOT rolcanlogin)::int,(NOT rolbypassrls)::int,(NOT rolsuper)::int)
 FROM pg_roles WHERE rolname LIKE 'iberfit_m44_fresh_%'
 ORDER BY rolname;")" || { echo 'IBERFIT_M44_FRESH_CLUSTER_ROLE_QUERY_FAILED' >&2; return 1; }
 [[ "$(printf '%s\n' "$noaccess" | grep -cx '1,1,1')" == 4 ]] || { echo 'IBERFIT_M44_FRESH_CLUSTER_ROLE_CAPABILITIES_MISMATCH' >&2; return 1; }
 count="$(sql "$db" -c 'SET ROLE iberfit_m44_fresh_reader; SELECT count(*) FROM iberfit_m44_fresh_fixture.rows;')" || { echo 'IBERFIT_M44_FRESH_CLUSTER_READER_QUERY_FAILED' >&2; return 1; }
 [[ "${count##*$'\n'}" == 1 ]] || return 1
 member="$(sql "$db" -c 'SET ROLE iberfit_m44_fresh_coach; SELECT count(*) FROM iberfit_m44_fresh_fixture.rows;')" || { echo 'IBERFIT_M44_FRESH_CLUSTER_MEMBER_QUERY_FAILED' >&2; return 1; }
 [[ "${member##*$'\n'}" == 1 ]] || return 1
 definer="$(sql "$db" -c 'SET ROLE iberfit_m44_fresh_coach; SELECT iberfit_m44_fresh_fixture.visible_row_count();')" || { echo 'IBERFIT_M44_FRESH_CLUSTER_DEFINER_QUERY_FAILED' >&2; return 1; }
 [[ "${definer##*$'\n'}" == 1 ]] || { echo 'IBERFIT_M44_FRESH_CLUSTER_ALLOWED_FUNCTION_EXEC_FAILED' >&2; return 1; }
 # SELECT is denied at function permission, not only at RLS or schema level.
 for forbidden in iberfit_m44_fresh_reader iberfit_m44_fresh_intruder; do
  if sql "$db" -c "SET ROLE $forbidden; SELECT iberfit_m44_fresh_fixture.visible_row_count();" \
       > "$work/negative-execute-private.log" 2>&1; then
    echo 'IBERFIT_M44_FRESH_CLUSTER_FORBIDDEN_FUNCTION_EXEC_SUCCEEDED' >&2
    return 1
  fi
  grep -qi 'permission denied for function' "$work/negative-execute-private.log" || return 1
 done
 [[ "$(sql "$db" -c "SELECT string_agg(id::text||':'||tenant_id::text||':'||label,',' ORDER BY id) FROM iberfit_m44_fresh_fixture.rows;")" == '1:1:visible-synthetic,2:2:hidden-synthetic' ]]
}
check_cluster "$src" ||
 { echo 'IBERFIT_M44_FRESH_CLUSTER_SOURCE_INVALID' >&2; exit 69; }
check_cluster "$dst" ||
 { echo 'IBERFIT_M44_FRESH_CLUSTER_PARITY_INVALID' >&2; exit 70; }
echo 'IBERFIT_M44_FRESH_CLUSTER_ROLES_MEMBERSHIP_ACL_RLS_RECONCILED_SYNTHETIC_ONLY'
echo 'IBERFIT_M44_FRESH_CLUSTER_NETWORK_NONE_NO_PORTS'
echo 'IBERFIT_M44_PLATFORM_RECOVERY_NOT_CERTIFIED'
