import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requireCurrentCanarySha} from '../scripts/ops/require_current_canary_sha.mjs';

const sha='a'.repeat(40);
const env={
 GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:'iberfit/iberfit-m26-app',
 GITHUB_REF:'refs/heads/canary/rc74-4',GITHUB_SHA:sha,
 GITHUB_API_URL:'https://api.github.com',GH_READ_TOKEN:'test-token'
};
const remote=async()=>({ok:true,json:async()=>({object:{sha}})});
const prNumber=1304;
const qaPrEnv={...env,GITHUB_EVENT_NAME:'pull_request',
 GITHUB_REF:'refs/pull/'+prNumber+'/merge',GITHUB_EVENT_PATH:'/test/event.json'};
const event={
 number:prNumber,pull_request:{
  number:prNumber,draft:false,head:{sha},
  base:{ref:'canary/rc74-4',repo:{full_name:'iberfit/iberfit-m26-app'}}
 }
};
const prResponse=(overrides={})=>({
 ok:true,json:async()=>({
  state:'open',draft:false,head:{sha},
  base:{ref:'canary/rc74-4',repo:{full_name:'iberfit/iberfit-m26-app'}},
  ...overrides
 })
});
const readEvent=async()=>event;

test('protected Canary SHA passes exactly one GitHub-only HEAD check',async()=>{
 let calls=0;
 const result=await requireCurrentCanarySha({env,fetchImpl:async(u,o)=>{
  calls++;assert.equal(u,'https://api.github.com/repos/iberfit/iberfit-m26-app/git/ref/heads/canary/rc74-4');
  assert.equal(o.method,'GET');return remote();
 }});
 assert.deepEqual(result,{checked:true,current:true});assert.equal(calls,1);
});

test('obsolete Canary push fails closed before Supabase',async()=>{
 await assert.rejects(requireCurrentCanarySha({env,fetchImpl:async()=>({
  ok:true,json:async()=>({object:{sha:'b'.repeat(40)}})
 })}),/P0_QA_SUPERSEDED_CANARY_SHA_SKIP/u);
});

test('protected push rejects GitHub errors, wrong identity and invalid SHA',async()=>{
 await assert.rejects(requireCurrentCanarySha({env,fetchImpl:async()=>({ok:false,status:403})}),/P0_QA_CANARY_HEAD_HTTP_FAILURE/u);
 await assert.rejects(requireCurrentCanarySha({env,fetchImpl:async()=>({
  ok:true,json:async()=>({object:{sha:'bad'}})
 })}),/P0_QA_CANARY_HEAD_INVALID/u);
 await assert.rejects(requireCurrentCanarySha({env:{...env,GH_READ_TOKEN:''},fetchImpl:remote}),/P0_QA_GITHUB_READ_TOKEN_MISSING/u);
 await assert.rejects(requireCurrentCanarySha({env:{...env,GITHUB_REF:'refs/heads/main'},fetchImpl:remote}),/P0_QA_CANARY_SOURCE_MISMATCH/u);
 await assert.rejects(requireCurrentCanarySha({env,fetchImpl:async()=>{throw Error('private detail')}}),/P0_QA_CANARY_HEAD_READ_FAILED/u);
});

test('queued current PR is revalidated AFTER shared QA mutex by one GitHub read',async()=>{
 let calls=0;
 const outcome=await requireCurrentCanarySha({
  env:qaPrEnv,eventReader:readEvent,fetchImpl:async(u,o)=>{
   calls++;assert.equal(u,'https://api.github.com/repos/iberfit/iberfit-m26-app/pulls/'+prNumber);
   assert.equal(o.method,'GET');return prResponse();
  }
 });
 assert.deepEqual(outcome,{checked:true,current:true});assert.equal(calls,1);
});

test('queued outdated, closed and draft PRs fail rather than consuming QA bandwidth',async()=>{
 for(const overrides of [
  {head:{sha:'b'.repeat(40)}},{state:'closed'},{draft:true},
  {base:{ref:'main',repo:{full_name:'iberfit/iberfit-m26-app'}}}
 ]){
  await assert.rejects(requireCurrentCanarySha({
   env:qaPrEnv,eventReader:readEvent,fetchImpl:async()=>prResponse(overrides)
  }),/P0_QA_SUPERSEDED_PR_SKIP/u);
 }
});

