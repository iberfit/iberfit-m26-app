import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, 'recovery', 'RC38_CI_VALIDATION_REPORT.json');
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
  M26_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_validation_rc38',
  M26_QA_ONLY: 'true',
  M26_RUNTIME_VALIDATION_ONLY: 'true',
  CF_PAGES_BRANCH: 'canary/rc38',
};

run('repository-hygiene', ['scripts/remote-gates/check_repository_hygiene.mjs']);
const testFiles = fs
  .readdirSync(path.join(root, 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `tests/${name}`);
run('tests', ['--test', ...testFiles], 600_000);
run('rc29-infrastructure-gate', ['scripts/m26_rc29_prepublication_gate.mjs']);
run('rc35-audit-gate', ['scripts/m26_rc35_audit_gate.mjs']);
run('rc35-release-gate', ['scripts/m26_rc35_release_gate.mjs'], 300_000, { CF_PAGES_BRANCH: 'canary/rc35' });
run('rc36-product-gate', ['scripts/m26_rc36_product_gate.mjs']);
run('rc37-release-gate', ['scripts/m26_rc37_release_gate.mjs']);
run('rc38-release-gate', ['scripts/m26_rc38_release_gate.mjs']);
run('build-current-source-with-repdb', ['scripts/build_rc29_prepublication_candidate.mjs']);
run('module-graph', ['scripts/verify_rc29_module_graph.mjs']);
run('configure-rc38-canary', ['scripts/generate_rc35_runtime_config.mjs'], 300_000, validationEnv);
run('verify-rc38-build', ['scripts/verify_rc35_canary_candidate.mjs'], 300_000, validationEnv);

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
  release: 'IBERFIT_M26_CANARY_RC38_IRI_DIAGNOSIS_BIOIMPEDANCE',
  version: '26.0.0-canary.38-iri-diagnosis-bioimpedance',
  generatedAt: new Date().toISOString(),
  sourceRevision,
  sourceBranch: 'canary/rc38',
  sourceCommit: sourceRevision,
  baseBranch: 'canary/rc37',
  baseCommit: '2ca98532bfec1315f569599121a4792fbdee3a45',
  backendContract: 'RC30+IRI_EXTERNAL_REPORT_V12',
  ok: !stopped && steps.every((step) => step.ok) && tests.total > 0 && tests.failed === 0,
  tests,
  steps,
  deliveredScope: [
    'Diagnostico IRI Cliente como unidad documental con bioimpedancia complementaria integrada',
    'Visor accesible bajo demanda para PDF, JPEG y PNG con URLs firmadas renovables',
    'PDF IRI Cliente con hipervinculo estable autenticado, nunca con URL firmada',
    'Continuacion segura tras login y aislamiento por assessment visible confirmado',
    'Controles RC37 de Coach y Admin preservados; Cliente permanece en solo lectura',
  ],
  localValidationOnly: true,
  deployable: false,
  productionModified: false,
  productionDeployed: false,
  cloudflareModified: false,
  sheetModified: false,
  pendingExternalGates: [
    'CI de GitHub sobre canary/rc38',
    'Despliegue exclusivo en m26-canary.iberfit.cl',
    'QA autenticado con los IDs ficticios autorizados y sin mutar el informe version 2',
  ],
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
