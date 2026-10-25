import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const browser=readFileSync(new URL('../qa/rc64/m43-client-real-history.spec.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/qa-real-write-cert.yml',import.meta.url),'utf8');
const browserStep=workflow.split('      - name: Certify Client session and history in mobile tablet desktop')[1]?.split('      - name: Certify real Client UI start')[0];
test('M43 exact-writer Client B UI and server projection prove cross-account isolation',()=>{
  assert.match(browser,/M43 authenticated Cliente B never sees Cliente A workout/u);
  assert.match(browser,/m43QaRunMarkers/u);
  assert.match(browser,/M26_M43_WRITER_ATTEMPT/u);
  assert.match(browser,/snapshot\.data\.m26Entities/u);
  assert.match(browser,/Foreign run marker must not be visible in sessions/u);
  assert.match(browser,/Foreign run marker must not be visible in history/u);
  assert.match(browser,/Foreign run marker must not be visible in planning/u);
  assert.match(browser,/productionTouched:false/u);
  assert.match(browser,/mutationCount:0/u);
});
test('M43 browser step provides isolated second Client credentials without widening egress',()=>{
  assert.ok(browserStep,'M43 browser step must exist');
  assert.match(browserStep,/M26_QA_CLIENT_B_EMAIL: \${{ secrets\.M26_QA_CLIENT_B_EMAIL }}/u);
  assert.match(browserStep,/M26_QA_CLIENT_B_PASSWORD: \${{ secrets\.M26_QA_CLIENT_B_PASSWORD }}/u);
  assert.match(browser,/installCurrentSourceQaNetworkPolicy/u);
  assert.match(browser,/readOnlyRpcs:READ_ONLY_RPCS/u);
  assert.doesNotMatch(browserStep,/SERVICE_ROLE_KEY|supabase_secret|\\-\\-no-verify-jwt/u);
});
