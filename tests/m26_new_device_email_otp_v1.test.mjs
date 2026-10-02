import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderAccessUi} from '../src/m26/app/access-ui.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n?/gu,'\n');

test('new-device login explains email-code fallback without making OTP a passwordless privileged first factor',()=>{
  const login=renderAccessUi({
    backendReady:true,
    qaOnly:false,
    host:'app.iberfit.cl',
    mode:'login',
  });
  assert.match(login,/¿Estás en otro dispositivo\?/u);
  assert.match(login,/Tras confirmar tu contraseña/u);
  assert.match(login,/código de 6 dígitos/u);
  assert.doesNotMatch(login,/data-auth-action="mfa-send-email-code"/u);
});

test('recognized-device verification keeps WebAuthn primary and exposes associated-email fallback only when backend allows it',()=>{
  const available=renderAccessUi({
    backendReady:true,
    qaOnly:false,
    host:'app.iberfit.cl',
    mode:'mfa-challenge',
    mfa:{kind:'challenge',emailOtpAvailable:true},
  });
  assert.match(available,/data-auth-action="mfa-continue-webauthn"/u);
  assert.match(available,/data-auth-action="mfa-send-email-code"/u);
  assert.match(available,/Enviar código al correo asociado/u);
  assert.match(available,/Tu contraseña sigue siendo el primer factor de seguridad/u);

  const unavailable=renderAccessUi({
    backendReady:true,
    qaOnly:false,
    host:'app.iberfit.cl',
    mode:'mfa-challenge',
    mfa:{kind:'challenge',emailOtpAvailable:false},
  });
  assert.doesNotMatch(unavailable,/data-auth-action="mfa-send-email-code"/u);
});

test('email OTP rollout is enabled but production promotion remains fail-closed on custom SMTP',()=>{
  const app=read('src/m26/app/application.js');
  const promotion=read('.github/workflows/production-promote.yml');
  const sync=read('scripts/auth/sync-hosted-auth-emails.mjs');

  assert.match(app,/export const EMAIL_OTP_DEPLOYMENT_READY=true;/u);
  assert.match(promotion,/Resolve privileged email OTP rollout gate/u);
  assert.match(promotion,/Sync and verify IBERFIT Hosted Auth emails before cutover/u);
  assert.match(sync,/assertCustomSmtp\(before\)/u);
  assert.match(sync,/IBERFIT_AUTH_EMAIL_CUSTOM_SMTP_REQUIRED/u);
});

test('privileged email fallback is two-factor server-side and cannot become OTP-only',()=>{
  const edge=read('supabase/functions/iberfit-email-assurance-v1/index.ts');

  assert.match(edge,/recentAmr\(primaryClaims,'password',RECENT_PRIMARY_PASSWORD_SECONDS\)/u);
  assert.match(edge,/recentAmr\(otpClaims,'otp',RECENT_OTP_SECONDS\)/u);
  assert.match(edge,/otpToken===primaryToken/u);
  assert.match(edge,/primarySessionId===otpSessionId/u);
  assert.match(edge,/primaryUserId!==otpUserId/u);
  assert.match(edge,/primaryEmail!==otpEmail/u);
  assert.match(edge,/M26_PRIVILEGED_ROLE_REQUIRED/u);
});

test('access-code emails use the premium IBERFIT V2 system and only the official identity asset',()=>{
  for(const path of [
    'supabase/templates/iberfit-magic-link.html',
    'supabase/templates/iberfit-reauthentication.html',
  ]){
    const html=read(path);
    assert.match(html,/data-iberfit-email="v2"/u);
    assert.match(html,/data-iberfit-layout="code"/u);
    assert.match(html,/#F3EEE3/u);
    assert.match(html,/#FFFDF8/u);
    assert.match(html,/#0B1310/u);
    assert.match(html,/#C5A059/u);
    assert.match(html,/font-family:Georgia,'Times New Roman',serif/iu);
    assert.match(html,/src="\/public\/iberfit-email-isotipo\.png"/u);
    assert.doesNotMatch(html,/isotipo-iberfit\.png/u);
    assert.doesNotMatch(html,/iberfit-email-access-hero\.jpg/u);
  }
});
