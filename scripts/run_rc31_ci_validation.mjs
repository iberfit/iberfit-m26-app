import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, 'recovery', 'RC31_CI_VALIDATION_REPORT.json');
const steps = [];
let testOutput = '';
let stopped = false;

function run(name, args, timeoutMs = 180_000) {
  if (stopped) return;

  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
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
    durationMs: result.error?.code === 'ETIMEDOUT' ? timeoutMs : null,
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
run('rc31-canary-security-gate', [
  'scripts/m26_rc31_canary_gate.mjs',
]);
run('build-current-source', [
  'scripts/build_rc29_prepublication_candidate.mjs',
]);
run('module-graph', [
  'scripts/verify_rc29_module_graph.mjs',
]);
run('configure-rc31-validation-runtime', [
  'scripts/generate_rc31_runtime_config.mjs',
]);
run('verify-rc31-canary-candidate', [
  'scripts/verify_rc31_canary_candidate.mjs',
]);

const tests = {
  total: metric('tests'),
  passed: metric('pass'),
  failed: metric('fail'),
  skipped: metric('skipped'),
};

const report = {
  release: 'IBERFIT_M26_CANARY_RC31_CI',
  version: '26.0.0-canary.31-ci',
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
  inheritedCanaryContract: 'RC30 security invariants revalidated by RC31 gate',
  uiProvenanceBaseline: 'RC31 current source under full regression suite',
  rc28FrozenUiComparisonApplicable: false,
  localValidationOnly:
    String(process.env.M26_RUNTIME_VALIDATION_ONLY || '').toLowerCase() ===
    'true',
  productionModified: false,
  productionDeployed: false,
  remoteIsolationExecuted: false,
  pendingExternalGates: [
    'Gate autenticado Coach / Cliente A / Cliente B',
    'Aislamiento cruzado y privacidad del bootstrap',
    'Comprobación efectiva de RLS',
    'QA física y ciclo de actualización PWA',
  ],
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (!report.ok) process.exit(1);
