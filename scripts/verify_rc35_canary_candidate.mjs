import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const buildRoot = path.join(
  root,
  'dist',
  'm26-prepublicacion-infraestructura-candidate',
);
const EXPECTED_BRANCH = String(process.env.CF_PAGES_BRANCH || 'canary/rc35').trim();
const EXPECTED_RC36 = EXPECTED_BRANCH === 'canary/rc36';
const EXPECTED_VERSION = EXPECTED_RC36 ? '26.0.0-canary.36' : '26.0.0-canary.35';
const EXPECTED_RELEASE = EXPECTED_RC36 ? 'IBERFIT_M26_CANARY_RC36' : 'IBERFIT_M26_CANARY_RC35';
const EXPECTED_SOURCE_RELEASE = EXPECTED_RC36 ? 'RC36' : 'RC35';
const EXPECTED_PROJECT_REF = 'pjhmrhejsoofmouedavw';
const EXPECTED_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const EXPECTED_SW_VERSION = EXPECTED_RC36 ? 'm26-rc36-canary-v10' : 'm26-rc35-canary-v1';
const EXPECTED_PREVIOUS_SW_VERSION = EXPECTED_RC36 ? 'm26-rc35-canary-v1' : 'm26-rc33-canary-v1';
const MEDIA_ROOT_PREFIX = 'public/vendor/repdb/';
const MEDIA_PREFIX = `${MEDIA_ROOT_PREFIX}images/`;
const MEDIA_MAP_PATH =
  `${MEDIA_ROOT_PREFIX}iberfit-canonical-media-map-v1.json`;
const failures = [];

const required = (relative) => {
  const absolute = path.join(buildRoot, relative);
  if (!fs.existsSync(absolute)) failures.push({ path: relative, reason: 'missing' });
  return absolute;
};
const sha256 = (absolute) =>
  crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');

const versionPath = required('version.json');
const manifestPath = required('asset-manifest.json');
const runtimePath = required(path.join('m26', 'runtime-config.js'));
const serviceWorkerPath = required(path.join('m26', 'sw.js'));
const iriReportHtmlPath = required(path.join('m26', 'iri-report.html'));
const iriReportCssPath = required(path.join('m26', 'iri-report.css'));
const iriReportPagePath = required(path.join('src', 'm26', 'workflows', 'iri-report-page.js'));
required(MEDIA_MAP_PATH);

let version = {};
let manifest = { files: [] };
let runtimeConfig = {};
let serviceWorker = '';
let iriReportHtml = '';
let iriReportCss = '';
let iriReportPage = '';

if (!failures.length) {
  version = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
  iriReportHtml = fs.readFileSync(iriReportHtmlPath, 'utf8');
  iriReportCss = fs.readFileSync(iriReportCssPath, 'utf8');
  iriReportPage = fs.readFileSync(iriReportPagePath, 'utf8');
  const runtimeSource = fs.readFileSync(runtimePath, 'utf8');
  const match = runtimeSource.match(/Object\.freeze\((\{[\s\S]*\})\);\s*$/u);
  if (!match) {
    failures.push({ path: 'm26/runtime-config.js', reason: 'invalid-format' });
  } else {
    runtimeConfig = JSON.parse(match[1]);
  }
}

for (const [actual, expected, reason] of [
  [version.version, EXPECTED_VERSION, 'version'],
  [version.release, EXPECTED_RELEASE, 'release'],
  [version.branch, EXPECTED_BRANCH, 'branch'],
  [version.channel, 'canary', 'channel'],
  [version.sourceRelease, EXPECTED_SOURCE_RELEASE, 'source-release'],
  [version.backendContract, 'RC30', 'backend-contract'],
  [version.canaryDomain, 'm26-canary.iberfit.cl', 'canary-domain'],
]) {
  if (actual !== expected) failures.push({ path: 'version.json', reason });
}
if (version.qaOnly !== true || version.runtimeEnabled !== true) {
  failures.push({ path: 'version.json', reason: 'qa-runtime' });
}
if (version.productionModified !== false || version.productionDeployed !== false) {
  failures.push({ path: 'version.json', reason: 'production-state' });
}
if (version.budgetOk !== true || version.repdbPackaged !== true) {
  failures.push({ path: 'version.json', reason: 'budget-or-media' });
}
if (!(Number(version.mediaFiles) > 0) || !(Number(version.mediaBytes) > 0)) {
  failures.push({ path: 'version.json', reason: 'media-count' });
}

