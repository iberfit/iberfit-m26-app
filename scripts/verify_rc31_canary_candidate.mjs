import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const buildRoot = path.join(
  root,
  'dist',
  'm26-prepublicacion-infraestructura-candidate',
);
const EXPECTED_VERSION = '26.0.0-canary.31';
const EXPECTED_RELEASE = 'IBERFIT_M26_CANARY_RC31';
const EXPECTED_BRANCH = 'canary/rc31';
const EXPECTED_PROJECT_REF = 'pjhmrhejsoofmouedavw';
const EXPECTED_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const EXPECTED_SW_VERSION = 'm26-rc31-canary-v1';
const EXPECTED_PREVIOUS_SW_VERSION = 'm26-rc30-canary-v1';
const failures = [];

const required = (relative) => {
  const absolute = path.join(buildRoot, relative);
  if (!fs.existsSync(absolute)) {
    failures.push({ path: relative, reason: 'missing' });
  }
  return absolute;
};

const sha256 = (absolute) =>
  crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');

const versionPath = required('version.json');
const manifestPath = required('asset-manifest.json');
const runtimePath = required(path.join('m26', 'runtime-config.js'));
const serviceWorkerPath = required(path.join('m26', 'sw.js'));

let version = {};
let manifest = { files: [] };
let runtimeConfig = {};
let serviceWorker = '';

if (!failures.length) {
  version = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');

  const runtimeSource = fs.readFileSync(runtimePath, 'utf8');
  const match = runtimeSource.match(
    /Object\.freeze\((\{[\s\S]*\})\);\s*$/,
  );

  if (!match) {
    failures.push({
      path: 'm26/runtime-config.js',
      reason: 'invalid-format',
    });
  } else {
    runtimeConfig = JSON.parse(match[1]);
  }
}

if (version.version !== EXPECTED_VERSION) {
  failures.push({ path: 'version.json', reason: 'version' });
}
if (version.release !== EXPECTED_RELEASE) {
  failures.push({ path: 'version.json', reason: 'release' });
}
if (version.branch !== EXPECTED_BRANCH) {
  failures.push({ path: 'version.json', reason: 'branch' });
}
if (version.channel !== 'canary') {
  failures.push({ path: 'version.json', reason: 'channel' });
}
if (version.sourceRelease !== 'RC31') {
  failures.push({ path: 'version.json', reason: 'source-release' });
}
if (version.backendContract !== 'RC30') {
  failures.push({ path: 'version.json', reason: 'backend-contract' });
}
if (version.canaryDomain !== 'm26-canary.iberfit.cl') {
  failures.push({ path: 'version.json', reason: 'canary-domain' });
}
if (version.qaOnly !== true || version.runtimeEnabled !== true) {
  failures.push({ path: 'version.json', reason: 'qa-runtime' });
}
if (
  version.productionModified !== false ||
  version.productionDeployed !== false
) {
  failures.push({ path: 'version.json', reason: 'production-state' });
}
if (version.budgetOk !== true) {
  failures.push({ path: 'version.json', reason: 'budget' });
}

if (runtimeConfig.enabled !== true || runtimeConfig.qaOnly !== true) {
  failures.push({
    path: 'm26/runtime-config.js',
    reason: 'runtime-disabled',
  });
}
if (runtimeConfig.version !== EXPECTED_VERSION) {
  failures.push({
    path: 'm26/runtime-config.js',
    reason: 'runtime-version',
  });
}
if (runtimeConfig.projectRef !== EXPECTED_PROJECT_REF) {
  failures.push({ path: 'm26/runtime-config.js', reason: 'project' });
}
if (runtimeConfig.url !== EXPECTED_URL) {
  failures.push({ path: 'm26/runtime-config.js', reason: 'origin' });
}
if (
  !runtimeConfig.publishableKey ||
  /service[_-]?role/i.test(runtimeConfig.publishableKey)
) {
  failures.push({ path: 'm26/runtime-config.js', reason: 'key' });
}
if (
  String(runtimeConfig.publishableKey).includes('local_validation') &&
  version.localValidationOnly !== true
) {
  failures.push({ path: 'version.json', reason: 'validation-mode' });
}

if (manifest.version !== EXPECTED_VERSION) {
  failures.push({ path: 'asset-manifest.json', reason: 'version' });
}
if (manifest.release !== EXPECTED_RELEASE) {
  failures.push({ path: 'asset-manifest.json', reason: 'release' });
}
if (!Array.isArray(manifest.files)) {
  failures.push({ path: 'asset-manifest.json', reason: 'files' });
} else {
  const paths = manifest.files.map((entry) => entry.path);
  const duplicatePaths = paths.filter(
    (entry, index) => paths.indexOf(entry) !== index,
  );

  for (const duplicate of new Set(duplicatePaths)) {
    failures.push({
      path: duplicate,
      reason: 'duplicate-manifest-entry',
    });
  }

  for (const entry of manifest.files) {
    const absolute = path.join(buildRoot, entry.path);

    if (!fs.existsSync(absolute)) {
      failures.push({ path: entry.path, reason: 'missing' });
      continue;
    }

    const size = fs.statSync(absolute).size;
    const digest = sha256(absolute);

    if (size !== entry.size || digest !== entry.sha256) {
      failures.push({ path: entry.path, reason: 'mismatch' });
    }
  }
}

if (
  !serviceWorker.includes(
    `const VERSION='${EXPECTED_SW_VERSION}';`,
  )
) {
  failures.push({ path: 'm26/sw.js', reason: 'service-worker-version' });
}
if (
  !serviceWorker.includes(
    `const PREVIOUS_VERSION='${EXPECTED_PREVIOUS_SW_VERSION}';`,
  )
) {
  failures.push({
    path: 'm26/sw.js',
    reason: 'service-worker-previous-version',
  });
}

const report = {
  release: EXPECTED_RELEASE,
  version: version.version || null,
  generatedAt: new Date().toISOString(),
  branch: version.branch || null,
  sourceRelease: version.sourceRelease || null,
  backendContract: version.backendContract || null,
  serviceWorkerVersion: EXPECTED_SW_VERSION,
  previousServiceWorkerVersion: EXPECTED_PREVIOUS_SW_VERSION,
  files: Array.isArray(manifest.files) ? manifest.files.length : 0,
  totalBytes: version.totalBytes || 0,
  budgetOk: version.budgetOk === true,
  localValidationOnly: version.localValidationOnly === true,
  deployable: version.deployable === true,
  keyType: String(runtimeConfig.publishableKey || '').startsWith(
    'sb_publishable_',
  )
    ? 'publishable'
    : 'legacy_anon_or_publishable',
  failures,
  ok: failures.length === 0,
  productionModified: false,
  productionDeployed: false,
};

fs.mkdirSync(path.join(root, 'recovery'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'recovery', 'RC31_BUILD_VERIFICATION.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));

if (!report.ok) process.exit(1);
