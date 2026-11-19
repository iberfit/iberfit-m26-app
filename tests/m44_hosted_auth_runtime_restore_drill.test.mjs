import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const path='scripts/ops/m44_hosted_auth_runtime_restore_drill.sh';
const script=readFileSync(path,'utf8');
const probe=readFileSync('scripts/ops/m44_isolated_auth_roundtrip.mjs','utf8');
const denial=more=>spawnSync('bash',[path,'/nonexistent'],{
 env:{PATH:process.env.PATH,GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',
 GITHUB_REPOSITORY:'iberfit/iberfit-m26-app',
 M44_AUTH_RUNTIME_DRILL_ENABLED:'true',PGHOST:'127.0.0.1',PGPORT:'5432',
 PGUSER:'supabase_admin',PGDATABASE:'iberfit_recovery_test',
 PGPASSWORD:'a'.repeat(64),RUNNER_TEMP:'/tmp/fixture',
 ...more},encoding:'utf8',timeout:3000
});
test('Hosted recovery proof always fails outside isolated restored PG17 context',()=>{
 for(const e of [
 {GITHUB_ACTIONS:'false'},{RUNNER_OS:'Windows'},
 {GITHUB_REPOSITORY:'other/repo'},
 {M44_AUTH_RUNTIME_DRILL_ENABLED:'false'},
 {PGHOST:'db.pjhmrhejsoofmouedavw.supabase.co'},
 {PGDATABASE:'postgres'}, {PGPASSWORD:'x'},
 {SUPABASE_ACCESS_TOKEN:'never-expose'},
 {IBERFIT_PROD_DATABASE_URL:'postgres://prod.invalid/db'},
 {SUPABASE_SERVICE_ROLE_KEY:'never-expose'},
 {SUPABASE_DB_URL:'postgres://prod.invalid/db'},
 {DATABASE_URL:'postgres://prod.invalid/db'},
 {IBERFIT_BACKUP_PASSPHRASE:'never-expose'}
 ]){
  const r=denial(e);assert.notEqual(r.status,0);
  assert.match(r.stderr,/M44_AUTH_RUNTIME_DRILL_(?:RUNNER_INVALID|LOCAL_DATABASE_INVALID|RESTORE_PATH_INVALID|LIVE_CREDENTIALS_FORBIDDEN)/);
  assert.doesNotMatch(r.stdout+r.stderr,/never-expose|postgres:\/\/prod/);
 }
});
test('operational recovery is always an internal Docker network and disposable clone',()=>{
 assert.match(script,/docker network create --internal/);
 assert.match(script,/--template=iberfit_recovery_test/);
 assert.match(script,/clone=iberfit_m44_hosted_auth_runtime_test/);
 assert.match(script,/current_database\(\)<>'iberfit_m44_hosted_auth_runtime_test'/);
 assert.match(script,/docker network connect --alias m44db/);
 assert.match(script,/axllent\/mailpit:v1\.27\.2/);
 assert.match(script,/supabase\/gotrue:v2\.197\.0/);
 assert.match(script,/GOTRUE_JWT_KEYS/);
 assert.match(script,/DELETE FROM auth\.refresh_tokens;/);
 assert.match(script,/DELETE FROM auth\.sessions;/);
 assert.match(script,/trap cleanup EXIT/);
 assert.match(script,/docker rm -f/);
 assert.match(script,/docker network rm/);
 assert.match(script,/dropdb --if-exists --force/);
 assert.doesNotMatch(script,/--publish[= ]/);
 assert.doesNotMatch(script,/DELETE FROM auth\.(?:users|identities|mfa_factors)/);
 assert.doesNotMatch(script,/platformRecoveryVerified=true/);
});
test('synthetic recovery probe checks hosted auth SMTP ES256 and token rotation',()=>{
 for(const endpoint of ["/health","/signup","/verify","/api/v1/messages","/token?grant_type=password","/token?grant_type=refresh_token","/.well-known/jwks.json","/logout"])
  assert.ok(probe.includes(endpoint),endpoint);
 assert.match(probe,/header\.alg!=='ES256'/);
 assert.match(probe,/verify\('sha256'/);
 assert.match(probe,/@example\.invalid/);
 assert.match(probe,/REVOKED_REFRESH_ACCEPTED/);
 assert.doesNotMatch(probe,/SUPABASE_ACCESS_TOKEN|https:\/\/app\.iberfit\.cl|service_role/);
});
test('no real Hosted Auth restoration is inferred from the synthetic fixture',()=>{
 assert.match(script,/M44_HOSTED_PLATFORM_AND_EDGE_RUNTIME_NOT_CERTIFIED/);
 assert.match(script,/M44_ISOLATED_GOTRUE_ES256_SMTP_AUTH_ROUNDTRIP_VERIFIED_ONLY/);
 assert.match(probe,/M44_ISOLATED_GOTRUE_NEW_ES256_SIGNUP_SMTP_REFRESH_LOGOUT_PASS/);
});

test('SMTP uses fresh random material; HTTP exemptions stay internal-only; parser bounded',()=>{
 assert.match(script,/GOTRUE_SMTP_PASS="\$\(openssl rand -hex 32\)"/);
 assert.ok(script.includes('-e GOTRUE_SMTP_PASS'));
 assert.doesNotMatch(script,/GOTRUE_SMTP_PASS=only-local/);
 assert.equal((probe.match(/NOSONAR: isolated internal-only recovery test|NOSONAR: same isolated network/g)||[]).length,2);
 assert.match(probe,/s\.length>200000/);
 assert.match(probe,/start\+2048/);
 assert.doesNotMatch(probe,/\.matchAll\(/);
});

test('guarded clone reauthentication receives SQL through interactive Docker stdin',()=>{
 assert.match(script,/pg\(\)\{ docker run --rm -i --network host/u);
 assert.match(script,/<<'SQL' \|\| fail CLONE_AUTH_INVALIDATION_FAILED/u);
 assert.match(script,/DELETE FROM auth\.refresh_tokens;/u);
 assert.match(script,/DELETE FROM auth\.sessions;/u);
 assert.match(script,/fail OLD_SESSIONS_REMAIN/u);
});
