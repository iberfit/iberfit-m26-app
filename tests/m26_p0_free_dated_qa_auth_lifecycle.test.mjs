import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runQaStageWithCleanup} from '../scripts/remote-gates/release_qa_auth_sessions.mjs';
const read=path=>readFileSync(path,'utf8');
const U60='qa/rc64/u60-dated-ui-readonly.spec.mjs';
const U74='qa/rc64/u74-dated-ui-write.spec.mjs';
const NODE='scripts/remote-gates/qa_u60_real_dated_journey.mjs';
test('U60 and U74 real QA browser suites close each own Auth lease even on test failure',()=>{
 for(const file of [U60,U74]){
  const source=read(file);
  assert.match(source,/import \{releaseQaSessionBeforeContextClose\} from '\.\/qa-session-cleanup\.mjs'/u,file);
  assert.match(source,/test\.afterEach\(async\(\{page\},testInfo\)=>\{/u,file);
  assert.match(source,/await releaseQaSessionBeforeContextClose\(page\)/u,file);
  assert.match(source,/if\(testInfo\.status==='passed'\)expect\(\['released','no-session'\]\)/u,file);
  assert.match(source,/await releaseQaSessionBeforeContextClose\((?:other|b)\)/u,file);
  assert.match(source,/finally\{await (?:ctxB|other)\.close\(\);\}/u,file);
 }
});
test('Node U71 two-attempt QA authenticated training always revokes three current-run local tokens',()=>{
 const source=read(NODE);
 assert.match(source,/import \{releaseQaAuthSessions,runQaStageWithCleanup\} from '\.\/release_qa_auth_sessions\.mjs'/u);
 assert.match(source,/sessions:\[\]/u);
 assert.match(source,/actualEmail===String\(email\)\.trim\(\)\.toLowerCase\(\)/u);
 assert.match(source,/ctx\.sessions\.push\(\{email:actualEmail,token\}\)/u);
 assert.match(source,/if\(mode==='verify-browser'\)return await verifyBrowserWorkout\(ctx\)/u);
 assert.match(source,/await runQaStageWithCleanup\(\s*\(\)=>runStage\(ctx,mode\),\s*\(\)=>releaseCurrentRun\(ctx\)/u);
 assert.match(source,/async function releaseCurrentRun\(ctx\)\{\s*\/\/ Close ONLY JWTs minted by this QA run/u);
 assert.match(source,/sessions:ctx\.sessions,base:BASE,key:ctx\.key,projectRef:QA/u);
 assert.match(source,/qaOnly:ctx\.e\.M26_QA_ONLY/u);
 assert.match(source,/U71_QA_AUTH_CLEANUP_INCOMPLETE/u);
 assert.doesNotMatch(source,/\/auth\/v1\/logout\?scope=global|SUPABASE_SERVICE_ROLE_KEY|pjhmrhejsoofmouedavw/u);
});
test('current source mandatory workflow path filters retain full signed dated E2E coverage',()=>{
 const u71=read('.github/workflows/u71-qa-real-dated-e2e.yml');
 const u74=read('.github/workflows/u74-qa-dated-browser-e2e.yml');
 for(const item of [U60,NODE])assert.ok(u71.includes("'"+item+"'"),item);
 for(const item of [U74,NODE])assert.ok(u74.includes("'"+item+"'"),item);
 for(const text of [u71,u74]){
  assert.match(text,/github\.run_attempt == 1/u);
  assert.match(text,/github\.run_attempt == 2/u);
  assert.match(text,/environment: m26-canary-readonly/u);
  assert.doesNotMatch(text,/IBERFIT_PROD_DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY/u);
 }
});

test('QA stage cleanup runs once on success and returns the original result',async()=>{
 let calls=0;
 assert.equal(await runQaStageWithCleanup(async()=>42,async()=>{calls++;}),42);
 assert.equal(calls,1);
});
test('QA cleanup failure after successful stage fails the gate',async()=>{
 let calls=0;
 await assert.rejects(runQaStageWithCleanup(async()=>42,async()=>{calls++;throw Error('cleanup');}),/cleanup/);
 assert.equal(calls,1);
});
test('QA stage failure still cleans up and preserves the primary error even if cleanup fails',async()=>{
 const primary=Error('primary');let calls=0,reported=0;
 await assert.rejects(runQaStageWithCleanup(async()=>{throw primary;},async()=>{calls++;throw Error('cleanup');},()=>{reported++;}),e=>e===primary);
 assert.equal(calls,1);assert.equal(reported,1);
 await assert.rejects(runQaStageWithCleanup(async()=>{throw primary;},async()=>{calls++;}),e=>e===primary);
 assert.equal(calls,2);
});
