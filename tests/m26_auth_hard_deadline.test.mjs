import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  withAuthOperationTimeout,
  __authOperationTimeoutInternals,
} from '../src/m26/app/auth-operation-timeout.js';

const {
  DEFAULT_AUTH_OPERATION_TIMEOUT_MS,
  normalizedAuthOperationTimeoutMs,
}=__authOperationTimeoutInternals;

test('auth hard deadline has a bounded production default',()=>{
  assert.equal(DEFAULT_AUTH_OPERATION_TIMEOUT_MS,12_000);
  assert.equal(normalizedAuthOperationTimeoutMs(undefined),12_000);
  assert.equal(normalizedAuthOperationTimeoutMs(1),750);
  assert.equal(normalizedAuthOperationTimeoutMs(999_999),60_000);
});

test('an auth backend operation that never settles is released by the hard deadline',async()=>{
  const startedAt=Date.now();
  await assert.rejects(
    ()=>withAuthOperationTimeout(
      ()=>new Promise(()=>{}),
      {timeoutMs:750,code:'M26_TEST_AUTH_TIMEOUT'},
    ),
    /M26_TEST_AUTH_TIMEOUT/u,
  );
  assert.ok(Date.now()-startedAt<2_000,'auth UI must not wait indefinitely for a stalled backend operation');
});

test('WebAuthn authentication bounds every backend stage and post-MFA bootstrap',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  assert.match(source,/boundedMfaBackend\(\(\)=>transport\.enrollWebAuthn/u);
  assert.match(source,/boundedMfaBackend\(\(\)=>transport\.challengeWebAuthn/u);
  assert.match(source,/boundedMfaBackend\(\(\)=>transport\.verifyWebAuthn/u);
  assert.match(source,/boundedMfaBackend\(\(\)=>Promise\.all/u);
  assert.match(source,/M26_WEBAUTHN_BACKEND_TIMEOUT/u);
  assert.match(source,/M26_POST_MFA_SETUP_TIMEOUT/u);
  assert.match(source,/Vuelve a vincular este dispositivo \(recomendado\)/u);
});

test('device re-enrollment also bounds backend calls so recovery cannot freeze',()=>{
  const source=fs.readFileSync('src/m26/app/access-ui.js','utf8');
  assert.match(source,/boundedDeviceBackend\(\(\)=>transport\.authUser/u);
  assert.match(source,/boundedDeviceBackend\(\(\)=>transport\.enrollWebAuthn/u);
  assert.match(source,/boundedDeviceBackend\(\(\)=>transport\.challengeWebAuthn/u);
  assert.match(source,/boundedDeviceBackend\(\(\)=>transport\.verifyWebAuthn/u);
  assert.match(source,/boundedDeviceBackend\(\(\)=>transport\.authAssuranceContext/u);
});
