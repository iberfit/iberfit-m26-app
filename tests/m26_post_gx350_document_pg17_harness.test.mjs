import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const path='scripts/data-safety/gx_document_consent_isolated_pg17.sh';
const script=readFileSync(path,'utf8');
const workflow=readFileSync('.github/workflows/m26-c-connected360-isolated-pg17.yml','utf8');
const lifecycle=readFileSync('qa/sql/connected360-document/lifecycle.sql','utf8');
// Synthetic format-only credential fixture; the real CI launcher generates a random value.
const disposableDbCredential='a'.repeat(64);
const env={PATH:process.env.PATH,IBERFIT_PG17_SYNTHETIC_ONLY:'YES',PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'postgres',PGPASSWORD:disposableDbCredential};
test('document PG17 harness shell parses and refuses every non-synthetic connection parameter before docker',()=>{
 assert.equal(spawnSync('bash',['-n',path]).status,0);
 for(const key of Object.keys(env).filter(k=>k!=='PATH')){
  const r=spawnSync('bash',[path],{env:{...env,[key]:'invalid'},encoding:'utf8',timeout:5000});
  assert.equal(r.status,65,key);assert.match(r.stderr,/GX_DOCUMENT_ISOLATED_PG17_ONLY/u);
 }
});
test('document PG17 job is isolated, reads no repository secrets, and retains existing V47 job',()=>{
 assert.match(workflow,/isolated-pg17-roles-and-rollback:/u);
 assert.match(workflow,/isolated-pg17-document-consent:/u);
 const launcher=readFileSync('scripts/data-safety/run_disposable_pg17_ci.sh','utf8');
 assert.match(launcher,/postgres:17-alpine/u);
 assert.match(launcher,/-p 127\.0\.0\.1:5432:5432/u);
 assert.match(launcher,/openssl rand -hex 32/u);
 assert.match(workflow,/run: bash scripts\/data-safety\/run_disposable_pg17_ci\.sh scripts\/data-safety\/gx_document_consent_isolated_pg17\.sh/u);
 assert.doesNotMatch(workflow,/secrets\./u);
 assert.match(script,/GX_DOCUMENT_FRESH_PG17_REQUIRED/u);
});
test('PG17 harness executes the actual GX installers and rollback; V53 full release guard is not bypassed',()=>{
 for(const file of ['connected360_v49_coach_activity_consent_v1.sql','gx_connected360_report_observations_v1.sql','gx_connected360_document_consent_v1.sql','gx_connected360_report_observations_v1.rollback.sql','gx_connected360_document_consent_v1.rollback.sql'])assert.ok(script.includes('-f /repo/supabase/release-procedures/'+file));
 assert.match(script,/print\(s\[s.index\(a\):s.index\(b\)\+len\(b\)\]\)/u);
 assert.doesNotMatch(script,/-f .*connected360_v53_apple_exercise_authorization_v1\.sql/u);
 assert.match(script,/GX_DOCUMENT_CONSENT_ROLLBACK_REQUIRES_HISTORY_RETENTION/u);
});
test('PG17 suite requires true read-only execution, real role denial, cross-owner denial and both wait orders',()=>{
 assert.match(lifecycle,/BEGIN READ ONLY;/u);
 assert.match(lifecycle,/SET ROLE authenticated;/u);
 assert.match(lifecycle,/cross-owner acceptance/u);
 assert.match(lifecycle,/acceptance replay/u);
 assert.match(lifecycle,/corrected activity invalidated/u);
 assert.match(lifecycle,/assignment retired/u);
 assert.match(script,/pg_blocking_pids\(w.pid\)/u);
 assert.match(script,/run_race health_connect withdrawal/u);
 assert.match(script,/run_race apple_health publication/u);
 assert.match(script,/both withdrawn reports denied/u);
});
