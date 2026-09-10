import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderAccessUi} from '../src/m26/app/access-ui.js';

function render(mode='login',overrides={}){
  return renderAccessUi({mode,backendReady:true,qaOnly:false,host:'app.iberfit.cl',...overrides});
}

test('auth premium conserva todos los flujos visibles y sus salidas seguras',()=>{
  const login=render('login');
  assert.match(login,/data-auth-form="login"/u);
  assert.match(login,/data-auth-action="forgot-password"/u);
  assert.match(login,/name="rememberEmail"/u);
  assert.match(login,/data-password-toggle/u);

  const recovery=render('request-recovery');
  assert.match(recovery,/data-auth-form="request-recovery"/u);
  assert.match(recovery,/type="email"/u);
  assert.match(recovery,/data-auth-action="back-to-login"/u);

  const reset=render('update-password');
  assert.match(reset,/data-auth-form="update-password"/u);
  assert.match(reset,/name="password"/u);
  assert.match(reset,/name="passwordConfirmation"/u);
  assert.match(reset,/id="m26-password-requirements"/u);
  assert.match(reset,/data-auth-action="back-to-login"/u);

  const enroll=render('mfa-required');
  assert.match(enroll,/data-auth-action="mfa-continue-webauthn"/u);
  assert.match(enroll,/data-auth-action="mfa-logout"/u);
  assert.match(enroll,/m26-device-assurance/u);

  const challenge=render('mfa-challenge');
  assert.match(challenge,/data-auth-action="mfa-continue-webauthn"/u);
  assert.match(challenge,/data-auth-action="mfa-register-device"/u);
  assert.match(challenge,/data-auth-action="mfa-logout"/u);
});

test('auth premium conserva busy, error, backend bloqueado y salida del preview',()=>{
  const busy=render('login',{busy:true});
  assert.match(busy,/aria-busy="true"/u);
  assert.match(busy,/disabled aria-disabled="true"/u);
  assert.match(busy,/Confirmando…/u);

  const error=render('login',{message:'No fue posible completar el acceso.',noticeKind:'error'});
  assert.match(error,/class="m26-auth-notice is-error"/u);
  assert.match(error,/role="alert"/u);
  assert.match(error,/aria-live="assertive"/u);
  assert.match(error,/aria-atomic="true"/u);

  const backendBlocked=renderAccessUi({mode:'login',backendReady:false,qaOnly:false,host:'app.iberfit.cl'});
  assert.match(backendBlocked,/El acceso no está disponible temporalmente en este sitio/u);
  assert.match(backendBlocked,/disabled aria-disabled="true"/u);

  const previewBlocked=renderAccessUi({mode:'login',backendReady:false,qaOnly:true,host:'iberfit-m26-canary.pages.dev'});
  assert.match(previewBlocked,/m26-auth-site-blocked/u);
  assert.match(previewBlocked,/m26-auth-canonical-link/u);
  assert.match(previewBlocked,/https:\/\/m26-canary\.iberfit\.cl\//u);
});

test('auth premium conserva recovery dinámica, provisioning fail-closed y resiliencia visual',()=>{
  const accessSource=fs.readFileSync('src/m26/app/access-ui.js','utf8');
  assert.match(accessSource,/data-device-registration-error/u);
  assert.match(accessSource,/role="alert"/u);
  assert.match(accessSource,/mfa-register-device/u);

  const appSource=fs.readFileSync('src/m26/app/application.js','utf8');
  assert.match(appSource,/M26_ROLE_CONTEXT_MISSING/u);
  assert.match(appSource,/M26_ROLE_SWITCH_FORBIDDEN/u);
  assert.match(appSource,/La sesión expiró o perdió autorización\. Vuelve a entrar\./u);

  const css=fs.readFileSync('src/m26/design/auth-native.css','utf8');
  assert.match(css,/env\(safe-area-inset-top\)/u);
  assert.match(css,/@media \(max-height: 760px\) and \(min-width: 581px\)/u);
  assert.match(css,/@media \(max-width: 580px\)/u);
  assert.match(css,/@media \(prefers-contrast: more\)/u);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css,/\.m26-auth-card input:focus-visible/u);
  assert.match(css,/\.m26-auth-notice\.is-error/u);
  assert.match(css,/\.m26-notice\.is-warning/u);
});
