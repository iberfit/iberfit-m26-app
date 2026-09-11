import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  runAuthenticationContinuationWithDeadline,
} from '../src/m26/app/application.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('P0 auth continuation has a global deadline and releases never-settling work',async()=>{
  let timeoutCalled=0;
  const started=Date.now();
  await assert.rejects(
    runAuthenticationContinuationWithDeadline({
      run:()=>new Promise(()=>{}),
      timeoutMs:5_000,
      setTimeoutFn:(fn)=>setTimeout(fn,5),
      clearTimeoutFn:clearTimeout,
      onTimeout:()=>{timeoutCalled+=1;},
    }),
    /M26_AUTH_CONTINUATION_TIMEOUT/u,
  );
  assert.equal(timeoutCalled,1);
  assert.ok(Date.now()-started<500);
});

test('P0 successful auth continuation clears its deadline without firing recovery',async()=>{
  let timeoutCalled=0;
  const value=await runAuthenticationContinuationWithDeadline({
    run:async()=>42,
    timeoutMs:5_000,
    setTimeoutFn:(fn)=>setTimeout(fn,50),
    clearTimeoutFn:clearTimeout,
    onTimeout:()=>{timeoutCalled+=1;},
  });
  assert.equal(value,42);
  assert.equal(timeoutCalled,0);
});

test('P0 saved-session resume and retry are globally bounded and invalidate stale attempts',()=>{
  const app=read('src/m26/app/application.js');
  assert.match(app,/const AUTH_CONTINUATION_TIMEOUT_MS=18_000;/u);
  assert.match(app,/function beginAuthAttempt\(\)/u);
  assert.match(app,/function invalidateAuthAttempt\(attemptId=null\)/u);
  assert.match(app,/function assertActiveAuthAttempt\(attemptId=null\)/u);
  assert.match(app,/M26_AUTH_ATTEMPT_SUPERSEDED/u);
  assert.match(app,/async function continueAfterFirstFactor\(authAttemptId=null\)/u);
  assert.match(app,/runBoundedAuthContinuation\(\s*\(\)=>continueAfterFirstFactor\(authAttemptId\)/u);
  assert.match(app,/async function hydratePass\(\{reason='bootstrap',authAttemptId=null\}=\{\}\)/u);
  assert.match(app,/assertActiveAuthAttempt\(authAttemptId\);\s*store\.hydrate\(enriched\)/u);
});

test('P0 post-MFA authenticated setup uses the same bounded continuation contract',()=>{
  const app=read('src/m26/app/application.js');
  const emailStart=app.indexOf('async function verifyMfaEmailCode');
  const webStart=app.indexOf('async function continueMfaWithWebAuthn');
  const surfaceStart=app.indexOf('function surfaceRetriableSessionFailure');
  assert.ok(emailStart>=0&&webStart>emailStart&&surfaceStart>webStart);
  const emailBlock=app.slice(emailStart,webStart);
  const webBlock=app.slice(webStart,surfaceStart);
  assert.match(emailBlock,/authAttemptId=beginAuthAttempt\(\)/u);
  assert.match(emailBlock,/runBoundedAuthContinuation\([\s\S]*setupAuthenticated\(\{authAttemptId\}\)/u);
  assert.match(webBlock,/authAttemptId=beginAuthAttempt\(\)/u);
  assert.match(webBlock,/runBoundedAuthContinuation\([\s\S]*setupAuthenticated\(\{authAttemptId\}\)/u);
});
