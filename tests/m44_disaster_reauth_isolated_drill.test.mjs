import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const path='scripts/ops/m44_disaster_reauth_isolated_drill.sh';
const source=readFileSync(path,'utf8');
function denial(overrides={}){
 const env={
  PATH:process.env.PATH, GITHUB_ACTIONS:'true', RUNNER_OS:'Linux',
  GITHUB_REPOSITORY:'iberfit/iberfit-m26-app',
  M44_DISASTER_REAUTH_DRILL_ENABLED:'true',
  PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:'supabase_admin',
  PGDATABASE:'iberfit_recovery_test',PGPASSWORD:'x',
  RUNNER_TEMP:'/tmp/isolated-m44-unit-nonexistent',...overrides
 };
 return spawnSync('bash',[path,'/tmp/isolated-m44-unit-nonexistent/iberfit-recovery/isolated'],{
  env,encoding:'utf8',timeout:3000
 });
}
test('M44 disaster auth drill is denied outside protected CI/strict restore context',()=>{
 for(const env of [
  {GITHUB_ACTIONS:'false'}, {RUNNER_OS:'Windows'},
  {GITHUB_REPOSITORY:'other/other'},
  {M44_DISASTER_REAUTH_DRILL_ENABLED:'false'},
  {PGHOST:'db.pjhmrhejsoofmouedavw.supabase.co'},
  {PGHOST:'127.0.0.2'}, {PGPORT:'5433'},
  {PGUSER:'postgres'}, {PGDATABASE:'postgres'}, {PGPASSWORD:''},
  {SUPABASE_ACCESS_TOKEN:'unsafe-test-token'},
  {IBERFIT_PROD_DATABASE_URL:'postgresql://prod.example.invalid/postgres'},
  {SUPABASE_SERVICE_ROLE_KEY:'unsafe-test-key'},
  {SUPABASE_DB_URL:'postgres://prod.example.invalid/x'},
  {DATABASE_URL:'postgres://prod.example.invalid/x'},
  {RUNNER_TEMP:'/tmp/not-the-workdir'}
 ]){
  const r=denial(env);
  assert.notEqual(r.status,0,JSON.stringify(env));
  assert.match(r.stderr,/M44_DISASTER_REAUTH_DRILL_(?:CI_ISOLATION_REQUIRED|LOCAL_DATABASE_REQUIRED|LIVE_CREDENTIALS_FORBIDDEN|RESTORE_PATH_INVALID)/u);
  assert.doesNotMatch(r.stdout+r.stderr,/unsafe-test-(?:key|token)|postgres:\/\/prod/u);
 }
});
test('M44 disaster drill clones a restored DB, purges all sessions and refresh tokens, retains user identities and factors',()=>{
 assert.match(source,/--template=iberfit_recovery_test/u);
 assert.match(source,/clone=iberfit_m44_disaster_reauth_test/u);
 assert.match(source,/current_database\(\) <> 'iberfit_m44_disaster_reauth_test'/u);
 assert.match(source,/DELETE FROM auth\.refresh_tokens;/u);
 assert.match(source,/DELETE FROM auth\.sessions;/u);
 assert.match(source,/auth\.users/u);
 assert.match(source,/auth\.identities/u);
 assert.match(source,/auth\.mfa_factors/u);
 assert.match(source,/auth\.webauthn_credentials/u);
 assert.match(source,/source_counts.*pg psql/su);
 assert.match(source,/DISASTER_CLONE_CLEANUP_FAILED/u);
 assert.match(source,/M44_HOSTED_AUTH_JWT_SMTP_EDGE_RUNTIME_NOT_CERTIFIED/u);
 assert.doesNotMatch(source,/DELETE\s+FROM\s+(?:auth\.users|auth\.identities|auth\.mfa_factors)/iu);
 assert.doesNotMatch(source,/ALTER\s+TABLE\s+auth\./iu);
 assert.doesNotMatch(source,/DROP\s+TABLE\s+auth\./iu);
});
test('disaster restore path fails before connecting for incorrect source identity',()=>{
 const r=denial({RUNNER_TEMP:'/tmp/isolated-m44-unit-nonexistent'});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/M44_DISASTER_REAUTH_DRILL_RESTORE_PATH_INVALID/u);
});
