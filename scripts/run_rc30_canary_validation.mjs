import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const steps = [];
let testOutput = '';
let stopped = false;

function run(name, args) {
  if (stopped) return;
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  steps.push({
    name,
    command: ['node', ...args].join(' '),
    status: result.status,
    ok: result.status === 0,
  });
  if (name === 'tests') testOutput = stdout;
  if (result.status !== 0) stopped = true;
}

run('repository-hygiene', ['scripts/remote-gates/check_repository_hygiene.mjs']);
const testFiles = fs.readdirSync(path.join(root, 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `tests/${name}`);
run('tests', ['--test', ...testFiles]);
run('rc29-prepublication-gate', ['scripts/m26_rc29_prepublication_gate.mjs']);
run('rc30-canary-gate', ['scripts/m26_rc30_canary_gate.mjs']);
run('build', ['scripts/build_rc29_prepublication_candidate.mjs']);
run('module-graph', ['scripts/verify_rc29_module_graph.mjs']);
run('configure-canary-runtime', ['scripts/generate_rc29_runtime_config.mjs']);
run('verify-canary-build', ['scripts/verify_rc30_canary_candidate.mjs']);

const metric = (name) => {
  const match = testOutput.match(
    new RegExp(`(?:#|\\u2139)\\s*${name}\\s+(\\d+)`)
  );
  return Number(match?.[1] || 0);
};

const tests = {
  total: metric('tests'),
  passed: metric('pass'),
  failed: metric('fail'),
  skipped: metric('skipped'),
};

const report = {
  release: 'IBERFIT_M26_CANARY_RC30',
  version: '26.0.0-canary.30',
  generatedAt: new Date().toISOString(),
  ok:
    !stopped &&
    steps.every((step) => step.ok) &&
    tests.total > 0 &&
    tests.failed === 0,
  tests,
  steps,
  localValidationOnly:
    String(process.env.M26_RUNTIME_VALIDATION_ONLY || '').toLowerCase() ===
    'true',
  productionModified: false,
  productionDeployed: false,
  remoteIsolationExecuted: false,
  pendingExternalGates: [
    'Login autenticado con cuentas QA Coach y dos Clientes distintos',
    'Inspección remota de RLS y políticas efectivas',
    'Prueba cruzada Cliente A / Cliente B',
    'Recuperación real de correo en m26-canary.iberfit.cl',
    'QA visual y de teclado en dispositivos físicos',
  ],
};

fs.mkdirSync(path.join(root, 'recovery'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'recovery', 'RC30_LOCAL_VALIDATION.json'),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify(report, null, 2));

if (!report.ok) process.exit(1);
