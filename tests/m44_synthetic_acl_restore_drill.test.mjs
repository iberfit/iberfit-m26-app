import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const sh=fs.readFileSync('scripts/ops/m44_synthetic_acl_restore_drill.sh','utf8');
const yaml=fs.readFileSync('.github/workflows/m44-role-acl-synthetic-drill.yml','utf8');

test('synthetic fixture drill refuses any nonlocal or nonliteral password connection',()=>{
 for(const extra of [{},{IBERFIT_M44_SYNTHETIC_ONLY:'true',PGHOST:'db.production.invalid',PGPORT:'5432',
   PGUSER:'supabase_admin',['PGPASSWORD']:'m44-local-fixture-only'},
   {IBERFIT_M44_SYNTHETIC_ONLY:'true',PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:'supabase_admin',
    ['PGPASSWORD']:'real-not-allowed'}]){
  const r=spawnSync('sh',['scripts/ops/m44_synthetic_acl_restore_drill.sh'],
   {encoding:'utf8',env:{PATH:process.env.PATH,...extra},timeout:7000});
  assert.equal(r.status,60,JSON.stringify({status:r.status,stderr:r.stderr}));
  assert.match(r.stderr,/IBERFIT_M44_ACL_DRILL_ISOLATION_REQUIRED/);
  assert.doesNotMatch(r.stderr,/real-not-allowed|db\.production\.invalid/);
 }
});
test('workflow can never consume production credentials or call Supabase endpoints',()=>{
 assert.match(yaml,/image: supabase\/postgres:17\.6\.1\.147/);
 assert.match(yaml,/postgres:17-alpine sh \/drill\.sh/);
 assert.match(yaml,/IBERFIT_M44_SYNTHETIC_ONLY=true/);
 assert.match(yaml,/permissions:\s*\n  contents: read/);
 assert.match(yaml,/PGHOST=127\.0\.0\.1/);
 assert.doesNotMatch(yaml,/(?:secrets\.|pjhmrhejsoofmouedavw|gjztkdwfmunnzhtvxrsu|https:\/\/.*supabase\.co|environment: m26)/);
});
test('PG17 drill demonstrates broken owner and grants under --no-acl, then repairs exactly',()=>{
 assert.match(sh,/pg_dump -Fc.*--schema=m44_acl_fixture/);
 assert.match(sh,/pg_restore --exit-on-error --no-owner --no-acl --dbname="\$stripped"/);
 assert.match(sh,/pg_restore --exit-on-error --no-owner --dbname="\$repaired"/);
 assert.match(sh,/ALTER SCHEMA m44_acl_fixture OWNER TO iberfit_m44_fixture_owner/);
 assert.match(sh,/ALTER TABLE m44_acl_fixture\.exercise OWNER TO iberfit_m44_fixture_owner/);
 assert.match(sh,/ALTER DEFAULT PRIVILEGES FOR ROLE iberfit_m44_fixture_owner/);
 assert.match(sh,/has_table_privilege/);
 assert.match(sh,/has_schema_privilege/);
 assert.match(sh,/pg_default_acl/);
 assert.match(sh,/pg_policies/);
 assert.match(sh,/SET ROLE iberfit_m44_fixture_reader/);
 assert.match(sh,/IBERFIT_M44_ACL_STRIPPED_RESTORE_DENIED_AS_EXPECTED/);
 assert.match(sh,/IBERFIT_M44_ACL_OWNERS_GRANTS_DEFAULTS_RLS_RECONCILED_SYNTHETIC_ONLY/);
 assert.match(sh,/IBERFIT_M44_PLATFORM_RECOVERY_NOT_CERTIFIED/);
});
test('no real production data or external network in synthetic workload',()=>{
 assert.doesNotMatch(sh,/(?:IBERFIT_PROD_DATABASE_URL|service_role_key|supabase\.co|curl |wget |ssh |rm -rf|TRUNCATE|DROP ROLE)/i);
 assert.match(sh,/CREATE ROLE iberfit_m44_fixture_reader NOLOGIN/);
 assert.match(sh,/CREATE ROLE iberfit_m44_fixture_owner NOLOGIN/);
 assert.match(sh,/synthetic-visible/);
 assert.match(sh,/synthetic-hidden/);
 assert.match(sh,/IBERFIT_M44_ACL_DRILL_NONEMPTY_SANDBOX/);
});

