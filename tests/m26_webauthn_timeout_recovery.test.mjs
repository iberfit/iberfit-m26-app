import test from 'node:test';
import assert from 'node:assert/strict';

import {__webauthnInternals} from '../src/m26/app/webauthn.js';

const {
  DEFAULT_WEBAUTHN_TIMEOUT_MS,
  normalizedTimeoutMs,
  withCeremonyTimeout,
}=__webauthnInternals;

test('WebAuthn timeout keeps a safe production default and clamps invalid values',()=>{
  assert.equal(DEFAULT_WEBAUTHN_TIMEOUT_MS,20_000);
  assert.equal(normalizedTimeoutMs(undefined),20_000);
  assert.equal(normalizedTimeoutMs(1),1_000);
  assert.equal(normalizedTimeoutMs(999_999),120_000);
});

test('a WebAuthn ceremony that never settles is aborted and released instead of freezing forever',async()=>{
  let abortCalled=false;
  class TestAbortController{
    constructor(){this.signal={aborted:false};}
    abort(){
      abortCalled=true;
      this.signal.aborted=true;
    }
  }

  const startedAt=Date.now();
  await assert.rejects(
    ()=>withCeremonyTimeout(
      (signal)=>{
        assert.equal(signal?.aborted,false);
        return new Promise(()=>{});
      },
      {timeoutMs:1_000,AbortControllerImpl:TestAbortController},
    ),
    /M26_WEBAUTHN_TIMEOUT/u,
  );

  assert.equal(abortCalled,true);
  assert.ok(Date.now()-startedAt<2_500,'hung WebAuthn must be released promptly after its timeout');
});
