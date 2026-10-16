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
