import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('premium access composition is additive and desktop-only around the existing auth card',()=>{
  const ui=read('src/m26/app/access-ui.js');
  const css=read('src/m26/design/auth-native.css');

  assert.match(ui,/class="m26-auth-stage"/u);
  assert.match(ui,/class="m26-auth-intro"/u);
  assert.match(ui,/Diagnóstico/u);
  assert.match(ui,/Planificación/u);
  assert.match(ui,/Seguimiento/u);
  assert.match(ui,/data-auth-form="login"/u);
  assert.match(ui,/data-auth-action="forgot-password"/u);

  assert.match(css,/\.m26-auth-intro\s*\{[\s\S]*?display:\s*none;/u);
  assert.match(css,/@media \(min-width: 980px\)[\s\S]*?\.m26-auth-intro\s*\{[\s\S]*?display:\s*grid;/u);
  assert.match(css,/safe-area-inset-/u);
  assert.match(css,/prefers-reduced-motion:\s*reduce/u);
  assert.match(css,/:focus-visible/u);
});

test('production browser smoke proves entry interactivity without submitting credentials',()=>{
  const smoke=read('qa/production-entry/production-entry.spec.mjs');
  const config=read('playwright.production-entry.config.mjs');

  assert.match(smoke,/M26_PROD_SOURCE_SHA/u);
  assert.match(smoke,/version\.sourceSha/u);
  assert.match(smoke,/\[data-auth-form="login"\]/u);
  assert.match(smoke,/toBeEnabled\(\)/u);
  assert.match(smoke,/Mostrar contraseña/u);
  assert.match(smoke,/request-recovery/u);
  assert.match(smoke,/pageErrors/u);
  assert.match(smoke,/waitForTimeout\(2_000\)/u);
  assert.doesNotMatch(smoke,/getByRole\('button',\{name:'Entrar',exact:true\}\)\.click/u);
  assert.doesNotMatch(smoke,/\.press\(['"]Enter['"]\)/u);

  assert.match(config,/production-entry-desktop-chromium/u);
  assert.match(config,/production-entry-mobile-chromium/u);
  assert.match(config,/retries:0/u);
});

test('production promotion verifies live identity, then browser entry, then integral audit',()=>{
  const workflow=read('.github/workflows/production-promote.yml');
  const identity=workflow.indexOf('Verify app.iberfit.cl exact identity and runtime read-only');
  const browser=workflow.indexOf('Verify production entry is interactive in Chromium');
  const audit=workflow.indexOf('Run integral production audit read-only');

  assert.ok(identity>=0);
  assert.ok(browser>identity);
  assert.ok(audit>browser);
  assert.match(workflow,/M26_PROD_SOURCE_SHA: \$\{\{ env\.SOURCE_SHA \}\}/u);
  assert.match(workflow,/playwright\.production-entry\.config\.mjs/u);
  assert.match(workflow,/recovery\/production-entry\//u);
});

test('email OTP rollout remains fail-closed behind certified Hosted Auth SMTP before production cutover',()=>{
  const application=read('src/m26/app/application.js');
  const workflow=read('.github/workflows/production-promote.yml');
  assert.match(application,/export const EMAIL_OTP_DEPLOYMENT_READY=true;/u);
  assert.match(workflow,/Resolve privileged email OTP rollout gate/u);
  assert.match(workflow,/if: \$\{\{ steps\.email-otp\.outputs\.enabled == 'true' \}\}/u);
  const sync=workflow.indexOf('Sync and verify IBERFIT Hosted Auth emails before cutover');
  const deploy=workflow.indexOf('Deploy exact certified surface to production with Wrangler');
  assert.ok(sync>=0&&deploy>sync);
  assert.match(workflow.slice(sync,deploy),/sync-hosted-auth-emails\.mjs --sync/u);
});