if (runtimeConfig.enabled !== true || runtimeConfig.qaOnly !== true) {
  failures.push({ path: 'm26/runtime-config.js', reason: 'runtime-disabled' });
}
if (runtimeConfig.version !== EXPECTED_VERSION) {
  failures.push({ path: 'm26/runtime-config.js', reason: 'runtime-version' });
}
if (runtimeConfig.projectRef !== EXPECTED_PROJECT_REF) {
  failures.push({ path: 'm26/runtime-config.js', reason: 'project' });
}
if (runtimeConfig.url !== EXPECTED_URL) {
  failures.push({ path: 'm26/runtime-config.js', reason: 'origin' });
}
if (!runtimeConfig.publishableKey || /service[_-]?role/iu.test(runtimeConfig.publishableKey)) {
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
if (
  manifest.media?.packaged !== true ||
  manifest.media?.mapPath !== MEDIA_MAP_PATH ||
  !Array.isArray(manifest.media?.unexpectedFiles) ||
  manifest.media.unexpectedFiles.length !== 0
) {
  failures.push({ path: 'asset-manifest.json', reason: 'media-metadata' });
}
if (!Array.isArray(manifest.files)) {
  failures.push({ path: 'asset-manifest.json', reason: 'files' });
} else {
  const paths = manifest.files.map((entry) => entry.path);
  const duplicatePaths = paths.filter(
    (entry, index) => paths.indexOf(entry) !== index,
  );
  for (const duplicate of new Set(duplicatePaths)) {
    failures.push({ path: duplicate, reason: 'duplicate-manifest-entry' });
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
  const mediaEntries = manifest.files.filter((entry) =>
    entry.path.startsWith(MEDIA_PREFIX),
  );
  const unexpectedRepdbEntries = manifest.files.filter(
    (entry) =>
      entry.path.startsWith(MEDIA_ROOT_PREFIX) &&
      entry.path !== MEDIA_MAP_PATH &&
      !entry.path.startsWith(MEDIA_PREFIX),
  );
  if (!paths.includes(MEDIA_MAP_PATH) || mediaEntries.length === 0) {
    failures.push({ path: MEDIA_PREFIX, reason: 'media-not-packaged' });
  }
  for (const entry of unexpectedRepdbEntries) {
    failures.push({
      path: entry.path,
      reason: 'unexpected-repdb-runtime-file',
    });
  }
}

if (!serviceWorker.includes(`const VERSION='${EXPECTED_SW_VERSION}';`)) {
  failures.push({ path: 'm26/sw.js', reason: 'service-worker-version' });
}
if (
  !serviceWorker.includes(
    `const PREVIOUS_VERSION='${EXPECTED_PREVIOUS_SW_VERSION}';`,
  )
) {
  failures.push({ path: 'm26/sw.js', reason: 'service-worker-previous-version' });
}
if (!serviceWorker.includes('/public/vendor/repdb/')) {
  failures.push({ path: 'm26/sw.js', reason: 'repdb-public-route' });
}

if (!/data-iri-report-shell/u.test(iriReportHtml) || !/\/m26\/iri-report\.css/u.test(iriReportHtml) || !/\/src\/m26\/workflows\/iri-report-page\.js/u.test(iriReportHtml)) {
  failures.push({ path: 'm26/iri-report.html', reason: 'report-shell-invalid' });
}
if (/id=["']app["']/u.test(iriReportHtml)) {
  failures.push({ path: 'm26/iri-report.html', reason: 'spa-shell-substitution' });
}
if (!/\.pdf-page/u.test(iriReportCss) || !/\.iri-report-toolbar/u.test(iriReportCss) || !/\.report-page-content/u.test(iriReportCss) || !/iri-report-fit-82/u.test(iriReportCss)) {
  failures.push({ path: 'm26/iri-report.css', reason: 'report-stylesheet-invalid' });
}
if (!/localStorage\.getItem/u.test(iriReportPage) || !/m26:iri-report-ready/u.test(iriReportPage) || !/reportPages/u.test(iriReportPage)) {
  failures.push({ path: 'src/m26/workflows/iri-report-page.js', reason: 'report-loader-invalid' });
}
for (const asset of ['/m26/iri-report.html','/m26/iri-report.css','/src/m26/workflows/iri-report-page.js']) {
  if (!serviceWorker.includes(asset)) failures.push({ path: 'm26/sw.js', reason: `report-shell-not-preloaded:${asset}` });
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
  mediaFiles: version.mediaFiles || 0,
  coreBytes: version.coreBytes || 0,
  mediaBytes: version.mediaBytes || 0,
  totalBytes: version.totalBytes || 0,
  budgetOk: version.budgetOk === true,
  repdbPackaged: version.repdbPackaged === true,
  localValidationOnly: version.localValidationOnly === true,
  deployable: version.deployable === true,
  failures,
  ok: failures.length === 0,
  productionModified: false,
  productionDeployed: false,
};

fs.mkdirSync(path.join(root, 'recovery'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'recovery', 'RC35_BUILD_VERIFICATION.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
