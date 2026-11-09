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
const remote=async(url,options)=>({
 ok:true,json:async()=>({object:{sha}})
});
test('current protected Canary SHA passes one GitHub-only HEAD check',async()=>{
 let calls=0;
 const result=await requireCurrentCanarySha({env,fetchImpl:async(u,o)=>{
  calls++;assert.match(u,/^https:\/\/api\.github\.com\/repos\/iberfit\/iberfit-m26-app\/git\/ref\/heads\/canary\/rc74-4$/u);
  assert.equal(o.method,'GET');return remote(u,o);
 }});
 assert.deepEqual(result,{checked:true,current:true});assert.equal(calls,1);
});
test('obsolete Canary push fails closed without ever certifying a stale SHA',async()=>{
 await assert.rejects(
  requireCurrentCanarySha({env,fetchImpl:async()=>({ok:true,json:async()=>({object:{sha:'b'.repeat(40)}})})}),
  /P0_QA_SUPERSEDED_CANARY_SHA_SKIP/u
 );
});
test('GitHub API denial, invalid ref, absent read token and invalid branch fail closed',async()=>{
 await assert.rejects(requireCurrentCanarySha({env,fetchImpl:async()=>({ok:false,status:403})}),/P0_QA_CANARY_HEAD_HTTP_FAILURE/u);
 await assert.rejects(requireCurrentCanarySha({env,fetchImpl:async()=>({ok:true,json:async()=>({object:{sha:'bad'}})})}),/P0_QA_CANARY_HEAD_INVALID/u);
 await assert.rejects(requireCurrentCanarySha({env:{...env,GH_READ_TOKEN:''},fetchImpl:remote}),/P0_QA_GITHUB_READ_TOKEN_MISSING/u);
 await assert.rejects(requireCurrentCanarySha({env:{...env,GITHUB_REF:'refs/heads/main'},fetchImpl:remote}),/P0_QA_CANARY_SOURCE_MISMATCH/u);
 await assert.rejects(requireCurrentCanarySha({env,fetchImpl:async()=>{throw new Error('secret details')}}),/P0_QA_CANARY_HEAD_READ_FAILED/u);
});
test('manual and PR certifications remain unconditional and make no GitHub request',async()=>{
 for(const event of ['workflow_dispatch','pull_request']){
  const result=await requireCurrentCanarySha({env:{...env,GITHUB_EVENT_NAME:event},fetchImpl:async()=>{throw new Error('must not fetch')}});
  assert.deepEqual(result,{checked:false,current:true});
 }
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
test('every shared QA job checks current SHA before its first network-sensitive step',()=>{
 let total=0;
 for(const file of workflows){
  const source=readFileSync(file,'utf8');
  const sections=source.split(/(?=\n  [a-zA-Z][\w-]*:\n)/u);
  const jobs=sections.filter(s=>s.includes('group: iberfit-qa-shared-auth-readonly'));
  assert.ok(jobs.length>0,file+' missing QA group');
  for(const job of jobs){
   total++;
   const marker='node scripts/ops/require_current_canary_sha.mjs';
   assert.equal(job.split(marker).length-1,1,file+' must check once per shared QA job');
   const index=job.indexOf(marker);
   const firstQaEnv=job.search(/M26_SUPABASE_URL|QA_SUPABASE_URL|SUPABASE_ACCESS_TOKEN|M26_QA_COACH_PASSWORD/u);
   if(firstQaEnv>=0)assert.ok(index<firstQaEnv,file+' must check before credentials/QA network');
   assert.match(job,/cancel-in-progress: false/u,'do not cancel in-flight certified QA work');
  }
 }
 assert.ok(total>=11,'all existing shared QA jobs must remain covered');
});
