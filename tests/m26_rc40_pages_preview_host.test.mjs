import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runSource = fs.readFileSync('scripts/run_rc40_canary_build.mjs', 'utf8');
const patchSource = fs.readFileSync('scripts/patch_rc40_pages_preview_host.mjs', 'utf8');
const verifySource = fs.readFileSync('scripts/verify_rc40_canary_candidate.mjs', 'utf8');
const previewHost = /^[a-z0-9-]+\.iberfit-m26-canary\.pages\.dev$/u;

test('RC40 ejecuta el parche dinámico antes de generar y verificar runtime', () => {
  const patchIndex = runSource.indexOf("patch_rc40_pages_preview_host.mjs");
  const runtimeIndex = runSource.indexOf("generate_rc40_runtime_config.mjs");
  const verifyIndex = runSource.indexOf("verify_rc40_canary_candidate.mjs");
  assert.ok(patchIndex >= 0);
  assert.ok(runtimeIndex > patchIndex);
  assert.ok(verifyIndex > runtimeIndex);
});

test('RC40 autoriza únicamente previews del proyecto Pages canary exacto', () => {
  assert.equal(previewHost.test('9ed298ba.iberfit-m26-canary.pages.dev'), true);
  assert.equal(previewHost.test('canary-rc40-business-hardening.iberfit-m26-canary.pages.dev'), true);
  assert.equal(previewHost.test('m26-canary.iberfit.cl'), false);
  assert.equal(previewHost.test('9ed298ba.otro-proyecto.pages.dev'), false);
  assert.equal(previewHost.test('9ed298ba.iberfit-m26-canary.pages.dev.evil.example'), false);
  assert.equal(previewHost.test('nested.9ed298ba.iberfit-m26-canary.pages.dev'), false);
});

test('parche y verificador conservan fail-closed y bloqueo de producción', () => {
  assert.match(patchSource, /RC40_PAGES_PREVIEW_PRODUCTION_REF_FORBIDDEN/u);
  assert.match(patchSource, /configuredCanary \|\| projectPreview/u);
  assert.match(verifySource, /pages-preview-host-scope/u);
});
