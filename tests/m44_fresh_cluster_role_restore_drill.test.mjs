import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const script=fs.readFileSync('scripts/ops/m44_fresh_cluster_role_restore_drill.sh','utf8');
const workflow=fs.readFileSync('.github/workflows/m44-role-acl-synthetic-drill.yml','utf8');

test('fresh-cluster workload is valid bash and refuses execution without explicit synthetic CI guard',()=>{
 const syntax=spawnSync('bash',['-n','scripts/ops/m44_fresh_cluster_role_restore_drill.sh'],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
 const denied=spawnSync('bash',['scripts/ops/m44_fresh_cluster_role_restore_drill.sh'],{
  encoding:'utf8',timeout:7000,env:{PATH:process.env.PATH}});
 assert.equal(denied.status,60,denied.stderr);
 assert.match(denied.stderr,/IBERFIT_M44_FRESH_CLUSTER_ISOLATION_REQUIRED/);
});
test('fresh-cluster drill refuses production secrets and never reaches IBERFIT endpoint',()=>{
 for(const key of ['IBERFIT_PROD_DATABASE_URL','SUPABASE_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY']){
  const denied=spawnSync('bash',['scripts/ops/m44_fresh_cluster_role_restore_drill.sh'],{
   encoding:'utf8',timeout:7000,
   env:{PATH:process.env.PATH,IBERFIT_M44_FRESH_CLUSTER_SYNTHETIC_ONLY:'true',
    GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',[key]:'fake-secret-never-use'}});
  assert.equal(denied.status,61,denied.stderr);
  assert.doesNotMatch(denied.stderr,/fake-secret-never-use/);
 }
 assert.doesNotMatch(script,/pjhmrhejsoofmouedavw|gjztkdwfmunnzhtvxrsu|supabase\.co|IBERFIT_BACKUP_PASSPHRASE/);
});
test('both fresh clusters have no Docker network or published ports',()=>{
 assert.match(script,/docker run -d --name "\$1" --network none/);
 assert.match(script,/docker inspect -f/);
 assert.match(script,/docker port "\$1"/);
 assert.match(script,/docker rm -f "\$src" "\$dst"/);
 assert.match(script,/docker run --rm --network "container:\$src"/);
 assert.match(script,/docker run --rm --network "container:\$dst"/);
 assert.match(script,/postgres:17-alpine/);
 assert.doesNotMatch(script,/--network host|--publish|--link|-p 5432:5432|curl |wget |ssh /);
 assert.match(workflow,/name: m44-fresh-cluster-roles-acl-rls-proof/);
 assert.match(workflow,/IBERFIT_M44_FRESH_CLUSTER_SYNTHETIC_ONLY: 'true'/);
 assert.doesNotMatch(workflow,/secrets\.IBERFIT_PROD_DATABASE_URL|secrets\.SUPABASE_ACCESS_TOKEN/);
});
test('exported globals are passwordless and NEVER executed unreviewed on destination',()=>{
 assert.match(script,/pg_dumpall[\s\S]*?--roles-only --no-role-passwords/);
 assert.match(script,/PGDATABASE=postgres/);
 assert.match(script,/PGHOST=127\.0\.0\.1/);
 assert.doesNotMatch(script,/pg_dumpall[^\n]*-d postgres/);
 assert.match(script,/CREATE ROLE iberfit_m44_fresh_owner NOLOGIN/);
 assert.match(script,/CREATE ROLE iberfit_m44_fresh_reader NOLOGIN/);
 assert.match(script,/CREATE ROLE iberfit_m44_fresh_coach NOLOGIN/);
 assert.match(script,/grep -Eq "\^CREATE ROLE iberfit_m44_fresh_\$role;\$"/);
 assert.match(script,/IBERFIT_M44_FRESH_CLUSTER_PASSWORD_FORBIDDEN/);
 assert.match(script,/IBERFIT_M44_FRESH_CLUSTER_GLOBAL_MEMBERSHIP_NOT_ARCHIVED/);
 assert.match(script,/grep -Eq '\^GRANT/);
 assert.match(script,/never execute/);
 assert.doesNotMatch(script,/psql\s+-f\s+\/work\/global-roles|psql\s+--file.*global-roles/);
});
test('actual roles membership owners RLS defaults and fixture bytes must match new cluster',()=>{
 assert.match(script,/pg_restore --exit-on-error/);
 assert.match(script,/check_cluster "\$src"/);
 assert.match(script,/check_cluster "\$dst"/);
 assert.match(script,/pg_auth_members/);
 assert.match(script,/pg_default_acl/);
 assert.match(script,/nspowner/);
 assert.match(script,/relowner/);
 assert.match(script,/relrowsecurity/);
 assert.match(script,/SET ROLE iberfit_m44_fresh_reader/);
 assert.match(script,/SET ROLE iberfit_m44_fresh_coach/);
 assert.match(script,/1:1:visible-synthetic,2:2:hidden-synthetic/);
 assert.match(script,/IBERFIT_M44_FRESH_CLUSTER_ROLES_MEMBERSHIP_ACL_RLS_RECONCILED_SYNTHETIC_ONLY/);
 assert.match(script,/IBERFIT_M44_PLATFORM_RECOVERY_NOT_CERTIFIED/);
});


test('fresh-cluster function restore preserves SECURITY DEFINER owner and fails closed on EXECUTE',()=>{
 assert.match(script,/CREATE ROLE iberfit_m44_fresh_intruder NOLOGIN/);
 assert.match(script,/CREATE FUNCTION iberfit_m44_fresh_fixture\.visible_row_count/);
 assert.match(script,/SECURITY DEFINER/);
 assert.match(script,/SET search_path = pg_catalog, iberfit_m44_fresh_fixture/);
 assert.match(script,/OWNER TO iberfit_m44_fresh_owner/);
 assert.match(script,/REVOKE ALL ON FUNCTION[^;\n]* FROM PUBLIC/);
 assert.match(script,/GRANT EXECUTE ON FUNCTION/);
 assert.match(script,/has_function_privilege/);
 assert.match(script,/aclexplode\(COALESCE\(p.proacl,acldefault/);
 assert.match(script,/rolbypassrls/);
 assert.match(script,/rolcanlogin/);
 assert.match(script,/rolsuper/);
 assert.match(script,/SET ROLE iberfit_m44_fresh_coach; SELECT iberfit_m44_fresh_fixture.visible_row_count/);
 assert.match(script,/permission denied for function/);
 assert.match(script,/check_cluster "\$src"/);
 assert.match(script,/check_cluster "\$dst"/);
 assert.doesNotMatch(script,/REVOKE ALL ON FUNCTION[^;\n]* FROM (?:iberfit_m44_fresh_reader|iberfit_m44_fresh_intruder)/);
});
