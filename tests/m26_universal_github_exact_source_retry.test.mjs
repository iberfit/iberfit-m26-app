import test from 'node:test';
import assert from 'node:assert/strict';
import {requireCurrentCanarySha,retryableCurrentSourceRead} from '../scripts/ops/require_current_canary_sha.mjs';

const repo='iberfit/iberfit-m26-app',sha='a'.repeat(40);
const env={GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:repo,GITHUB_REF:'refs/heads/canary/rc74-4',
 GITHUB_SHA:sha,GH_READ_TOKEN:'synthetic-test-token',GITHUB_API_URL:'https://api.github.com'};
const answer=(status,headers={})=>({
 status,ok:status===200,
 headers:{get:key=>headers[key]??null},
 json:async()=>({object:{sha}}),
});

test('P0 exact-source check tolerates one transient 503 GET without losing SHA comparison',async()=>{
 let calls=0,delays=[];
 const result=await requireCurrentCanarySha({env,
  fetchImpl:async()=>++calls===1?answer(503):answer(200),
  sleep:async(ms)=>{delays.push(ms)},
 });
 assert.equal(result.current,true);assert.equal(result.checked,true);
 assert.equal(calls,2);assert.deepEqual(delays,[1500]);
});
test('P0 rejects permanent 401 and 403 promptly, only retries provider-marked rate-limit 403',async()=>{
 assert.equal(retryableCurrentSourceRead(answer(401)),false);
 assert.equal(retryableCurrentSourceRead(answer(403)),false);
 assert.equal(retryableCurrentSourceRead(answer(403,{'retry-after':'2'})),true);
 assert.equal(retryableCurrentSourceRead(answer(429)),true);
 for(const status of [401,403]){
  let calls=0;
  await assert.rejects(requireCurrentCanarySha({env,
   fetchImpl:async()=>{calls++;return answer(status);},sleep:async()=>{}
  }),/P0_QA_CANARY_HEAD_HTTP_FAILURE/u);
  assert.equal(calls,1);
 }
 let calls=0,pauses=0;
 await requireCurrentCanarySha({env,fetchImpl:async()=>++calls===1
  ?answer(403,{'retry-after':'2'}):answer(200),
  sleep:async()=>{pauses++}});
 assert.equal(calls,2);assert.equal(pauses,1);
});
test('P0 fails closed after three transient responses, on excessive retry-after and on a changed live SHA',async()=>{
 let calls=0;
 await assert.rejects(requireCurrentCanarySha({env,
  fetchImpl:async()=>{calls++;return answer(503)},sleep:async()=>{}
 }),/P0_QA_CANARY_HEAD_HTTP_FAILURE/u);
 assert.equal(calls,3);
 await assert.rejects(requireCurrentCanarySha({env,
  fetchImpl:async()=>answer(429,{'retry-after':'45'}),sleep:async()=>{}
 }),/P0_QA_GITHUB_RATE_LIMIT_RETRY_TOO_LONG/u);
 await assert.rejects(requireCurrentCanarySha({env,
  fetchImpl:async()=>({...answer(200),json:async()=>({object:{sha:'b'.repeat(40)}})}),
  sleep:async()=>{}
 }),/P0_QA_SUPERSEDED_CANARY_SHA_SKIP/u);
});
