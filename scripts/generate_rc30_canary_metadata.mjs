import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const buildRoot = path.join(root, 'dist', 'm26-prepublicacion-infraestructura-candidate');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const writeJson = (relative, value) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function walk(directory, base = directory) {
  const rows = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...walk(absolute, base));
    else if (entry.isFile()) rows.push({
      path: path.relative(base, absolute).replaceAll(path.sep, '/'),
      size: fs.statSync(absolute).size,
      sha256: hash(absolute),
    });
  }
  return rows;
}

function intendedRepositoryFiles() {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'buffer',
  });
  if (result.status !== 0) throw new Error('RC30_GIT_FILE_LIST_FAILED');
  return result.stdout.toString('utf8').split('\0').filter(Boolean).sort();
}

const validation = readJson('recovery/RC30_LOCAL_VALIDATION.json');
const gate = readJson('recovery/RC30_CANARY_GATE_REPORT.json');
const buildVerification = readJson('recovery/RC30_BUILD_VERIFICATION.json');
const version = readJson('dist/m26-prepublicacion-infraestructura-candidate/version.json');
if (!validation.ok || !gate.ok || !buildVerification.ok) throw new Error('RC30_REQUIRED_EVIDENCE_FAILED');
if (version.version !== '26.0.0-canary.30') throw new Error('RC30_BUILD_VERSION_MISMATCH');

const generatedAt = new Date().toISOString();
const webEntries = walk(buildRoot, buildRoot);
writeJson('recovery/RC30_WEB_SHA256_MANIFEST.json', {
  release: 'IBERFIT_M26_CANARY_RC30',
  version: version.version,
  generatedAt,
  count: webEntries.length,
  totalBytes: webEntries.reduce((sum, entry) => sum + entry.size, 0),
  entries: webEntries,
});

const summary = {
  release: 'IBERFIT_M26_CANARY_RC30',
  version: version.version,
  generatedAt,
  branch: version.branch,
  status: version.localValidationOnly ? 'local_validation' : 'canary_ready',
  deployable: version.deployable === true,
  localValidationOnly: version.localValidationOnly === true,
  productionModified: false,
  productionDeployed: false,
  projectRef: 'pjhmrhejsoofmouedavw',
  canaryDomain: 'm26-canary.iberfit.cl',
  qaOnly: true,
  tests: validation.tests,
  localGate: { passed: gate.passed, total: gate.total, failed: gate.failed },
  build: {
    files: buildVerification.files,
    totalBytes: buildVerification.totalBytes,
    budgetOk: buildVerification.budgetOk,
  },
  remoteIsolationExecuted: false,
  pendingExternalGates: validation.pendingExternalGates,
  packageFiles: null,
};
writeJson('release/RC30_CANARY_METADATA.json', summary);
writeJson('recovery/RC30_SUMMARY.json', summary);

const excluded = new Set([
  'recovery/RC30_SHA256_MANIFEST.json',
  'recovery/RC30_MANIFEST_VERIFICATION.json',
]);
const entriesForRepository = () => intendedRepositoryFiles()
  .filter((relative) => !excluded.has(relative.replaceAll('\\', '/')))
  .map((relative) => {
    const absolute = path.join(root, relative);
    return {
      path: relative.replaceAll(path.sep, '/'),
      size: fs.statSync(absolute).size,
      sha256: hash(absolute),
    };
  });

let repositoryEntries = entriesForRepository();
summary.packageFiles = repositoryEntries.length;
writeJson('release/RC30_CANARY_METADATA.json', summary);
writeJson('recovery/RC30_SUMMARY.json', summary);
repositoryEntries = entriesForRepository();
writeJson('recovery/RC30_SHA256_MANIFEST.json', {
  release: summary.release,
  version: summary.version,
  generatedAt,
  source: 'git tracked and non-ignored files',
  excluded: [...excluded],
  count: repositoryEntries.length,
  totalBytes: repositoryEntries.reduce((sum, entry) => sum + entry.size, 0),
  entries: repositoryEntries,
});
console.log(JSON.stringify({
  release: summary.release,
  version: summary.version,
  tests: `${summary.tests.passed}/${summary.tests.total}`,
  localGate: `${summary.localGate.passed}/${summary.localGate.total}`,
  webFiles: webEntries.length,
  packageFiles: repositoryEntries.length,
  localValidationOnly: summary.localValidationOnly,
}, null, 2));
