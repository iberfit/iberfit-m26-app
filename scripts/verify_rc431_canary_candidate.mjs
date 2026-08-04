import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sourcePath = path.join(root, 'scripts', 'verify_rc35_canary_candidate.mjs');
const PROJECT_REF = 'tvqnvvwaddcuehqmzvty';
const PRODUCTION_REF = 'pjhmrhejsoofmouedavw';
const BRANCH = 'canary/rc43-1-draft-persistence';
const VERSION = '26.0.0-canary.43.1-draft-persistence';
const RELEASE = 'IBERFIT_M26_CANARY_RC43_1_DRAFT_PERSISTENCE';
const SW_VERSION = 'm26-rc43-1-draft-persistence-canary-v1';
const PREVIOUS_SW_VERSION = 'm26-rc43-operational-backend-canary-v1';

if (!fs.existsSync(sourcePath)) {
  throw new Error('RC431_VERIFY_BASE_SCRIPT_MISSING');
}

let source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/gu, '\n');
const replaceOnce = (pattern, replacement, label) => {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`RC431_VERIFY_PATCH_MISMATCH:${label}`);
  }
  source = source.replace(pattern, replacement);
};

replaceOnce(
  /const EXPECTED_BRANCH = String\(process\.env\.CF_PAGES_BRANCH \|\| 'canary\/rc35'\)\.trim\(\);[\s\S]*?const REPORT_PREFIX = EXPECTED_RC38 \? 'RC38' : EXPECTED_RC37 \? 'RC37' : EXPECTED_RC36 \? 'RC36' : 'RC35';/u,
  [
    `const EXPECTED_BRANCH = String(process.env.CF_PAGES_BRANCH || '${BRANCH}').trim();`,
    'const EXPECTED_RC38 = true;',
    'const EXPECTED_RC37 = false;',
    'const EXPECTED_RC36 = false;',
    `const EXPECTED_VERSION = '${VERSION}';`,
    `const EXPECTED_RELEASE = '${RELEASE}';`,
    "const EXPECTED_SOURCE_RELEASE = 'RC431';",
    `const EXPECTED_PROJECT_REF = '${PROJECT_REF}';`,
    'const EXPECTED_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;',
    `const EXPECTED_SW_VERSION = '${SW_VERSION}';`,
    `const EXPECTED_PREVIOUS_SW_VERSION = '${PREVIOUS_SW_VERSION}';`,
    "const REPORT_PREFIX = 'RC431';",
  ].join('\n'),
  'header',
);
replaceOnce(
  /\[version\.backendContract, 'RC30', 'backend-contract'\],/u,
  "[version.backendContract, 'RC431', 'backend-contract'],",
  'backend-contract',
);

if (source.includes(`const EXPECTED_PROJECT_REF = '${PRODUCTION_REF}';`)) {
  throw new Error('RC431_VERIFY_PRODUCTION_REF_REMAINS');
}

const tempPath = path.join(os.tmpdir(), `iberfit-rc431-verify-${process.pid}-${Date.now()}.mjs`);
fs.writeFileSync(tempPath, source, 'utf8');
let result;
try {
  result = spawnSync(process.execPath, [tempPath], {
    cwd: root,
    env: { ...process.env, CF_PAGES_BRANCH: BRANCH },
    stdio: 'inherit',
    windowsHide: true,
  });
} finally {
  fs.rmSync(tempPath, { force: true });
}
if (result?.error) throw result.error;
if (result?.status !== 0) process.exit(result?.status ?? 1);

const reportPath = path.join(root, 'recovery', 'RC431_BUILD_VERIFICATION.json');
if (!fs.existsSync(reportPath)) throw new Error('RC431_VERIFY_REPORT_MISSING');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
if (report.ok !== true || report.release !== RELEASE || report.version !== VERSION) {
  throw new Error('RC431_VERIFY_REPORT_INVALID');
}

const buildRoot = process.env.M26_BUILD_DIR
  || path.join(root, 'dist', 'm26-prepublicacion-infraestructura-candidate');
