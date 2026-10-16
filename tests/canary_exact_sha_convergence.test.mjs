import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForExactCanarySha} from '../scripts/prelaunch/canary-exact-sha-convergence.mjs';

const OLD='a'.repeat(40);
const NEW='b'.repeat(40);
const QA='gjztkdwfmunnzhtvxrsu';
const clean=(sourceSha)=>({sourceSha,sourceBranch:'canary/rc74-4',qaOnly:true,projectRef:QA});
const call=(options={})=>waitForExactCanarySha({
  expectedSha:NEW,qaProjectRef:QA,maxAttempts:3,retryDelayMs:3,
  sleep:async()=>{},
  ...options,
});

test('Canary release waits for old QA SHA and accepts only the immutable new SHA',async()=>{
  const observations=[],sleeps=[];
  const values=[clean(OLD),clean(OLD),clean(NEW)];
  const result=await call({
    readVersion:async(attempt)=>values[attempt-1],
    sleep:async(ms)=>sleeps.push(ms),
    onRetry:(item)=>observations.push(item),
  });
  assert.equal(result.version.sourceSha,NEW);
  assert.equal(result.edgeAttempts,3);
  assert.deepEqual(sleeps,[3,3]);
  assert.deepEqual(observations.map(x=>x.reason),['stale-sha','stale-sha']);
  assert.ok(observations.every(x=>x.observedSha===OLD&&x.expectedSha===NEW));
});

test('Canary SHA never accepts unrelated project, branch or unsafe runtime even if SHA is expected',async()=>{
  for(const value of [
    {...clean(NEW),projectRef:'pjhmrhejsoofmouedavw'},
    {...clean(NEW),sourceBranch:'main'},
    {...clean(NEW),qaOnly:false},
    {...clean(NEW),sourceSha:'not-a-sha'},
  ]){
    let calls=0,waits=0;
    await assert.rejects(()=>call({
      readVersion:async()=>{calls++;return value;},
      sleep:async()=>{waits++;},
    }),/PRELAUNCH_LIVE_VERSION_(PROJECT_MISMATCH|BRANCH_MISMATCH|NOT_QA|SHA_INVALID)/);
    assert.equal(calls,1,'unsafe identity fails immediately');
    assert.equal(waits,0);
  }
});

test('Canary persistent previous SHA fails closed after the finite retry budget',async()=>{
  let count=0;const waits=[];
  await assert.rejects(()=>call({
    readVersion:async()=>{count++;return clean(OLD);},
    sleep:async(ms)=>waits.push(ms),
  }),/PRELAUNCH_LIVE_DEPLOY_SHA_MISMATCH/);
  assert.equal(count,3);
  assert.deepEqual(waits,[3,3]);
});

test('Canary transient edge 5xx retries only within budget and never swallows 403',async()=>{
  let calls=0;
  const ok=await call({
    readVersion:async()=>{
      calls++;
      if(calls<3)throw Error('PRELAUNCH_LIVE_HTTP_503');
      return clean(NEW);
    },
  });
  assert.equal(ok.edgeAttempts,3);
  let blocked=0;
  await assert.rejects(()=>call({
    readVersion:async()=>{blocked++;throw Error('PRELAUNCH_LIVE_HTTP_403');},
  }),/PRELAUNCH_LIVE_HTTP_403/);
  assert.equal(blocked,1);
});

test('Canary edge 5xx persisting beyond retry budget fails without false success',async()=>{
  let count=0;
  await assert.rejects(()=>call({
    readVersion:async()=>{count++;throw Error('PRELAUNCH_LIVE_HTTP_502');},
  }),/PRELAUNCH_LIVE_EDGE_5XX_PERSISTENT/);
  assert.equal(count,3);
});

test('Canary expected SHA must be a canonical full commit and response identity is required',async()=>{
  await assert.rejects(()=>call({expectedSha:'abc',readVersion:async()=>clean(NEW)}),/PRELAUNCH_EXPECTED_SHA_INVALID/);
  await assert.rejects(()=>call({readVersion:async()=>({sourceSha:NEW})}),/PRELAUNCH_LIVE_VERSION_BRANCH_MISMATCH/);
  await assert.rejects(()=>call({readVersion:async()=>null}),/PRELAUNCH_LIVE_VERSION_SHA_INVALID/);
});
