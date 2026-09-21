import test from 'node:test';
import assert from 'node:assert/strict';

import {runWebAuthnCeremony,__webauthnInternals} from '../src/m26/app/webauthn.js';

const {
  DEFAULT_WEBAUTHN_TIMEOUT_MS,
  normalizedTimeoutMs,
  withNativeTimeout,
  withCeremonyTimeout,
}=__webauthnInternals;

test('WebAuthn timeout keeps a safe production default and clamps invalid values',()=>{
  assert.equal(DEFAULT_WEBAUTHN_TIMEOUT_MS,20_000);
  assert.equal(normalizedTimeoutMs(undefined),20_000);
  assert.equal(normalizedTimeoutMs(1),1_000);
  assert.equal(normalizedTimeoutMs(999_999),120_000);
});

test('native WebAuthn options receive the same bounded deadline used by the JS watchdog',()=>{
  assert.equal(withNativeTimeout({},20_000).timeout,20_000);
  assert.equal(withNativeTimeout({timeout:60_000},20_000).timeout,20_000);
  assert.equal(withNativeTimeout({timeout:8_000},20_000).timeout,8_000);
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

test('a native WebAuthn AbortError stays diagnosable and enters the recoverable NOT_ALLOWED family',async()=>{
  const nativeAbort=new Error('native ceremony interrupted');
  nativeAbort.name='AbortError';
  const navigatorLike={credentials:{
    create:async()=>null,
    get:async()=>{throw nativeAbort;},
  }};

  await assert.rejects(
    ()=>runWebAuthnCeremony(
      {
        type:'request',
        credentialOptions:{publicKey:{
          challenge:'AQID',
          rpId:'app.iberfit.cl',
          allowCredentials:[],
          userVerification:'required',
        }},
      },
      {
        navigatorLike,
        PublicKeyCredentialImpl:function PublicKeyCredential(){},
        timeoutMs:1_000,
      },
    ),
    (error)=>{
      assert.equal(error?.message,'M26_WEBAUTHN_NOT_ALLOWED_ABORTED');
      assert.match(
        String(error?.message||''),
        /M26_WEBAUTHN_(?:TIMEOUT|NOT_ALLOWED|CREDENTIAL_MISSING|INVALID_STATE)/u,
      );
      return true;
    },
  );
});
