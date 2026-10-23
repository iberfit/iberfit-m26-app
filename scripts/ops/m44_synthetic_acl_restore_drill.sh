#!/bin/sh
# Synthetic-only M44 PostgreSQL 17 role/owner/ACL/RLS recovery rehearsal.
# Never pass production URLs, tokens or customer data to this command.
set -eu
if [ "${IBERFIT_M44_SYNTHETIC_ONLY:-}" != "true" ] ||
   [ "${PGHOST:-}" != "127.0.0.1" ] ||
   [ "${PGPORT:-}" != "5432" ] ||
   [ "${PGUSER:-}" != "supabase_admin" ] ||
   [ "${PGPASSWORD:-}" != "m44-local-fixture-only" ] ||
   [ "${PGDATABASE:-postgres}" != "postgres" ]; then
  echo 'IBERFIT_M44_ACL_DRILL_ISOLATION_REQUIRED' >&2
  exit 60
fi
umask 077
work="${IBERFIT_M44_DRILL_DIR:-/work}"
case "$work" in /work|/work/*) ;; *) echo 'IBERFIT_M44_ACL_DRILL_BAD_WORKSPACE' >&2; exit 61 ;; esac
mkdir -p "$work"
role_owner='iberfit_m44_fixture_owner'
role_reader='iberfit_m44_fixture_reader'
src='iberfit_m44_acl_fixture_source'
stripped='iberfit_m44_acl_fixture_stripped'
repaired='iberfit_m44_acl_fixture_repaired'
for db in "$src" "$stripped" "$repaired"; do
  if psql -X -A -t -d postgres -c "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -qx 1; then
    echo 'IBERFIT_M44_ACL_DRILL_NONEMPTY_SANDBOX' >&2
    exit 62
  fi
done
psql -X -q -v ON_ERROR_STOP=1 -d postgres <<'SQL'
CREATE ROLE iberfit_m44_fixture_owner NOLOGIN;
CREATE ROLE iberfit_m44_fixture_reader NOLOGIN;
CREATE ROLE iberfit_m44_fixture_writer NOLOGIN;
CREATE ROLE iberfit_m44_fixture_column_reader NOLOGIN;
CREATE ROLE iberfit_m44_fixture_schema_denied NOLOGIN;
SQL
for db in "$src" "$stripped" "$repaired"; do
  createdb "$db"
done
psql -X -q -v ON_ERROR_STOP=1 -d "$src" <<'SQL'
CREATE SCHEMA m44_acl_fixture AUTHORIZATION iberfit_m44_fixture_owner;
CREATE TABLE m44_acl_fixture.exercise (
  id integer PRIMARY KEY,
  tenant_id integer NOT NULL,
  content text NOT NULL
);
ALTER TABLE m44_acl_fixture.exercise OWNER TO iberfit_m44_fixture_owner;
INSERT INTO m44_acl_fixture.exercise(id,tenant_id,content) VALUES
 (1,1,'synthetic-visible'),(2,2,'synthetic-hidden');
ALTER TABLE m44_acl_fixture.exercise ENABLE ROW LEVEL SECURITY;
CREATE POLICY m44_reader_own_scope ON m44_acl_fixture.exercise
  FOR SELECT TO iberfit_m44_fixture_reader USING (id = 1);
GRANT USAGE ON SCHEMA m44_acl_fixture TO iberfit_m44_fixture_reader;
GRANT SELECT ON m44_acl_fixture.exercise TO iberfit_m44_fixture_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE iberfit_m44_fixture_owner
  IN SCHEMA m44_acl_fixture GRANT SELECT ON TABLES TO iberfit_m44_fixture_reader;
GRANT USAGE ON SCHEMA m44_acl_fixture TO iberfit_m44_fixture_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON m44_acl_fixture.exercise TO iberfit_m44_fixture_writer;
CREATE POLICY m44_writer_select_scope ON m44_acl_fixture.exercise
 FOR SELECT TO iberfit_m44_fixture_writer USING (tenant_id = 1);
CREATE POLICY m44_writer_insert_scope ON m44_acl_fixture.exercise
 FOR INSERT TO iberfit_m44_fixture_writer WITH CHECK (tenant_id = 1);
CREATE POLICY m44_writer_update_scope ON m44_acl_fixture.exercise
 FOR UPDATE TO iberfit_m44_fixture_writer USING (tenant_id = 1) WITH CHECK (tenant_id = 1);
CREATE POLICY m44_writer_delete_scope ON m44_acl_fixture.exercise
 FOR DELETE TO iberfit_m44_fixture_writer USING (tenant_id = 1);
-- Column-only grant: this actor cannot SELECT the tenant_id or id columns.
GRANT USAGE ON SCHEMA m44_acl_fixture TO iberfit_m44_fixture_column_reader;
GRANT SELECT(content) ON m44_acl_fixture.exercise TO iberfit_m44_fixture_column_reader;
CREATE POLICY m44_column_reader_scope ON m44_acl_fixture.exercise
 FOR SELECT TO iberfit_m44_fixture_column_reader USING (tenant_id = 1);
-- Counterexample: table GRANT and permissive policy WITHOUT schema USAGE.
-- A full restore and ACL-only replay must still deny this role.
GRANT SELECT ON m44_acl_fixture.exercise TO iberfit_m44_fixture_schema_denied;
CREATE POLICY m44_schema_denied_open ON m44_acl_fixture.exercise
 FOR SELECT TO iberfit_m44_fixture_schema_denied USING (true);
SQL
pg_dump -Fc --dbname="$src" --schema=m44_acl_fixture --file="$work/synthetic.acl.pgcustom"
pg_restore --list "$work/synthetic.acl.pgcustom" > "$work/synthetic-toc-private.list"
if ! grep -Eq '^[0-9]+;[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+ACL[[:space:]]' \
     "$work/synthetic-toc-private.list" ||
   ! grep -Eq '^[0-9]+;[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+DEFAULT ACL[[:space:]]' \
     "$work/synthetic-toc-private.list"; then
  echo 'IBERFIT_M44_SYNTHETIC_ACL_ARCHIVE_INCOMPLETE' >&2
  exit 71
fi
rm -f "$work/synthetic-toc-private.list"
echo 'IBERFIT_M44_SYNTHETIC_PGCUSTOM_ACL_DEFAULTS_RETAINED'
pg_restore --exit-on-error --no-owner --no-acl --dbname="$stripped" "$work/synthetic.acl.pgcustom"
pg_restore --exit-on-error --no-owner --dbname="$repaired" "$work/synthetic.acl.pgcustom"
# In a managed Supabase target the roles already exist; here we deliberately
# reconcile object ownership separately instead of blindly replaying globals.
psql -X -q -v ON_ERROR_STOP=1 -d "$repaired" <<'SQL'
ALTER SCHEMA m44_acl_fixture OWNER TO iberfit_m44_fixture_owner;
ALTER TABLE m44_acl_fixture.exercise OWNER TO iberfit_m44_fixture_owner;
SQL
catalog() {
 psql -X -A -t -v ON_ERROR_STOP=1 -d "$1" -c "
 SELECT concat_ws(',',
  (n.nspowner='iberfit_m44_fixture_owner'::regrole)::integer,
  (c.relowner='iberfit_m44_fixture_owner'::regrole)::integer,
  has_schema_privilege('iberfit_m44_fixture_reader',n.oid,'USAGE')::integer,
  has_table_privilege('iberfit_m44_fixture_reader',c.oid,'SELECT')::integer,
  c.relrowsecurity::integer,
  EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='m44_acl_fixture'
    AND p.tablename='exercise' AND p.policyname='m44_reader_own_scope'
    AND p.cmd='SELECT' AND p.roles::text[]=ARRAY['iberfit_m44_fixture_reader'])::integer,
  EXISTS(SELECT 1 FROM pg_default_acl d
   JOIN LATERAL aclexplode(d.defaclacl) x ON true
   WHERE d.defaclrole='iberfit_m44_fixture_owner'::regrole
    AND d.defaclnamespace=n.oid AND d.defaclobjtype='r'
    AND x.grantee='iberfit_m44_fixture_reader'::regrole
    AND x.privilege_type='SELECT')::integer,
  has_schema_privilege('iberfit_m44_fixture_column_reader',n.oid,'USAGE')::integer,
  has_column_privilege('iberfit_m44_fixture_column_reader',c.oid,'content','SELECT')::integer,
  (NOT has_column_privilege('iberfit_m44_fixture_column_reader',c.oid,'tenant_id','SELECT'))::integer,
  has_table_privilege('iberfit_m44_fixture_schema_denied',c.oid,'SELECT')::integer,
  (NOT has_schema_privilege('iberfit_m44_fixture_schema_denied',n.oid,'USAGE'))::integer
 ) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='m44_acl_fixture' AND c.relname='exercise'
  AND c.relkind='r';"
}
source_result="$(catalog "$src")"
stripped_result="$(catalog "$stripped")"
repaired_result="$(catalog "$repaired")"
if [ "$source_result" != '1,1,1,1,1,1,1,1,1,1,1,1' ]; then
 echo 'IBERFIT_M44_ACL_SOURCE_FIXTURE_INVALID' >&2; exit 64
fi
if [ "$stripped_result" = "$source_result" ]; then
 echo 'IBERFIT_M44_ACL_STRIPPED_UNEXPECTEDLY_COMPLETE' >&2; exit 65
fi
if [ "$repaired_result" != "$source_result" ]; then
 echo 'IBERFIT_M44_ACL_REPAIRED_CATALOG_DIFFERENT' >&2; exit 66
fi
# The role's real query is filtered by RLS, not just permitted by GRANT.
reader_count() {
 # Do NOT pipe psql directly into tail: POSIX sh would retain tail's exit
 # status and accept an SQL permission-denied error as a successful query.
 output="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$1" \
   -c 'SET ROLE iberfit_m44_fixture_reader; SELECT count(*) FROM m44_acl_fixture.exercise;')" || return 1
 printf '%s\n' "$output" | tail -n 1
}
[ "$(reader_count "$src")" = "1" ] ||
 { echo 'IBERFIT_M44_ACL_SOURCE_ROLE_QUERY_INVALID' >&2; exit 67; }
[ "$(reader_count "$repaired")" = "1" ] ||
 { echo 'IBERFIT_M44_ACL_RECOVERED_ROLE_QUERY_INVALID' >&2; exit 68; }
if reader_count "$stripped" >/dev/null 2>&1; then
 echo 'IBERFIT_M44_ACL_STRIPPED_ROLE_QUERY_PERMITTED' >&2; exit 69
fi
# Verify actual tenant-scoped DML using a restricted synthetic role.
# Writes roll back. A denied write must fail specifically due to RLS.
writer_exec() {
 psql -X -A -t -v ON_ERROR_STOP=1 -d "$1" \
  -c "BEGIN; SET LOCAL ROLE iberfit_m44_fixture_writer; $2; ROLLBACK;"
}
writer_count() {
 output="$(writer_exec "$1" "$2" 2>/dev/null)" || return 1
 observed="$(printf '%s\n' "$output" | grep -E '^[0-9]+$' | tail -n 1)"
 [ "$observed" = "$3" ]
}
writer_rls_rejects() {
 if outcome="$(writer_exec "$1" "$2" 2>&1)"; then return 1; fi
 printf '%s\n' "$outcome" | grep -qi 'violates row-level security policy'
}
verify_writer_rls() {
 db="$1"
 writer_count "$db" 'SELECT count(*) FROM m44_acl_fixture.exercise' 1 &&
 writer_count "$db" "WITH ins AS (INSERT INTO m44_acl_fixture.exercise(id,tenant_id,content) VALUES (3,1,'synthetic-new') RETURNING id) SELECT count(*) FROM ins" 1 &&
 writer_rls_rejects "$db" "INSERT INTO m44_acl_fixture.exercise(id,tenant_id,content) VALUES (4,2,'synthetic-forbidden')" &&
 writer_count "$db" "WITH changed AS (UPDATE m44_acl_fixture.exercise SET content='synthetic-edited' WHERE id=1 RETURNING id) SELECT count(*) FROM changed" 1 &&
 writer_count "$db" "WITH changed AS (UPDATE m44_acl_fixture.exercise SET content='synthetic-forbidden' WHERE id=2 RETURNING id) SELECT count(*) FROM changed" 0 &&
 writer_rls_rejects "$db" "UPDATE m44_acl_fixture.exercise SET tenant_id=2 WHERE id=1" &&
 writer_count "$db" 'WITH deleted AS (DELETE FROM m44_acl_fixture.exercise WHERE id=1 RETURNING id) SELECT count(*) FROM deleted' 1 &&
 writer_count "$db" 'WITH deleted AS (DELETE FROM m44_acl_fixture.exercise WHERE id=2 RETURNING id) SELECT count(*) FROM deleted' 0
}
if ! verify_writer_rls "$src" || ! verify_writer_rls "$repaired"; then
 echo 'IBERFIT_M44_RLS_DML_ORIGINAL_OR_RESTORE_DIVERGED' >&2; exit 75
fi
if writer_count "$stripped" 'SELECT count(*) FROM m44_acl_fixture.exercise' 1; then
 echo 'IBERFIT_M44_RLS_DML_STRIPPED_UNEXPECTEDLY_PERMITTED' >&2; exit 76
fi
echo 'IBERFIT_M44_RLS_DML_SOURCE_AND_FULL_RESTORE_SYNTHETIC_VERIFIED'
# Prove schema grants and column-only grants survive each restore route.
column_visible() {
 output="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$1" \
   -c "SET ROLE iberfit_m44_fixture_column_reader; SELECT (count(*)=1 AND min(content)='synthetic-visible')::integer FROM m44_acl_fixture.exercise;")" || return 1
 [ "$(printf '%s\n' "$output" | tail -n 1)" = '1' ]
}
column_denied() {
 if output="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$1" \
  -c 'SET ROLE iberfit_m44_fixture_column_reader; SELECT tenant_id FROM m44_acl_fixture.exercise;' 2>&1)"; then return 1; fi
 printf '%s\n' "$output" | grep -Eqi 'permission denied for (table|column)'
}
schema_denied() {
 if output="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$1" \
  -c 'SET ROLE iberfit_m44_fixture_schema_denied; SELECT content FROM m44_acl_fixture.exercise;' 2>&1)"; then return 1; fi
 printf '%s\n' "$output" | grep -qi 'permission denied for schema'
}
verify_fine_grants() {
 column_visible "$1" && column_denied "$1" && schema_denied "$1"
}
if ! verify_fine_grants "$src" || ! verify_fine_grants "$repaired"; then
 echo 'IBERFIT_M44_SCHEMA_COLUMN_ACL_SOURCE_OR_RESTORE_DIVERGED' >&2; exit 78
fi
if column_visible "$stripped" >/dev/null 2>&1; then
 echo 'IBERFIT_M44_SCHEMA_COLUMN_ACL_STRIPPED_UNEXPECTEDLY_PERMITTED' >&2; exit 79
fi
echo 'IBERFIT_M44_SCHEMA_COLUMN_ACL_FULL_RESTORE_SYNTHETIC_VERIFIED'
# Recover grants WITHOUT re-importing schema or row data. The TOC remains
# private: names are never logged. Non-ACL statements are commented out,
# while owner changes are explicitly reconciled in the sandbox afterward.
pg_restore --list "$work/synthetic.acl.pgcustom" > "$work/synthetic-toc-private.list"
awk '
 /^[0-9]+;/ {
   if ($0 ~ /^[0-9]+;[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+ACL[[:space:]]/) {
     print; grants++; next
   }
   if ($0 ~ /^[0-9]+;[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+DEFAULT ACL[[:space:]]/) {
     print; defaults++; next
   }
   print ";" $0; next
 }
 { print }
 END { if (grants < 1 || defaults < 1) exit 72 }
' "$work/synthetic-toc-private.list" > "$work/synthetic-acl-only-private.list" ||
 { echo 'IBERFIT_M44_ACL_ONLY_SELECTION_FAILED' >&2; exit 72; }
pg_restore --exit-on-error --no-owner --use-list="$work/synthetic-acl-only-private.list" \
  --dbname="$stripped" "$work/synthetic.acl.pgcustom"
rm -f "$work/synthetic-toc-private.list" "$work/synthetic-acl-only-private.list"
psql -X -q -v ON_ERROR_STOP=1 -d "$stripped" <<'SQL'
ALTER SCHEMA m44_acl_fixture OWNER TO iberfit_m44_fixture_owner;
ALTER TABLE m44_acl_fixture.exercise OWNER TO iberfit_m44_fixture_owner;
SQL
if [ "$(catalog "$stripped")" != "$source_result" ]; then
  echo 'IBERFIT_M44_ACL_ONLY_REPLAY_CATALOG_DIVERGED' >&2; exit 73
fi
if [ "$(reader_count "$stripped")" != "1" ]; then
  echo 'IBERFIT_M44_ACL_ONLY_REPLAY_RLS_DIVERGED' >&2; exit 74
fi
if ! verify_writer_rls "$stripped"; then
 echo 'IBERFIT_M44_RLS_DML_ACL_ONLY_REPLAY_DIVERGED' >&2; exit 77
fi
echo 'IBERFIT_M44_RLS_DML_ACL_ONLY_REPLAY_SYNTHETIC_VERIFIED'
if ! verify_fine_grants "$stripped"; then
 echo 'IBERFIT_M44_SCHEMA_COLUMN_ACL_REPLAY_DIVERGED' >&2; exit 80
fi
echo 'IBERFIT_M44_SCHEMA_COLUMN_ACL_ONLY_REPLAY_SYNTHETIC_VERIFIED'
echo 'IBERFIT_M44_SELECTIVE_ACL_DEFAULT_PRIVILEGES_REPLAY_SYNTHETIC_ONLY'
# Full data rows may be present even when tenant permissions were lost.
for db in "$src" "$stripped" "$repaired"; do
 rows="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$db" \
   -c 'SELECT count(*) FROM m44_acl_fixture.exercise')"
 [ "$rows" = "2" ] || { echo 'IBERFIT_M44_ACL_FIXTURE_DATA_MISMATCH' >&2; exit 70; }
 # A count alone would miss a mutation that escaped an expected ROLLBACK.
 snapshot="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$db" \
   -c "SELECT string_agg(id::text || ':' || tenant_id::text || ':' || content, ',' ORDER BY id) FROM m44_acl_fixture.exercise")" || exit 81
 [ "$snapshot" = '1:1:synthetic-visible,2:2:synthetic-hidden' ] ||
  { echo 'IBERFIT_M44_ACL_FIXTURE_CONTENT_CHANGED_AFTER_ROLLBACK' >&2; exit 82; }
done
echo 'IBERFIT_M44_SYNTHETIC_DATA_CONTENT_AND_ROLLBACK_VERIFIED'
echo 'IBERFIT_M44_ACL_STRIPPED_RESTORE_DENIED_AS_EXPECTED'
echo 'IBERFIT_M44_ACL_OWNERS_GRANTS_DEFAULTS_RLS_RECONCILED_SYNTHETIC_ONLY'
echo 'IBERFIT_M44_PLATFORM_RECOVERY_NOT_CERTIFIED'
