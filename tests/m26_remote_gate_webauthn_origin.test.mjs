import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../scripts/remote-gates/run_authenticated_readonly_gate.mjs', import.meta.url), 'utf8');

test('authenticated remote gate binds privileged requests to the Canary WebAuthn RP', () => {
  assert.match(source, /const CANARY_ORIGIN='https:\/\/m26-canary\.iberfit\.cl'/);
  assert.match(source, /origin:CANARY_ORIGIN/);
  assert.match(source, /assurance\?\.origin!==CANARY_ORIGIN/);
  assert.match(source, /assurance\?\.rpId!=='m26-canary\.iberfit\.cl'/);
});

test('remote gate preserves privileged WebAuthn assurance while primary-auth reads remain available', () => {
  assert.match(source, /credentialEnrolled!==true/);
  assert.match(source, /webauthnRequired!==true/);
  assert.match(source, /iberfitAssurance!=='required'/);
  assert.match(source, /primaryAuthRead:\{ok:true,status:200/);
  assert.match(source, /privilegedGate:\{ok:true/);
  assert.doesNotMatch(source, /\/functions\/v1\/iberfit-webauthn-v1/);
});
