import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(path,'utf8');
const targets=[
  'qa/rc64/m43-client-real-history.spec.mjs',
  'qa/rc64/m43-coach-real-workspace.spec.mjs',
  'qa/rc64/m43-client-interactive.spec.mjs',
];
test('M43 browser suites revoke each synthetic current-run browser lease after its test',()=>{
  for(const target of targets){
    const content=source(target);
    assert.match(content,/import \{releaseQaSessionBeforeContextClose\} from '\.\/qa-session-cleanup\.mjs';/u,target);
    assert.match(content,/test\.afterEach\(async\(\{page\},testInfo\)=>\{/u,target);
    assert.match(content,/releaseQaSessionBeforeContextClose\(page\)/u,target);
    assert.match(content,/M43_QA_PAGE_AUTH_RELEASE/u,target);
    assert.match(content,/testInfo\.status==='passed'/u,target);
  }
});
test('M43 interactive second desktop context revokes its own lease on failure or success',()=>{
  const content=source('qa/rc64/m43-client-interactive.spec.mjs');
  assert.match(content,/let desktopPage=null;\s*try\{/u);
  assert.match(content,/desktopPage=await runningDesktopContext\.newPage\(\);/u);
  assert.match(content,/finally\s*\{\s*if\(desktopPage\)\s*\{\s*const status=await releaseQaSessionBeforeContextClose\(desktopPage\)/u);
  assert.match(content,/await runningDesktopContext\.close\(\);/u);
});
test('current-source QA network policy permits only QA-origin browser local logout',()=>{
  const policy=source('qa/rc64/secure-current-source-auth.mjs');
  const entry=policy.indexOf('function allowedQaRequest(');
  assert.ok(entry>0);
  const section=policy.slice(entry,entry+1200);
  assert.match(section,/if\(url\.origin!==SUPABASE_ORIGIN\)return false;/u);
  assert.match(section,/method==='POST'&&url\.pathname==='\/auth\/v1\/logout'/u);
  const cleanup=source('qa/rc64/qa-session-cleanup.mjs');
  assert.match(cleanup,/\/auth\/v1\/logout\?scope=local/u);
  assert.match(cleanup,/QA_PROJECT_REF/u);
  assert.match(cleanup,/iberfit:m26:session:v1/u);
});
test('writer QA path filter certifies all M43 browsers and their lifecycle tests',()=>{
  const workflow=source('.github/workflows/qa-real-write-cert.yml');
  const pr=workflow.slice(workflow.indexOf('  pull_request:'),workflow.indexOf('  push:'));
  const push=workflow.slice(workflow.indexOf('  push:'),workflow.indexOf('  workflow_dispatch:'));
  for(const path of [...targets,'tests/m26_p0_free_m43_browser_session_cleanup_contract.test.mjs']){
    assert.ok(pr.includes("'"+path+"'"),'QA_PR_TRIGGER_MISSING:'+path);
    assert.ok(push.includes("'"+path+"'"),'QA_PUSH_TRIGGER_MISSING:'+path);
  }
});
