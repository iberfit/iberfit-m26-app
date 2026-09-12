import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const spec=fs.readFileSync('qa/rc64/authenticated-visual-evidence.spec.mjs','utf8');
const config=fs.readFileSync('playwright.authenticated-visual.config.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/remote-gates.yml','utf8');

test('authenticated visual evidence captures only authorized read-only QA states',()=>{
  assert.match(spec,/allowedExternalRequest\(request\)/u);
  assert.match(spec,/READ_ONLY_RPCS/u);
  assert.match(spec,/blockedRequests,'Visual evidence attempted a mutation or foreign request'/u);
  assert.match(spec,/mutationsPerformed:false/u);
  assert.match(spec,/credentialsPersisted:false/u);
  assert.match(spec,/screenshotsContainSyntheticQaSurface:true/u);
  assert.match(spec,/authorized-admin-qa-account-not-configured/u);
  assert.match(spec,/captured:false/u);
  assert.match(spec,/input\[type="password"\]/u);
  assert.match(spec,/data-m26-interactive="ready"/u);
  assert.match(spec,/Visual evidence must capture the final interactive workspace/u);
  assert.match(spec,/page\.locator\('\.m26-route'\)\.first\(\)/u);
  assert.doesNotMatch(spec,/mfa-continue-webauthn[^\n]{0,180}\.click\(/u);
});

test('authenticated visual matrix preserves desktop tablet landscape and mobile evidence',()=>{
  assert.match(config,/authenticated-visual-desktop-chromium/u);
  assert.match(config,/width:1440,height:1000/u);
  assert.match(config,/authenticated-visual-tablet-chromium/u);
  assert.match(config,/width:1024,height:1366/u);
  assert.match(config,/authenticated-visual-tablet-landscape-chromium/u);
  assert.match(config,/width:1366,height:1024/u);
  assert.match(config,/authenticated-visual-mobile-chromium/u);
  assert.match(config,/width:390,height:844/u);
  assert.match(config,/workers:1/u);
  assert.match(config,/reducedMotion:'reduce'/u);
});

test('remote gate stores authenticated visual evidence temporarily without replacing existing smoke',()=>{
  assert.match(workflow,/Ejecutar smoke autenticado RC64\.2B sobre fuente actual sin mutaciones/u);
  assert.match(workflow,/Capturar evidencia visual autenticada RC64 sin mutaciones/u);
  assert.match(workflow,/playwright\.authenticated-visual\.config\.mjs/u);
  assert.match(workflow,/name: rc64-authenticated-visual-evidence/u);
  assert.match(workflow,/path: recovery\/rc64-authenticated-visual\/\*\*/u);
  assert.match(workflow,/retention-days: 7/u);
});