test('permission denied from psql is propagated, never masked by tail pipeline',()=>{
 assert.match(sh,/output="\$\(psql[\s\S]*?\)" \|\| return 1/);
 assert.match(sh,/printf '%s\\n' "\$output" \| tail -n 1/);
 assert.doesNotMatch(sh,/psql[\s\S]{0,130}\| tail -n 1/);
});

test('selective recovery replays only ACL and DEFAULT ACL, never table rows or DDL',()=>{
 assert.match(sh,/pg_restore --list "\$work\/synthetic\.acl\.pgcustom"/);
 assert.match(sh,/--use-list="\$work\/synthetic-acl-only-private\.list"/);
 assert.ok(sh.includes('DEFAULT ACL[[:space:]]'));
 assert.match(sh,/grants < 1 \|\| defaults < 1/);
 assert.match(sh,/IBERFIT_M44_ACL_ONLY_SELECTION_FAILED/);
 assert.match(sh,/IBERFIT_M44_ACL_ONLY_REPLAY_CATALOG_DIVERGED/);
 assert.match(sh,/IBERFIT_M44_ACL_ONLY_REPLAY_RLS_DIVERGED/);
 assert.match(sh,/IBERFIT_M44_SELECTIVE_ACL_DEFAULT_PRIVILEGES_REPLAY_SYNTHETIC_ONLY/);
 // Every TOC record is either a precisely recognized privilege record or
 // commented out. Importing the full schema into an already-restored
 // database would hide duplication and could overwrite tenant data.
 assert.match(sh,/print ";" \$0; next/);
});

test('recovered ACL is also exercised with real tenant-scoped DML RLS',()=>{
 assert.match(sh,/CREATE ROLE iberfit_m44_fixture_writer NOLOGIN/);
 assert.match(sh,/tenant_id integer NOT NULL/);
 assert.match(sh,/GRANT SELECT, INSERT, UPDATE, DELETE ON m44_acl_fixture\.exercise TO iberfit_m44_fixture_writer/);
 for(const kind of ['SELECT','INSERT','UPDATE','DELETE']){
  assert.match(sh,new RegExp('CREATE POLICY m44_writer_'+
   kind.toLowerCase()+'_scope[\\s\\S]*?FOR '+kind+
   ' TO iberfit_m44_fixture_writer'));
 }
 assert.match(sh,/FOR INSERT TO iberfit_m44_fixture_writer WITH CHECK \(tenant_id = 1\)/);
 assert.match(sh,/FOR UPDATE TO iberfit_m44_fixture_writer\s+USING \(tenant_id = 1\) WITH CHECK \(tenant_id = 1\)/);
 assert.match(sh,/SET LOCAL ROLE iberfit_m44_fixture_writer/);
 assert.match(sh,/BEGIN; SET LOCAL ROLE[\s\S]*?ROLLBACK/);
 assert.match(sh,/violates row-level security policy/);
 assert.match(sh,/WHERE id=2 RETURNING id/);
 assert.match(sh,/SET tenant_id=2 WHERE id=1/);
 assert.match(sh,/IBERFIT_M44_RLS_DML_SOURCE_AND_FULL_RESTORE_SYNTHETIC_VERIFIED/);
 assert.match(sh,/IBERFIT_M44_RLS_DML_ACL_ONLY_REPLAY_SYNTHETIC_VERIFIED/);
 assert.match(sh,/IBERFIT_M44_RLS_DML_STRIPPED_UNEXPECTEDLY_PERMITTED/);
 assert.match(sh,/IBERFIT_M44_RLS_DML_ACL_ONLY_REPLAY_DIVERGED/);
});

test('synthetic drill remains valid POSIX sh after any source change',()=>{
 const result=spawnSync('sh',['-n','scripts/ops/m44_synthetic_acl_restore_drill.sh'],
  {encoding:'utf8',env:{PATH:process.env.PATH},timeout:7000});
 assert.equal(result.status,0,result.stderr);
});
