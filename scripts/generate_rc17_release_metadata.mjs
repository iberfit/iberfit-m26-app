import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const root = process.cwd();
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const write = (rel, data) => fs.writeFileSync(path.join(root, rel), `${JSON.stringify(data, null, 2)}\n`);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function walk(dir, base = root) {
  const rows = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...walk(abs, base));
    else if (entry.isFile()) rows.push({
      path: path.relative(base, abs).replaceAll(path.sep, '/'),
      size: fs.statSync(abs).size,
      sha256: sha256(abs),
    });
  }
  return rows;
}

const build = read('dist/m26-resilience-candidate/version.json');
const validation = read('recovery/RC17_RELEASE_VALIDATION_REPORT.json');
const visual = read('recovery/RC17_VISUAL_QA_REPORT.json');
const integrated = read('recovery/RC17_INTEGRATED_QA_REPORT.json');
const resilience = read('recovery/m26-resilience-gate-results.json');
const protectedBaseline = read('recovery/RC17_PROTECTED_BASELINE_COMPARISON.json');
const remote = read('recovery/RC17_REMOTE_VALIDATION_STATUS.json');
const graph = read('recovery/RC17_MODULE_GRAPH_REPORT.json');
const dependencies = read('recovery/RC17_DEPENDENCY_AUDIT.json');

const webEntries = walk(path.join(root, 'dist', 'm26-resilience-candidate'), path.join(root, 'dist', 'm26-resilience-candidate'));
write('recovery/RC17_WEB_SHA256_MANIFEST.json', {
  release: 'IBERFIT_M26_WEB_CANARY_RC17',
  version: build.version,
  count: webEntries.length,
  totalBytes: webEntries.reduce((sum, row) => sum + row.size, 0),
  entries: webEntries,
});

const summary = {
  release: 'IBERFIT_M26_RESILIENCE_CANDIDATE_RC17',
  version: build.version,
  generatedAt: new Date().toISOString(),
  status: 'not_deployed',
  deployable: false,
  productionModified: false,
  productionDeployed: false,
  tests: validation.tests,
  gates: {
    families: validation.gates.families,
    passed: validation.gates.passed,
    total: validation.gates.total,
    failed: validation.gates.failed,
    resiliencePassed: resilience.passed,
    resilienceTotal: resilience.total,
  },
  visualQa: { passed: visual.passed, total: visual.case_count, failed: visual.failed },
  integratedQa: { passed: integrated.passed, total: integrated.total },
  build: {
    files: build.files,
    totalBytes: build.totalBytes,
    javascriptBytes: build.budgets.javascriptBytes,
    cssBytes: build.budgets.cssBytes,
    jsonBytes: build.budgets.jsonBytes,
    budgetOk: build.budgetOk,
    modules: graph.modules,
    missingModules: graph.missing.length,
  },
  dependencies,
  protectedLayers: protectedBaseline,
  catalogExercises: 367,
  baseCommands: 44,
  extendedContractCommands: 52,
  remoteValidation: remote,
  blockers: [
    'Comparación autenticada del catálogo remoto de 52 comandos',
    'QA con cuentas reales Coach y Cliente',
    'Pruebas en iPhone, Android y tablet físicos',
    'Canario remoto observado y rollback ensayado',
  ],
};
write('recovery/RC17_SUMMARY.json', summary);

const excluded = new Set(['recovery/RC17_SHA256_MANIFEST.json']);
const entries = walk(root).filter((entry) => !excluded.has(entry.path));
write('recovery/RC17_SHA256_MANIFEST.json', {
  release: summary.release,
  version: summary.version,
  generatedAt: new Date().toISOString(),
  excluded: [...excluded],
  count: entries.length,
  totalBytes: entries.reduce((sum, row) => sum + row.size, 0),
  entries,
});

console.log(JSON.stringify({
  release: summary.release,
  version: summary.version,
  tests: `${summary.tests.passed}/${summary.tests.total}`,
  gates: `${summary.gates.passed}/${summary.gates.total}`,
  visual: `${summary.visualQa.passed}/${summary.visualQa.total}`,
  integrated: `${summary.integratedQa.passed}/${summary.integratedQa.total}`,
  manifestEntries: entries.length,
  webEntries: webEntries.length,
}, null, 2));