const runtimePath = path.join(buildRoot, 'm26', 'runtime-config.js');
const transportPath = path.join(buildRoot, 'src', 'm26', 'supabase-transport.js');
const applicationPath = path.join(buildRoot, 'src', 'm26', 'app', 'application.js');
const iriExternalReportPath = path.join(buildRoot, 'src', 'm26', 'workflows', 'iri-external-report-controller.js');
for (const requiredPath of [runtimePath, transportPath, applicationPath, iriExternalReportPath]) {
  if (!fs.existsSync(requiredPath)) {
    throw new Error(`RC431_VERIFY_RUNTIME_FILE_MISSING:${requiredPath}`);
  }
}

const runtimeSource = fs.readFileSync(runtimePath, 'utf8');
const runtimeMatch = runtimeSource.match(/Object\.freeze\((\{[\s\S]*\})\);\s*$/u);
if (!runtimeMatch) throw new Error('RC431_VERIFY_RUNTIME_FORMAT_INVALID');
const runtime = JSON.parse(runtimeMatch[1]);
const transportSource = fs.readFileSync(transportPath, 'utf8');
const applicationSource = fs.readFileSync(applicationPath, 'utf8');
const iriExternalReportSource = fs.readFileSync(iriExternalReportPath, 'utf8');
const previewHost = process.env.CF_PAGES_URL
  ? new URL(process.env.CF_PAGES_URL).hostname.toLowerCase()
  : '';

const runtimeFailures = [];
if (!Array.isArray(runtime.allowedHosts)) runtimeFailures.push('allowed-hosts-type');
if (!runtime.allowedHosts?.includes('m26-canary.iberfit.cl')) runtimeFailures.push('custom-canary-host');
if (previewHost && !runtime.allowedHosts?.includes(previewHost)) runtimeFailures.push('preview-host');
if (transportSource.includes(PRODUCTION_REF)) runtimeFailures.push('production-ref-in-transport');
if (!transportSource.includes(PROJECT_REF)) runtimeFailures.push('canary-ref-in-transport');
if (!transportSource.includes("QA_AUTHORIZED_EMAILS=new Set(['iberfit.cl@gmail.com'])")) runtimeFailures.push('carlos-auth');
if (!transportSource.includes("const projectPreview = /^[a-z0-9-]+\\.iberfit-m26-canary\\.pages\\.dev$/u.test(host);")) runtimeFailures.push('pages-preview-host-scope');
if (!applicationSource.includes('locationLike?.origin')) runtimeFailures.push('recovery-origin');
if (iriExternalReportSource.includes(PRODUCTION_REF)) runtimeFailures.push('production-ref-in-iri-external-report');
if (!iriExternalReportSource.includes(PROJECT_REF)) runtimeFailures.push('canary-ref-in-iri-external-report');

const productionOrigin = `https://${PRODUCTION_REF}.supabase.co`;
const canaryOrigin = `https://${PROJECT_REF}.supabase.co`;
const cspFiles = [];
function inspectCsp(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      inspectCsp(absolute);
      continue;
    }
    if (entry.name !== '_headers' && !entry.name.endsWith('.html')) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    if (!source.includes('connect-src')) continue;
    cspFiles.push({
      path: path.relative(root, absolute).replaceAll(path.sep, '/'),
      source,
    });
  }
}
inspectCsp(buildRoot);

if (cspFiles.length === 0) runtimeFailures.push('csp-file-missing');
if (cspFiles.some((entry) => entry.source.includes(productionOrigin))) {
  runtimeFailures.push('production-origin-in-csp');
}
if (!cspFiles.some((entry) => entry.source.includes(canaryOrigin))) {
  runtimeFailures.push('canary-origin-not-in-csp');
}

try {
  const iriModule = await import(
    `${pathToFileURL(iriExternalReportPath).href}?rc431=${Date.now()}`
  );
  if (typeof iriModule.createIriExternalReportService !== 'function') {
    throw new Error('IRI_SERVICE_EXPORT_MISSING');
  }
  iriModule.createIriExternalReportService({
    runtime,
    fetchImpl: async () => {
      throw new Error('RC431_IRI_VERIFY_UNEXPECTED_FETCH');
    },
  });
} catch {
  runtimeFailures.push('iri-external-report-runtime-validation');
}

if (runtimeFailures.length) {
  throw new Error(`RC431_VERIFY_RUNTIME_HARDENING_FAILED:${runtimeFailures.join(',')}`);
}

console.log(JSON.stringify({
  ok: true,
  reportPath,
  release: report.release,
  version: report.version,
  branch: report.branch,
  failures: report.failures,
  productionModified: false,
  productionDeployed: false,
}, null, 2));