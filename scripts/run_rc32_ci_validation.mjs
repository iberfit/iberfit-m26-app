import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, 'recovery', 'RC32_CI_VALIDATION_REPORT.json');
const steps = [];
let testOutput = '';
let stopped = false;

function run(name, args, timeoutMs = 240_000) {
  if (stopped) return;
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    timeout: timeoutMs,
    maxBuffer: 96 * 1024 * 1024,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const timedOut = result.error?.code === 'ETIMEDOUT';
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  steps.push({
    name,
    command: ['node', ...args].join(' '),
    status: result.status,
    signal: result.signal,
    timedOut,
    ok: result.status === 0 && !timedOut,
  });
  if (name === 'tests') testOutput = stdout;
  if (result.status !== 0 || timedOut) stopped = true;
}

function metric(name) {
  const patterns = [
    new RegExp(`^# ${name}\\s+(\\d+)$`, 'mu'),
    new RegExp(`^ℹ ${name}\\s+(\\d+)$`, 'mu'),
  ];
  for (const pattern of patterns) {
    const match = testOutput.match(pattern);
    if (match) return Number(match[1]);
  }
  return 0;
}

run('repository-hygiene', [
  'scripts/remote-gates/check_repository_hygiene.mjs',
]);
const testFiles = fs
  .readdirSync(path.join(root, 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `tests/${name}`);
run('tests', ['--test', ...testFiles]);
run('rc29-infrastructure-gate', [
  'scripts/m26_rc29_prepublication_gate.mjs',
]);
run('rc32-product-security-gate', [
  'scripts/m26_rc32_canary_gate.mjs',
]);
run('build-current-source-with-repdb', [
  'scripts/build_rc29_prepublication_candidate.mjs',
]);
run('module-graph', ['scripts/verify_rc29_module_graph.mjs']);
run('configure-rc32-validation-runtime', [
  'scripts/generate_rc32_runtime_config.mjs',
]);
run('verify-rc32-canary-candidate', [
  'scripts/verify_rc32_canary_candidate.mjs',
]);

const tests = {
  total: metric('tests'),
  passed: metric('pass'),
  failed: metric('fail'),
  skipped: metric('skipped'),
};
const report = {
  release: 'IBERFIT_M26_CANARY_RC32_CI',
  version: '26.0.0-canary.32-ci',
  generatedAt: new Date().toISOString(),
  sourceRevision:
    spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).stdout?.trim() || null,
  ok:
    !stopped &&
    steps.every((step) => step.ok) &&
    tests.total > 0 &&
    tests.failed === 0,
  tests,
  steps,
  inheritedCanaryContract: 'RC31 security and readonly isolation baseline',
  productHardening: [
    'Agenda proposals isolated from confirmed appointments',
    'IRI displayed by domains without global score',
    'Canonical client profile with contact and training logistics',
    'RepDB media included in deployable candidate',
    'Samsung Health and Strava represented behind truthful feature gates',
    'Responsive overflow protections',
  ],
  localValidationOnly:
    String(process.env.M26_RUNTIME_VALIDATION_ONLY || '').toLowerCase() ===
    'true',
  productionModified: false,
  productionDeployed: false,
  remoteIsolationExecuted: false,
  pendingExternalGates: [
    'Gate autenticado Coach / Cliente A / Cliente B en RC32',
    'Comprobación HTTP real de JSON e imágenes RepDB desplegadas',
    'QA visual en móvil físico y zoom 200 %',
    'Health Connect requiere puente Android nativo',
    'Strava requiere OAuth seguro de servidor y credenciales registradas',
  ],
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
