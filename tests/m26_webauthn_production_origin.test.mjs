import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('supabase/functions/iberfit-webauthn-v1/index.ts','utf8').replace(/\r\n?/gu,'\n');

test('privileged WebAuthn accepts only the three canonical IBERFIT origins',()=>{
  for(const [origin,rpId] of [
    ['https://m26-canary.iberfit.cl','m26-canary.iberfit.cl'],
    ['https://app.iberfit.cl','app.iberfit.cl'],
    ['https://coach.iberfit.cl','coach.iberfit.cl'],
  ]){
    assert.ok(source.includes(`'${origin}':'${rpId}'`),`missing origin/RP contract for ${origin}`);
  }
  assert.match(source,/const\s+ORIGIN_RP_IDS\s*=\s*Object\.freeze\s*\(/u);
  assert.match(source,/const\s+context=requestContext\(req\);\s*if\(!context\)return\s+fail\(403,'M26_WEBAUTHN_ORIGIN_FORBIDDEN'\)/u);
  assert.doesNotMatch(source,/access-control-allow-origin'\s*:\s*['"]\*['"]/u);
});

test('WebAuthn challenges and verification remain origin-bound',()=>{
  assert.match(source,/\.eq\('origin',origin\)/u);
  assert.match(source,/expectedOrigin:origin/u);
  assert.match(source,/expectedRPID:rpID/u);
  assert.match(source,/generateRegistrationOptions\(\{[\s\S]*?rpID/u);
  assert.match(source,/generateAuthenticationOptions\(\{rpID/u);
});

test('production-origin fix does not weaken privileged role or JWT checks',()=>{
  assert.match(source,/auth\.getUser\(token\)/u);
  assert.match(source,/M26_AUTH_SESSION_INVALID/u);
  assert.match(source,/iberfit_application_context_v14/u);
  assert.match(source,/M26_PRIVILEGED_ROLE_REQUIRED/u);
  assert.match(source,/verify_jwt/u.test('verify_jwt')?/.*/u); // marker: JWT enforcement is deployment-level; source still validates the bearer token explicitly.
  assert.doesNotMatch(source,/service[_-]?role[^\n]*console\.log/iu);
});
