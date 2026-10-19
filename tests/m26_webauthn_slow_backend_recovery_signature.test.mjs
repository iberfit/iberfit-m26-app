import test from 'node:test';
import assert from 'node:assert/strict';

import {MFA_BACKEND_TIMEOUT_MS,webAuthnFailureRecovery} from '../src/m26/app/application.js';
import {withAuthOperationTimeout} from '../src/m26/app/auth-operation-timeout.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const backendError='M26_WEBAUTHN_BACKEND_TIMEOUT';
const copy='La verificación segura tardó más de lo esperado. Tu cuenta sigue protegida. Inténtalo de nuevo; no necesitas volver a vincular este dispositivo.';

test('slow but valid 11.6s WebAuthn options response fits a finite deadline',()=>{
  // The real QA browser recorded a 11.636s OPTIONS response; 10s rejected it.
  assert.ok(MFA_BACKEND_TIMEOUT_MS>=15_000);
  assert.ok(MFA_BACKEND_TIMEOUT_MS>11_636);
  assert.ok(MFA_BACKEND_TIMEOUT_MS<=20_000);
});

test('backend latency never implies a broken passkey or privileged assurance',()=>{
  for(const initialKind of ['challenge','registration','enroll-required']){
    assert.deepEqual(webAuthnFailureRecovery({code:backendError,initialKind}),{
      backendTimeout:true,deviceRecoveryRecommended:false,
    });
  }
  assert.deepEqual(webAuthnFailureRecovery({code:'M26_TIMEOUT',initialKind:'challenge'}),{
    backendTimeout:true,deviceRecoveryRecommended:false,
  });
});

test('native ceremony timeout can still recommend device recovery only after challenge',()=>{
  const cases=['M26_WEBAUTHN_TIMEOUT','M26_WEBAUTHN_NOT_ALLOWED','M26_WEBAUTHN_CREDENTIAL_MISSING','M26_WEBAUTHN_INVALID_STATE'];
  for(const code of cases){
    assert.deepEqual(webAuthnFailureRecovery({code,initialKind:'challenge'}),{
      backendTimeout:false,deviceRecoveryRecommended:true,
    });
    assert.equal(webAuthnFailureRecovery({code,initialKind:'enroll-required'}).deviceRecoveryRecommended,false);
  }
});

test('unrelated failures never trigger a passkey reset recommendation',()=>{
  for(const code of ['M26_MFA_IDENTITY_MISMATCH','M26_PRIVILEGED_WEBAUTHN_REQUIRED','','M26_AUTH_REQUIRED']){
    const outcome=webAuthnFailureRecovery({code,initialKind:'challenge'});
    assert.equal(outcome.backendTimeout,false);
    assert.equal(outcome.deviceRecoveryRecommended,false);
  }
});

test('finite backend timeout fails closed and releases a hung operation',async()=>{
  let finished=false;
  await assert.rejects(
    withAuthOperationTimeout(()=>new Promise(()=>{}),{timeoutMs:35,code:backendError}),
    /M26_WEBAUTHN_BACKEND_TIMEOUT/u,
  );
  finished=true;
  assert.equal(finished,true);
});

test('server-delay guidance preserves device credentials and supports every app language',()=>{
  assert.doesNotMatch(copy,/recomendado|vuelve a vincular este dispositivo \(recomendado\)/iu);
  for(const language of ['en','fr','pt']){
    const translated=iberfitSurfaceTranslate(copy,{language});
    assert.ok(translated.length>50);
    assert.notEqual(translated,copy);
  }
});
