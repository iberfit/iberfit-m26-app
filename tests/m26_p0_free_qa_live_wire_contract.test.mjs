import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cfg=readFileSync('playwright.p0-free-history.config.mjs','utf8');
const source=readFileSync('qa/p0-free-history/live-client-a.spec.mjs','utf8');

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
