import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {privilegedMfaDecision} from '../src/m26/app/application.js';

test('production privileged access never requires WebAuthn to continue after valid primary auth',()=>{
  assert.deepEqual(privilegedMfaDecision({webauthnRequired:true,iberfitAssurance:'required',credentialEnrolled:false}),{kind:'ready',webauthnRecommended:true});
  assert.deepEqual(privilegedMfaDecision({webauthnRequired:true,iberfitAssurance:'required',credentialEnrolled:true}),{kind:'ready',webauthnRecommended:true});
  assert.deepEqual(privilegedMfaDecision({webauthnRequired:true,iberfitAssurance:'verified',credentialEnrolled:true}),{kind:'ready'});
});

test('production access still validates Supabase session identity and privileged authorization context',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  assert.match(source,/await transport\.authUser\([^;]*\)/u);
  assert.match(source,/mfaRequired/u);
  assert.match(source,/session\?\.user\?\.id/u);
  assert.match(source,/M26_MFA_IDENTITY_MISMATCH/u);
});

test('production bootstrap is neutral and never advertises a review-only lockout',()=>{
  const html=fs.readFileSync('public/m26/index.html','utf8');
  assert.doesNotMatch(html,/Acceso restringido a las cuentas autorizadas para esta revisión/u);
  assert.doesNotMatch(html,/El acceso no está disponible temporalmente en este sitio/u);
  assert.match(html,/Cargando acceso seguro a IBERFIT.../u);
  assert.match(html,/Acceso protegido por autenticación y permisos de cuenta./u);
});
