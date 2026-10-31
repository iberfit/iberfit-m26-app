import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cfg=readFileSync('playwright.p0-free-history.config.mjs','utf8');
const source=readFileSync('qa/p0-free-history/live-client-a-cases.mjs','utf8');

test('live QA client test never saves tracing, screenshots or video',()=>{
  for(const s of ["trace:'off'","screenshot:'off'","video:'off'","workers:1","retries:0"]){
    assert.ok(cfg.includes(s),s);
  }
  assert.doesNotMatch(cfg,/trace:'retain-on-failure'|screenshot:'only-on-failure'/u);
  assert.doesNotMatch(source,/writeFile\([^)]*token|console\.log\([^)]*pages/iu);
});
test('QA only synthetic identities and read-only RPC allowlist',()=>{
  for(const s of [
   'qa.rc74.client-a@iberfit.cl','qa.rc74.client-b@iberfit.cl',
   'gjztkdwfmunnzhtvxrsu','ibERfit_client_completed_history_page_free_v1'.toLowerCase(),
   "method==='POST'","safe(req)","page.on('requestfailed'"]){
    if(s==="method==='POST'")continue;
    assert.ok(source.includes(s),s);
  }
  assert.ok(source.includes("return m==='POST'&&u.pathname.startsWith('/rest/v1/rpc/')"));
  assert.ok(source.includes("return route.abort('blockedbyclient')"));
  assert.ok(source.includes("bodyOrJWTRecorded:false"));
  assert.doesNotMatch(source,/\b(?:POST|PATCH|PUT|DELETE) (?:\/rest\/v1\/domain_entities|\/storage\/v1\/object\/)/u);
});
test('no automatic pages, complete cursor invariant and decoded vs network measurements',()=>{
  for(const s of ['navigation must issue zero page RPCs','[data-m26-free-history-open]',
    'new Set(pages.flatMap(p=>p.ids)).size','new Set(pages.map(p=>p.fingerprint)).size',
    'request().sizes()', 'chromiumNetworkBodyBytes','decodedHistoryBytes',
    'notBillingEgress:true'])assert.ok(source.includes(s),s);
  assert.ok(source.includes("bodyOrJWTRecorded:false"));
  assert.ok(source.includes("expect(pageErrors).toEqual([])"));
});

test('QA E2E runs as an imported registration module, not a second test file import',()=>{
 const entry=readFileSync('qa/p0-free-history/live-client-a.spec.mjs','utf8');
 const auth=readFileSync('qa/rc64/authenticated-current-contract.spec.mjs','utf8');
 assert.match(entry,/registerQaLiveHistoryTestSuite\(\)/u);
 assert.match(auth,/registerQaLiveHistoryTestSuite\(\)/u);
 assert.doesNotMatch(auth,/import ['"]\.\.\/p0-free-history\/live-client-a\.spec\.mjs/u);
 const m43=readFileSync('qa/rc64/m43-client-real-history.spec.mjs','utf8');
 assert.doesNotMatch(m43,/registerQaLiveHistoryTestSuite/u);
 assert.match(source,/test\.setTimeout\(220000\)/u);
 const authConfig=readFileSync('playwright.authenticated.config.mjs','utf8');
 assert.ok(authConfig.includes("trace:'off',screenshot:'off',video:'off'"));
 assert.doesNotMatch(source,/test\.use\(\{trace:/u);
});

test('single-user read-only QA browser only: synthetic M43 fixture budget is not touched',()=>{
 const auth=readFileSync('qa/rc64/authenticated-current-contract.spec.mjs','utf8');
 const m43=readFileSync('qa/rc64/m43-client-real-history.spec.mjs','utf8');
 assert.match(auth,/registerQaLiveHistoryTestSuite/u);
 assert.doesNotMatch(m43,/registerQaLiveHistoryTestSuite/u);
 assert.match(source,/testInfo\.project\.name!=='authenticated-readonly-chromium'/u);
 assert.doesNotMatch(source,/M43_QA_INTERACTIVE_FIXTURE|execute_command|run_qa_m43_coach_client_write_gate/u);
});

test('recording safety is in both runner configs, never overridden at nested describe scope',()=>{
 const live=readFileSync('playwright.p0-free-history.config.mjs','utf8');
 const authenticated=readFileSync('playwright.authenticated.config.mjs','utf8');
 assert.ok(live.includes("trace:'off',screenshot:'off',video:'off'"));
 assert.ok(authenticated.includes("trace:'off',screenshot:'off',video:'off'"));
 assert.doesNotMatch(source,/test\.use\(\{trace:/u);
});
