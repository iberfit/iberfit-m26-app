import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) =>
  readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('CI enruta RC29, RC30 y RC31 mediante gates separados', async () => {
  const ci = await read('.github/workflows/ci.yml');

  assert.match(ci, /name: Validar RC29[\s\S]*npm run validate:rc29/);
  assert.match(
    ci,
    /name: Validar RC30 canary[\s\S]*npm run validate:rc30:canary/,
  );
  assert.match(
    ci,
    /name: Validar RC31 canary[\s\S]*npm run validate:rc31:ci/,
  );

  const rc29Step = ci.match(
    /- name: Validar RC29[\s\S]*?run: npm run validate:rc29/,
  )?.[0];

  assert.ok(rc29Step);
  assert.match(rc29Step, /canary\/rc30/);
  assert.match(rc29Step, /canary\/rc31/);
});

test('RC31 conserva evidencia propia y no reutiliza el artefacto RC29', async () => {
  const ci = await read('.github/workflows/ci.yml');

  assert.match(ci, /name: Conservar evidencia RC31/);
  assert.match(ci, /name: rc31-evidencia-validacion/);
  assert.match(ci, /recovery\/RC31_\*\.json/);
});

test('gate remoto solo se habilita por ejecución manual en RC31', async () => {
  const ci = await read('.github/workflows/ci.yml');

  assert.match(ci, /remote_readonly:/);
  assert.match(ci, /confirmation:/);
  assert.match(ci, /READ_ONLY_REMOTE_GATE/);
  assert.match(
    ci,
    /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/canary\/rc31' && inputs\.confirmation == 'READ_ONLY_REMOTE_GATE'/,
  );
  assert.match(ci, /environment: m26-canary-readonly/);
  assert.match(
    ci,
    /node scripts\/remote-gates\/run_authenticated_readonly_gate\.mjs/,
  );
  assert.doesNotMatch(ci, /service[_-]?role/i);
});

test('validador RC31 ejecuta regresión completa sin exigir UI idéntica a RC28', async () => {
  const validator = await read('scripts/run_rc31_ci_validation.mjs');

  for (const expected of [
    'check_repository_hygiene.mjs',
    "readdirSync(path.join(root, 'tests'))",
    'm26_rc29_prepublication_gate.mjs',
    'm26_rc31_canary_gate.mjs',
    'build_rc29_prepublication_candidate.mjs',
    'verify_rc29_module_graph.mjs',
    'generate_rc31_runtime_config.mjs',
    'verify_rc31_canary_candidate.mjs',
  ]) {
    assert.ok(
      validator.includes(expected),
      `El validador RC31 no contiene: ${expected}`,
    );
  }

  assert.doesNotMatch(validator, /verify_rc29_ui_provenance/);
  assert.match(validator, /rc28FrozenUiComparisonApplicable: false/);
  assert.match(validator, /productionModified: false/);
  assert.match(validator, /productionDeployed: false/);
});

test('gate canary RC31 conserva las garantías RC30 con identidad propia', async () => {
  const gate = await read('scripts/m26_rc31_canary_gate.mjs');

  assert.match(gate, /branch === 'canary\/rc31'/);
  assert.match(gate, /IBERFIT_M26_CANARY_RC31/);
  assert.match(gate, /26\.0\.0-canary\.31/);
  assert.match(gate, /RC31_CANARY_GATE_REPORT\.json/);
  assert.doesNotMatch(gate, /branch === 'canary\/rc30'/);
  assert.match(gate, /Runtime de repositorio fail-closed/);
  assert.match(gate, /Evidencia remota usa huellas/);
  assert.match(gate, /Interfaz sin mojibake/);
});

test('package expone build, runtime, verificación y gate dedicados RC31', async () => {
  const pkg = JSON.parse(await read('package.json'));

  assert.equal(
    pkg.scripts['build:rc31:canary'],
    'npm run build:rc29 && npm run configure:rc31:canary',
  );
  assert.equal(
    pkg.scripts['configure:rc31:canary'],
    'node scripts/generate_rc31_runtime_config.mjs',
  );
  assert.equal(
    pkg.scripts['verify:build:rc31'],
    'node scripts/verify_rc31_canary_candidate.mjs',
  );
  assert.equal(
    pkg.scripts['validate:rc31:ci'],
    'node scripts/run_rc31_ci_validation.mjs',
  );
});

test('runtime y verificador RC31 sellan versión, rama y actualización PWA propias', async () => {
  const runtimeGenerator = await read(
    'scripts/generate_rc31_runtime_config.mjs',
  );
  const verifier = await read(
    'scripts/verify_rc31_canary_candidate.mjs',
  );

  for (const expected of [
    "const VERSION = '26.0.0-canary.31'",
    "const RELEASE = 'IBERFIT_M26_CANARY_RC31'",
    "const DEFAULT_BRANCH = 'canary/rc31'",
    "const SERVICE_WORKER_VERSION = 'm26-rc31-canary-v1'",
    "const PREVIOUS_SERVICE_WORKER_VERSION = 'm26-rc30-canary-v1'",
  ]) {
    assert.ok(runtimeGenerator.includes(expected), expected);
  }

  for (const expected of [
    "const EXPECTED_VERSION = '26.0.0-canary.31'",
    "const EXPECTED_RELEASE = 'IBERFIT_M26_CANARY_RC31'",
    "const EXPECTED_BRANCH = 'canary/rc31'",
    "const EXPECTED_SW_VERSION = 'm26-rc31-canary-v1'",
    "const EXPECTED_PREVIOUS_SW_VERSION = 'm26-rc30-canary-v1'",
    "RC31_BUILD_VERIFICATION.json",
  ]) {
    assert.ok(verifier.includes(expected), expected);
  }
});
