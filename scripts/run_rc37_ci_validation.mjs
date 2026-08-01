import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, 'recovery', 'RC37_CI_VALIDATION_REPORT.json');
const steps = [];
let testOutput = '';
let stopped = false;

function run(name, args, timeoutMs = 300_000, envExtra = {}) {
  if (stopped) return;
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...envExtra },
    timeout: timeoutMs,
    maxBuffer: 128 * 1024 * 1024,
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
  for (const pattern of [
    new RegExp(`^# ${name}\\s+(\\d+)$`, 'mu'),
    new RegExp(`^ℹ ${name}\\s+(\\d+)$`, 'mu'),
  ]) {
    const match = testOutput.match(pattern);
    if (match) return Number(match[1]);
  }
  return 0;
}

const validationEnv = {
  M26_SUPABASE_URL: 'https://pjhmrhejsoofmouedavw.supabase.co',
  M26_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_validation_rc37',
  M26_QA_ONLY: 'true',
  M26_RUNTIME_VALIDATION_ONLY: 'true',
  CF_PAGES_BRANCH: 'canary/rc37',
};

run('repository-hygiene', ['scripts/remote-gates/check_repository_hygiene.mjs']);
const testFiles = fs
  .readdirSync(path.join(root, 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `tests/${name}`);
run('tests', ['--test', ...testFiles]);
run('rc29-infrastructure-gate', ['scripts/m26_rc29_prepublication_gate.mjs']);
run('rc35-audit-gate', ['scripts/m26_rc35_audit_gate.mjs']);
run('rc35-release-gate', ['scripts/m26_rc35_release_gate.mjs'], 300_000, { CF_PAGES_BRANCH: 'canary/rc35' });
run('rc36-product-gate', ['scripts/m26_rc36_product_gate.mjs']);
run('rc37-release-gate', ['scripts/m26_rc37_release_gate.mjs']);
run('build-current-source-with-repdb', ['scripts/build_rc29_prepublication_candidate.mjs']);
run('module-graph', ['scripts/verify_rc29_module_graph.mjs']);
run('configure-rc37-canary', ['scripts/generate_rc35_runtime_config.mjs'], 300_000, validationEnv);
run('verify-rc37-build', ['scripts/verify_rc35_canary_candidate.mjs'], 300_000, validationEnv);

const tests = {
  total: metric('tests'),
  passed: metric('pass'),
  failed: metric('fail'),
  skipped: metric('skipped'),
};
let sourceRevision = null;
try {
  sourceRevision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim() || null;
} catch {}

const report = {
  release: 'IBERFIT_M26_CANARY_RC37_IRI_EXTERNAL_REPORT',
  version: '26.0.0-canary.37-iri-external-report',
  generatedAt: new Date().toISOString(),
  sourceRevision,
  sourceBranch: 'canary/rc37',
  sourceCommit: sourceRevision,
  baseBranch: 'canary/rc36',
  baseCommit: 'c11f93e9131692ffdecd05b3dd5a10980e3af7e2',
  backendContract: 'RC30+IRI_EXTERNAL_REPORT_V12',
  ok: !stopped && steps.every((step) => step.ok) && tests.total > 0 && tests.failed === 0,
  tests,
  steps,
  deliveredScope: [
    'Coach y Admin pueden subir o reemplazar PDF, JPEG y PNG privados de hasta 50 MB',
    'Cliente dispone únicamente de lectura mediante URL firmada temporal',
    'Ruta canónica clientId/assessmentId/bioimpedancia y RPC iberfit_register_iri_external_report_v12',
    'Timeout de 180 segundos exclusivo para Storage; REST y RPC conservan 12 segundos',
    'RC36 v12.3.8 preservado íntegramente',
  ],
  localValidationOnly: true,
  deployable: false,
  productionModified: false,
  productionDeployed: false,
  cloudflareModified: false,
  sheetModified: false,
  pendingExternalGates: [
    'CI de GitHub sobre canary/rc37',
    'Despliegue exclusivo en m26-canary.iberfit.cl',
    'QA autenticado mutante limitado a los IDs ficticios autorizados',
  ],
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
