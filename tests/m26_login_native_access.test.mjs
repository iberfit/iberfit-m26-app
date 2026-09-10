import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  REMEMBERED_EMAIL_STORAGE_KEY,
  normalizeRememberedEmail,
  renderAccessUi,
} from '../src/m26/app/access-ui.js';

test('login nativo usa el isotipo real, mostrar contraseña y recordar sólo correo',()=>{
  const html=renderAccessUi({backendReady:true,qaOnly:false,host:'app.iberfit.cl'});

  assert.match(html,/class="m26-auth-brand"/u);
  assert.match(html,/class="m26-auth-logo"[\s\S]*?src="\/public\/isotipo-iberfit\.png"/u);
  assert.match(html,/data-password-toggle/u);
  assert.match(html,/aria-label="Mostrar contraseña"/u);
  assert.match(html,/name="rememberEmail"/u);
  assert.match(html,/Recordar correo/u);
  assert.doesNotMatch(html,/<iberfit-install-control/u);
});

test('recordatorio normaliza únicamente un correo y nunca define una clave de contraseña',()=>{
  assert.equal(REMEMBERED_EMAIL_STORAGE_KEY,'iberfit.m26.remembered-email.v1');
  assert.equal(normalizeRememberedEmail('  persona@iberfit.cl  '),'persona@iberfit.cl');
  assert.equal(normalizeRememberedEmail('sin-arroba'),'');
  assert.equal(normalizeRememberedEmail('x'.repeat(255)+'@iberfit.cl'),'');
  assert.doesNotMatch(REMEMBERED_EMAIL_STORAGE_KEY,/password|contrase/i);

  const source=fs.readFileSync('src/m26/app/access-ui.js','utf8');
  assert.doesNotMatch(source,/localStorage[^\n]*(password|contrase)/iu);
  assert.match(source,/autocomplete="current-password"/u);
});

test('capa visual de acceso conserva una superficie premium coherente y responsive',()=>{
  const css=fs.readFileSync('src/m26/design/auth-native.css','utf8');
  assert.match(css,/\.m26-auth-page[\s\S]*?min-height:\s*100dvh/u);
  assert.match(css,/\.m26-auth-card\s*\{[\s\S]*?border:\s*1px solid rgba\(221, 190, 119, \.18\);[\s\S]*?background:\s*linear-gradient\(165deg,[\s\S]*?box-shadow:/u);
  assert.match(css,/\.m26-auth-card h1[\s\S]*?font-family:\s*Inter,/u);
  assert.match(css,/\.m26-auth-card form,[\s\S]*?border-top:\s*1px solid rgba\(221, 190, 119, \.1\)/u);
  assert.match(css,/\.m26-auth-card\[aria-busy='true'\]/u);
  assert.match(css,/@media \(max-width: 580px\)/u);
  assert.match(css,/@media \(prefers-contrast: more\)/u);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/u);
});
