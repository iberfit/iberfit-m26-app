import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) =>
  readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('CI enruta canary/rc32 al validador dedicado', async () => {
  const ci = await read('.github/workflows/ci.yml');
  assert.match(
    ci,
    /name: Validar RC32 canary[\s\S]*canary\/rc32[\s\S]*npm run validate:rc32:ci/,
  );
  assert.match(ci, /name: Conservar evidencia RC32/);
  assert.match(ci, /name: rc32-evidencia-validacion/);
  assert.match(ci, /recovery\/RC32_\*\.json/);

  const rc29Step = ci.match(
    /- name: Validar RC29[\s\S]*?run: npm run validate:rc29/,
  )?.[0];
  assert.ok(rc29Step);
  assert.match(rc29Step, /canary\/rc32/);
});

test('package registra gate, build, runtime y verificador RC32', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(
    pkg.scripts['validate:rc32:ci'],
    'node scripts/run_rc32_ci_validation.mjs',
  );
  assert.equal(
    pkg.scripts['build:rc32:canary'],
    'npm run build:rc29 && npm run configure:rc32:canary',
  );
  assert.equal(
    pkg.scripts['configure:rc32:canary'],
    'node scripts/generate_rc32_runtime_config.mjs',
  );
  assert.equal(
    pkg.scripts['verify:build:rc32'],
    'node scripts/verify_rc32_canary_candidate.mjs',
  );
});

test('runtime RC32 sella identidad PWA y presupuesto separado de medios', async () => {
  const generator = await read('scripts/generate_rc32_runtime_config.mjs');
  const verifier = await read('scripts/verify_rc32_canary_candidate.mjs');

  for (const expected of [
    "const VERSION = '26.0.0-canary.32'",
    "const RELEASE = 'IBERFIT_M26_CANARY_RC32'",
    "const DEFAULT_BRANCH = 'canary/rc32'",
    "const SERVICE_WORKER_VERSION = 'm26-rc32-canary-v1'",
    "const PREVIOUS_SERVICE_WORKER_VERSION = 'm26-rc31-canary-v1'",
    'MEDIA_TOTAL_LIMIT',
    'repdbPackaged',
  ]) {
    assert.ok(generator.includes(expected), expected);
  }

  for (const expected of [
    "const EXPECTED_VERSION = '26.0.0-canary.32'",
    "const EXPECTED_RELEASE = 'IBERFIT_M26_CANARY_RC32'",
    "const EXPECTED_BRANCH = 'canary/rc32'",
    "const EXPECTED_SW_VERSION = 'm26-rc32-canary-v1'",
    "const EXPECTED_PREVIOUS_SW_VERSION = 'm26-rc31-canary-v1'",
    'RC32_BUILD_VERIFICATION.json',
    'media-not-packaged',
  ]) {
    assert.ok(verifier.includes(expected), expected);
  }
});

test('validador RC32 ejecuta regresión completa y empaquetado RepDB', async () => {
  const validator = await read('scripts/run_rc32_ci_validation.mjs');
  for (const expected of [
    'check_repository_hygiene.mjs',
    "readdirSync(path.join(root, 'tests'))",
    'm26_rc29_prepublication_gate.mjs',
    'm26_rc32_canary_gate.mjs',
    'build_rc29_prepublication_candidate.mjs',
    'verify_rc29_module_graph.mjs',
    'generate_rc32_runtime_config.mjs',
    'verify_rc32_canary_candidate.mjs',
  ]) {
    assert.ok(validator.includes(expected), expected);
  }
  assert.match(validator, /productionModified: false/);
  assert.match(validator, /productionDeployed: false/);
});