test('PR guard rejects invalid event, target, source and API fail-closed',async()=>{
 await assert.rejects(requireCurrentCanarySha({
  env:{...qaPrEnv,GITHUB_EVENT_PATH:''},eventReader:readEvent,fetchImpl:prResponse
 }),/P0_QA_PR_EVENT_MISSING/u);
 await assert.rejects(requireCurrentCanarySha({
  env:qaPrEnv,eventReader:async()=>{throw Error('private event')},fetchImpl:prResponse
 }),/P0_QA_PR_EVENT_INVALID/u);
 await assert.rejects(requireCurrentCanarySha({
  env:qaPrEnv,eventReader:async()=>({...event,pull_request:{...event.pull_request,head:{sha:'bad'}}}),fetchImpl:prResponse
 }),/P0_QA_PR_IDENTITY_INVALID/u);
 await assert.rejects(requireCurrentCanarySha({
  env:{...qaPrEnv,GITHUB_REF:'refs/heads/main'},eventReader:readEvent,fetchImpl:prResponse
 }),/P0_QA_PR_TARGET_MISMATCH/u);
 await assert.rejects(requireCurrentCanarySha({
  env:qaPrEnv,eventReader:async()=>({...event,pull_request:{...event.pull_request,draft:true}}),fetchImpl:prResponse
 }),/P0_QA_SUPERSEDED_PR_SKIP/u);
 await assert.rejects(requireCurrentCanarySha({
  env:qaPrEnv,eventReader:readEvent,fetchImpl:async()=>({ok:false,status:403})
 }),/P0_QA_CANARY_HEAD_HTTP_FAILURE/u);
});

test('explicit workflow dispatch remains untouched and makes no request',async()=>{
 const out=await requireCurrentCanarySha({env:{...env,GITHUB_EVENT_NAME:'workflow_dispatch'},
  fetchImpl:async()=>{throw Error('should not fetch')},
  eventReader:async()=>{throw Error('should not read')}});
 assert.deepEqual(out,{checked:false,current:true});
});

const workflows=[
 '.github/workflows/remote-gates.yml',
 '.github/workflows/device-experience-gate.yml',
 '.github/workflows/daily-use-visual-evidence.yml',
 '.github/workflows/qa-real-write-cert.yml',
 '.github/workflows/coach-webauthn-recurring.yml',
 '.github/workflows/admin-webauthn-recurring.yml',
 '.github/workflows/canary-exact-deploy.yml'
];
test('all 11 shared QA jobs revalidate current source before their first QA request',()=>{
 let total=0;
 for(const file of workflows){
  const source=readFileSync(file,'utf8');
  const sections=source.split(/(?=\n  [a-zA-Z][\w-]*:\n)/u);
  const jobs=sections.filter(s=>s.includes('group: iberfit-qa-shared-auth-readonly'));
  assert.ok(jobs.length>0,file+' has no protected QA jobs');
  for(const job of jobs){
   total++;
   const marker='node scripts/ops/require_current_canary_sha.mjs';
   assert.equal(job.split(marker).length-1,1,file+' must validate once after queue');
   const index=job.indexOf(marker);
   const firstQaEnv=job.search(/M26_SUPABASE_URL|QA_SUPABASE_URL|SUPABASE_ACCESS_TOKEN|M26_QA_COACH_PASSWORD/u);
   if(firstQaEnv>=0)assert.ok(index<firstQaEnv,file+' validates before credentials/network');
   assert.match(job,/cancel-in-progress: false/u);
  }
 }
 assert.equal(total,11);
});
test('PR-enabled workflows retain initial gate plus job-level just-in-time freshness checks',()=>{
 for(const file of [
  '.github/workflows/qa-real-write-cert.yml',
  '.github/workflows/daily-use-visual-evidence.yml',
  '.github/workflows/device-experience-gate.yml']){
  const source=readFileSync(file,'utf8');
  assert.match(source,/  pr-current-head:/u);
  assert.match(source,/pull-requests: read/u);
  assert.match(source,/needs\.pr-current-head\.outputs\.current == 'true'/u);
  assert.match(source,/node scripts\/ops\/require_current_canary_sha\.mjs/u);
 }
});
