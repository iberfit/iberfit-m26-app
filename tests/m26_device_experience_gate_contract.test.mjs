import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');

const authenticated=read('playwright.authenticated.config.mjs');
const visual=read('playwright.authenticated-visual.config.mjs');
const admin=read('playwright.admin-interaction.config.mjs');
const adminVisual=read('playwright.daily-admin-visual.config.mjs');
const pwa=read('playwright.p0-pwa-upgrade.config.mjs');
const workflow=read('.github/workflows/device-experience-gate.yml');
const policy=read('docs/DEVICE_EXPERIENCE_POLICY.md');

test('Device Experience policy defines task semantics instead of viewport-only responsive',()=>{
  assert.match(policy,/Desktop = analizar y construir/u);
  assert.match(policy,/Tablet = entrenar y operar/u);
  assert.match(policy,/Móvil = actuar y completar/u);
  assert.match(policy,/No declarar post-WebAuthn GREEN/u);
  assert.match(policy,/No declarar Admin autenticado real GREEN/u);
});

test('Client authenticated matrix covers desktop tablet portrait landscape and mobile',()=>{
  for(const token of [
    'authenticated-readonly-chromium',
    'authenticated-readonly-tablet-chromium',
    'authenticated-readonly-tablet-landscape-chromium',
    'authenticated-readonly-mobile-chromium',
    'width:1440,height:1000',
    'width:1024,height:1366',
    'width:1366,height:1024',
    'width:390,height:844',
  ])assert.ok(authenticated.includes(token),`missing authenticated matrix token: ${token}`);
});

test('Authenticated visual matrix mirrors all four primary device classes',()=>{
  for(const token of [
    'authenticated-visual-desktop-chromium',
    'authenticated-visual-tablet-chromium',
    'authenticated-visual-tablet-landscape-chromium',
    'authenticated-visual-mobile-chromium',
  ])assert.ok(visual.includes(token),`missing visual matrix token: ${token}`);
});

test('Admin interaction and visual evidence include tablet landscape explicitly',()=>{
  assert.match(admin,/admin-tablet-landscape-chromium/u);
  assert.match(admin,/width:1366,height:1024/u);
  assert.match(adminVisual,/admin-visual-tablet-landscape/u);
  assert.match(adminVisual,/width:1366,height:1024/u);
});

test('Installed PWA continuity keeps desktop tablet and mobile device classes',()=>{
  for(const token of [
    'p0-installed-pwa-desktop-chromium',
    'p0-installed-pwa-tablet-chromium',
    'p0-installed-pwa-mobile-chromium',
  ])assert.ok(pwa.includes(token),`missing PWA matrix token: ${token}`);
});

test('Phase A gate is explicit about real and synthetic coverage',()=>{
  assert.match(workflow,/client-real-coach-webauthn-matrix/u);
  assert.match(workflow,/admin-synthetic-task-matrix/u);
  assert.match(workflow,/pwa-installed-device-matrix/u);
  assert.match(workflow,/device-experience-gate-phase-a/u);
  assert.match(workflow,/KNOWN_GAP_COACH_POST_WEBAUTHN=YELLOW/u);
  assert.match(workflow,/KNOWN_GAP_ADMIN_AUTHENTICATED=YELLOW/u);
});
