import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REPO,CANARY,CANARY_SHA,WORKFLOW,CONFIRM,FEATURE,validateContext,dispatchPayload} from '../scripts/ops/u77_dispatch_protected_m44.mjs';
const valid={GITHUB_REPOSITORY:REPO,GITHUB_REF:'refs/heads/'+FEATURE,
 GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',
 GITHUB_SHA:'a'.repeat(40),GITHUB_TOKEN:'long_synthetic_ci_jwt_only_not_real'};
test('U77 only official protected M44 workflow with explicit confirmation',()=>{
 assert.equal(CANARY,'canary/rc74-4');
 assert.equal(CANARY_SHA,'008d8647356c4f5b36dc86500fb19b4324ce26c4');
 assert.equal(WORKFLOW,'m44-encrypted-disaster-recovery.yml');
 assert.deepEqual(dispatchPayload(),{ref:CANARY,inputs:{confirmation:CONFIRM}});
});
test('U77 rejects forks, PRs, changed branch and retries',()=>{
 assert.doesNotThrow(()=>validateContext(valid));
 for(const mutation of [
  {GITHUB_REPOSITORY:'someone-else/iberfit-m26-app'},
  {GITHUB_REF:'refs/heads/main'},
  {GITHUB_EVENT_NAME:'pull_request'},
  {GITHUB_RUN_ATTEMPT:'2'},
  {GITHUB_SHA:'not-a-sha'},
  {GITHUB_TOKEN:''}
 ])assert.throws(()=>validateContext({...valid,...mutation}));
});
test('U77 never holds PROD secrets and checks exact SHA for both refs',()=>{
 const source=readFileSync(new URL('../scripts/ops/u77_dispatch_protected_m44.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/IBERFIT_PROD_DATABASE_URL|IBERFIT_PROD_STORAGE_SERVICE_KEY|IBERFIT_BACKUP_PASSPHRASE|pjhmrhejsoofmouedavw/);
 assert.match(source,/response.status===204/);
 assert.match(source,/branch.object\?\.sha===CANARY_SHA/);
 assert.match(source,/source\?\.object\?\.sha===e.GITHUB_SHA/);
 assert.match(source,/M44_ALREADY_RUNNING_NO_DUPLICATE_DISPATCH/);
});
