import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const runner=await readFile(new URL('../scripts/fast_lane_affected_tests.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/fast-lane.yml',import.meta.url),'utf8');
const docs=await readFile(new URL('../docs/IBERFIT_FAST_LANE.md',import.meta.url),'utf8');

test('Fast Lane selecciona tests afectados y verifica PWA antes de regresión completa',()=>{
  assert.match(runner,/git[^\n]*diff/u);
  assert.match(runner,/generate_rc58_app_shell\.mjs','--check'/u);
  assert.match(runner,/m26_rc75_native_workspace_stability\.test\.mjs/u);
  assert.match(runner,/m26_rc71_2_preferences_i18n\.test\.mjs/u);
  assert.match(runner,/m26_rc58_5c_b_app_integrity\.test\.mjs/u);
  assert.match(runner,/recovery','fast-lane'/u);
  assert.match(runner,/FAST_LANE=GREEN/u);
  assert.match(runner,/FAST_LANE=RED/u);
});

test('workflow Fast Lane es PR-only hacia integración, cancelable y conserva diagnóstico',()=>{
  assert.match(workflow,/pull_request:/u);
  assert.match(workflow,/canary\/rc74-4/u);
  assert.match(workflow,/timeout-minutes:\s*8/u);
  assert.match(workflow,/cancel-in-progress:\s*true/u);
  assert.match(workflow,/fetch-depth:\s*0/u);
  assert.match(workflow,/persist-credentials:\s*false/u);
  assert.match(workflow,/fast_lane_affected_tests\.mjs/u);
  assert.match(workflow,/upload-artifact@v4/u);
  assert.match(workflow,/retention-days:\s*14/u);
});

test('documentación no convierte presupuesto de tiempo en bypass de seguridad',()=>{
  assert.match(docs,/inferior a 10 minutos/u);
  assert.match(docs,/nunca se salta el gate/u);
  assert.match(docs,/RLS, ABAC, WebAuthn, fail-closed/u);
  assert.match(docs,/CI, auditoría continua y Fast Lane son paralelos/u);
});
