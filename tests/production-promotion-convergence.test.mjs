import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyUntilStable} from '../scripts/stable_verification.mjs';

function edgeError(code){
  const error=new Error(code);
  error.code=code;
  return error;
}

test('requires the configured number of consecutive successful verifications',async()=>{
  let calls=0;
  const sleeps=[];
  const result=await verifyUntilStable({
    attempts:6,
    stablePasses:3,
    delayMs:4_000,
    verifyAttempt:async()=>({call:++calls}),
    sleepImpl:async(ms)=>sleeps.push(ms),
  });

  assert.equal(calls,3);
  assert.equal(result.attempt,3);
  assert.equal(result.consecutivePasses,3);
  assert.deepEqual(sleeps,[4_000,4_000]);
});

test('resets the convergence streak after a stale edge response',async()=>{
  const sequence=['current','current','stale','current','current','current'];
  let calls=0;
  const passStreaks=[];
  const failures=[];
  const result=await verifyUntilStable({
    attempts:8,
    stablePasses:3,
    delayMs:1,
    verifyAttempt:async()=>{
      const state=sequence[calls++]||'current';
      if(state==='stale')throw edgeError('PROD_SURFACE_VERSION_SHA_MISMATCH');
      return {state};
    },
    sleepImpl:async()=>{},
    onPass:({consecutivePasses})=>passStreaks.push(consecutivePasses),
    onFailure:({code})=>failures.push(code),
  });

  assert.equal(result.attempt,6);
  assert.deepEqual(passStreaks,[1,2,1,2,3]);
  assert.deepEqual(failures,['PROD_SURFACE_VERSION_SHA_MISMATCH']);
});

test('fails closed when the edge never converges',async()=>{
  let calls=0;
  await assert.rejects(
    verifyUntilStable({
      attempts:4,
      stablePasses:3,
      delayMs:1,
      verifyAttempt:async()=>{
        calls+=1;
        throw edgeError('PROD_SURFACE_VERSION_SHA_MISMATCH');
      },
      sleepImpl:async()=>{},
    }),
    error=>error?.code==='PROD_SURFACE_VERSION_SHA_MISMATCH',
  );
  assert.equal(calls,4);
});

test('rejects impossible convergence configuration before any request',async()=>{
  let calls=0;
  await assert.rejects(
    verifyUntilStable({
      attempts:2,
      stablePasses:3,
      delayMs:1,
      verifyAttempt:async()=>{calls+=1;},
      sleepImpl:async()=>{},
    }),
    error=>error?.code==='STABLE_VERIFICATION_PASSES_EXCEED_ATTEMPTS',
  );
  assert.equal(calls,0);
});
