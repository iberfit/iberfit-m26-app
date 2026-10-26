import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/coach-webauthn-recurring.yml',import.meta.url),'utf8');
const browser=readFileSync(new URL('../qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs',import.meta.url),'utf8');

test('U37 positive QA probe is enabled only by the intended Canary merge commit',()=>{
  assert.match(workflow,/M26_QA_U37_VERIFY:.*github\.event_name == 'push'.*github\.ref == 'refs\/heads\/canary\/rc74-4'.*startsWith\(github\.event\.head_commit\.message, 'SIGNATURE U37:'\)/u);
  assert.match(workflow,/if: github\.event_name != 'pull_request'/u);
  assert.doesNotMatch(workflow,/M26_QA_U37_VERIFY: ['"]true['"]/u);
  assert.match(workflow,/OIDC_AUDIENCE: iberfit-webauthn-qa-cert/u);
});
test('U37 authenticated read-only endpoints remain opt-in and never widen normal QA requests',()=>{
  assert.match(browser,/process\.env\.M26_QA_U37_VERIFY==='true'/u);
  assert.match(browser,/iberfit_bootstrap_v26_core_u37_qa/u);
  assert.match(browser,/iberfit_privileged_history_page_u37_qa/u);
  assert.match(browser,/READ_ONLY_RPCS\.has\(url\.pathname\.slice\(prefix\.length\)\)/u);
  assert.match(browser,/M26_QA_COACH_EMAIL/u);
});
test('U37 browser probe executes only after real registration and does not persist credentials',()=>{
  const i=browser.indexOf('evidence.registrationVerified=true;');
  const j=browser.indexOf("const u37=await page.evaluate(()=>globalThis.__IBERFIT_QA_U37_PROBE__?.())",i);
  assert.ok(i>=0&&j>i,'genuine WebAuthn first');
  const probe=browser.slice(browser.indexOf('async function installU37BrowserProbe('),browser.indexOf('async function addVirtualAuthenticator('));
  assert.match(probe,/return original\(input,init\)/u);
  assert.match(probe,/credentials:'omit'/u);
  assert.match(probe,/coreRevisionParity:safeRevisions/u);
  assert.doesNotMatch(probe,/console\.(log|error)|writeFile|JSON\.stringify\(auth\)/u);
  assert.doesNotMatch(browser,/evidence\.(authorization|password|accessToken|refreshToken)/u);
});
