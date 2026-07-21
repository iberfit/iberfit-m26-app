import { readdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const recoveryDir = path.join(root, 'recovery');
const node = process.execPath;
const startedAt = new Date().toISOString();

function runTask(name, args, timeoutMs = 120_000) {
  const started = Date.now();
  const result = spawnSync(node, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env },
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const timedOut = result.error?.code === 'ETIMEDOUT';
  return {
    name,
    command: [node, ...args],
    status: result.status,
    signal: result.signal,
    timedOut,
    durationMs: Date.now() - started,
    stdout,
    stderr,
    pass: result.status === 0 && !timedOut,
  };
}

function parseJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

function parseTestSummary(text) {
  return {
    total: Number(text.match(/^# tests\s+(\d+)$/m)?.[1] ?? 0),
    passed: Number(text.match(/^# pass\s+(\d+)$/m)?.[1] ?? 0),
    failed: Number(text.match(/^# fail\s+(\d+)$/m)?.[1] ?? 0),
  };
}

function parseGateSummary(text) {
  const json = parseJsonObject(text);
  if (json && Number.isFinite(Number(json.passed))) {
    const passed = Number(json.passed);
    const failedRaw = Array.isArray(json.failed) ? json.failed.length : Number(json.failed ?? 0);
    const total = Number(json.total ?? (passed + failedRaw));
    return { total, passed, failed: Math.max(0, total - passed) };
  }
  const ratios = [...text.matchAll(/\b(\d+)\/(\d+)\s+PASS\b/g)];
  if (ratios.length) {
    const last = ratios.at(-1);
    const passed = Number(last[1]);
    const total = Number(last[2]);
    return { total, passed, failed: total - passed };
  }
  const passLines = text.split(/\r?\n/).filter((line) => /^PASS\s+/.test(line)).length;
  return { total: passLines, passed: passLines, failed: 0 };
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

const tests = (await readdir(path.join(root, 'tests')))
  .filter((name) => name.endsWith('.test.mjs') && !name.startsWith('m26_rc18_'))
  .sort()
  .map((name) => path.join('tests', name));

const tasks = [
  runTask('tests', ['--test', ...tests], 180_000),
  runTask('build', ['scripts/build_rc17_resilience_candidate.mjs']),
  runTask('module-graph', ['scripts/verify_rc17_module_graph.mjs']),
  runTask('registry-export', ['qa/rc17_export_registry.mjs']),
  runTask('integrated-bundle', ['scripts/build_rc17_integrated_bundle.mjs']),
];

const gateScripts = [
  'scripts/recovery_gate.mjs',
  'scripts/m26_recovery_gate.mjs',
  'scripts/m26_shell_gate.mjs',
  'scripts/m26_modules_gate.mjs',
  'scripts/m26_workflows_gate.mjs',
  'scripts/m26_science_gate.mjs',
  'scripts/m26_product_gate.mjs',
  'scripts/m26_execution_gate.mjs',
  'scripts/m26_release_gate.mjs',
  'scripts/m26_offline_canary_gate.mjs',
  'scripts/m26_engagement_gate.mjs',
  'scripts/m26_adaptive_engagement_gate.mjs',
  'scripts/m26_design_gate.mjs',
  'scripts/m26_visual_canary_gate.mjs',
  'scripts/m26_integrated_application_gate.mjs',
  'scripts/m26_launch_candidate_gate.mjs',
  'scripts/m26_hardening_gate.mjs',
  'scripts/m26_resilience_gate.mjs',
];
for (const script of gateScripts) tasks.push(runTask(`gate:${path.basename(script, '.mjs')}`, [script]));

const visual = await readJson('recovery/RC17_VISUAL_QA_REPORT.json');
const integrated = await readJson('recovery/RC17_INTEGRATED_QA_REPORT.json');
const visualEvidence = visual.version === '26.0.0-resilience-candidate.17' && visual.passed === 15 && visual.failed === 0;
const integratedEvidence = integrated.version === '26.0.0-resilience-candidate.17' && integrated.passed === 2 && integrated.total === 2;

const testSummary = parseTestSummary(tasks[0].stdout + '\n' + tasks[0].stderr);
const gateFamilies = tasks.filter((task) => task.name.startsWith('gate:')).map((task) => ({
  name: task.name.slice(5),
  pass: task.pass,
  ...parseGateSummary(task.stdout + '\n' + task.stderr),
}));
const gates = gateFamilies.reduce((acc, item) => {
  acc.total += item.total;
  acc.passed += item.passed;
  acc.failed += item.failed;
  return acc;
}, { total: 0, passed: 0, failed: 0 });

const pass = tasks.every((task) => task.pass)
  && testSummary.total === 167
  && testSummary.passed === 167
  && testSummary.failed === 0
  && gateFamilies.length === 18
  && gates.total === 285
  && gates.passed === 285
  && gates.failed === 0
  && visualEvidence
  && integratedEvidence;

const report = {
  generatedAt: new Date().toISOString(),
  startedAt,
  version: '26.0.0-resilience-candidate.17',
  pass,
  tests: testSummary,
  gates: { families: gateFamilies.length, ...gates, details: gateFamilies },
  qaEvidence: {
    visual: { pass: visualEvidence, passed: visual.passed, total: visual.case_count },
    integrated: { pass: integratedEvidence, passed: integrated.passed, total: integrated.total },
  },
  tasks: tasks.map(({ stdout, stderr, ...task }) => ({
    ...task,
    stdoutTail: stdout.split(/\r?\n/).slice(-10).join('\n'),
    stderrTail: stderr.split(/\r?\n/).slice(-10).join('\n'),
  })),
  note: 'La reproducción visual e integrada completa se ejecuta con qa:visual:rc17 y qa:integrated:rc17; este orquestador verifica sus informes sellados y vuelve a ejecutar tests, build, grafo, registro y las 18 familias de gates sin procesos de navegador persistentes.',
};

await writeFile(path.join(recoveryDir, 'RC17_RELEASE_VALIDATION_REPORT.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(recoveryDir, 'RC17_RELEASE_VALIDATION_OUTPUT.txt'), tasks.map((task) => [
  `===== ${task.name} =====`, task.stdout.trim(), task.stderr.trim(),
  `STATUS ${task.status} TIMEOUT ${task.timedOut} DURATION_MS ${task.durationMs}`,
].filter(Boolean).join('\n')).join('\n\n') + '\n');

console.log(`RC17 tests: ${testSummary.passed}/${testSummary.total}`);
console.log(`RC17 gates: ${gates.passed}/${gates.total} en ${gateFamilies.length} familias`);
console.log(`RC17 visual evidence: ${visual.passed}/${visual.case_count}`);
console.log(`RC17 integrated evidence: ${integrated.passed}/${integrated.total}`);
console.log(pass ? 'RC17 RELEASE VALIDATION PASS' : 'RC17 RELEASE VALIDATION FAIL');
if (!pass) process.exit(1);
