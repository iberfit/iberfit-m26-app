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
 docker exec -e "PGPASSWORD=$pass" "$1" \
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
SQL
docker exec -e "PGPASSWORD=$pass" "$src" \
 pg_dumpall -h 127.0.0.1 -U supabase_admin -d postgres \
 --roles-only --no-role-passwords -f /work/global-roles.sql \
 >"$work/private-export.log" 2>&1 ||
 { echo 'IBERFIT_M44_FRESH_CLUSTER_GLOBALS_FAILED' >&2; exit 64; }
docker exec -e "PGPASSWORD=$pass" "$src" \
 pg_dump -h 127.0.0.1 -U supabase_admin -d postgres \
 -Fc -n iberfit_m44_fresh_fixture -f /work/data.pgcustom \
 >>"$work/private-export.log" 2>&1 ||
 { echo 'IBERFIT_M44_FRESH_CLUSTER_DUMP_FAILED' >&2; exit 65; }
for role in owner reader coach; do
 grep -Eq "^CREATE ROLE iberfit_m44_fresh_$role;$" "$work/global-roles.sql" ||
  { echo 'IBERFIT_M44_FRESH_CLUSTER_ROLE_MISSING' >&2; exit 66; }
done
if grep -Eiq '\bPASSWORD\b' "$work/global-roles.sql"; then
 echo 'IBERFIT_M44_FRESH_CLUSTER_PASSWORD_FORBIDDEN' >&2; exit 67
fi
# Only explicit, audited fixture roles are reconciled; never execute
# pg_dumpall globals blindly against Supabase-managed roles.
sql "$dst" >"$work/private-target.log" 2>&1 <<'SQL'
CREATE ROLE iberfit_m44_fresh_owner NOLOGIN;
CREATE ROLE iberfit_m44_fresh_reader NOLOGIN;
CREATE ROLE iberfit_m44_fresh_coach NOLOGIN;
GRANT iberfit_m44_fresh_reader TO iberfit_m44_fresh_coach;
SQL
docker exec -e "PGPASSWORD=$pass" "$dst" \
 pg_restore --exit-on-error -h 127.0.0.1 -U supabase_admin -d postgres \
 /work/data.pgcustom >"$work/private-restore.log" 2>&1 ||
 { echo 'IBERFIT_M44_FRESH_CLUSTER_RESTORE_FAILED' >&2; exit 68; }
check_cluster() {
 local db="$1" structure count member
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
 WHERE n.nspname='iberfit_m44_fresh_fixture' AND c.relname='rows';")" || return 1
 [[ "$structure" == '1,1,1,1,1,1,1' ]] || return 1
 count="$(sql "$db" -c 'SET ROLE iberfit_m44_fresh_reader; SELECT count(*) FROM iberfit_m44_fresh_fixture.rows;')" || return 1
 [[ "${count##*$'\n'}" == 1 ]] || return 1
 member="$(sql "$db" -c 'SET ROLE iberfit_m44_fresh_coach; SELECT count(*) FROM iberfit_m44_fresh_fixture.rows;')" || return 1
 [[ "${member##*$'\n'}" == 1 ]] || return 1
 [[ "$(sql "$db" -c "SELECT string_agg(id::text||':'||tenant_id::text||':'||label,',' ORDER BY id) FROM iberfit_m44_fresh_fixture.rows;")" == '1:1:visible-synthetic,2:2:hidden-synthetic' ]]
}
check_cluster "$src" ||
 { echo 'IBERFIT_M44_FRESH_CLUSTER_SOURCE_INVALID' >&2; exit 69; }
check_cluster "$dst" ||
 { echo 'IBERFIT_M44_FRESH_CLUSTER_PARITY_INVALID' >&2; exit 70; }
echo 'IBERFIT_M44_FRESH_CLUSTER_ROLES_MEMBERSHIP_ACL_RLS_RECONCILED_SYNTHETIC_ONLY'
echo 'IBERFIT_M44_FRESH_CLUSTER_NETWORK_NONE_NO_PORTS'
echo 'IBERFIT_M44_PLATFORM_RECOVERY_NOT_CERTIFIED'
