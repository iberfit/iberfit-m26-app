import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const sourcePath = path.join(root, 'scripts', 'verify_rc35_canary_candidate.mjs');
const PROJECT_REF = 'tvqnvvwaddcuehqmzvty';
const PRODUCTION_REF = 'pjhmrhejsoofmouedavw';
const BRANCH = 'canary/rc40-business-hardening';
const VERSION = '26.0.0-canary.40-admin-complete';
const RELEASE = 'IBERFIT_M26_CANARY_RC40_ADMIN_COMPLETE';
const SW_VERSION = 'm26-rc40-admin-complete-canary-v1';
const PREVIOUS_SW_VERSION = 'm26-rc38-iri-diagnosis-bioimpedance-canary-v4';

if (!fs.existsSync(sourcePath)) {
  throw new Error('RC40_VERIFY_BASE_SCRIPT_MISSING');
}

let source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/gu, '\n');
const replaceOnce = (pattern, replacement, label) => {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`RC40_VERIFY_PATCH_MISMATCH:${label}`);
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
    "const EXPECTED_SOURCE_RELEASE = 'RC40';",
    `const EXPECTED_PROJECT_REF = '${PROJECT_REF}';`,
    'const EXPECTED_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;',
    `const EXPECTED_SW_VERSION = '${SW_VERSION}';`,
    `const EXPECTED_PREVIOUS_SW_VERSION = '${PREVIOUS_SW_VERSION}';`,
    "const REPORT_PREFIX = 'RC40';",
  ].join('\n'),
  'header',
);
replaceOnce(
  /\[version\.backendContract, 'RC30', 'backend-contract'\],/u,
  "[version.backendContract, 'RC40', 'backend-contract'],",
  'backend-contract',
);

if (source.includes(`const EXPECTED_PROJECT_REF = '${PRODUCTION_REF}';`)) {
  throw new Error('RC40_VERIFY_PRODUCTION_REF_REMAINS');
}

const tempPath = path.join(os.tmpdir(), `iberfit-rc40-verify-${process.pid}-${Date.now()}.mjs`);
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

const reportPath = path.join(root, 'recovery', 'RC40_BUILD_VERIFICATION.json');
if (!fs.existsSync(reportPath)) throw new Error('RC40_VERIFY_REPORT_MISSING');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
if (report.ok !== true || report.release !== RELEASE || report.version !== VERSION) {
  throw new Error('RC40_VERIFY_REPORT_INVALID');
}

const buildRoot = process.env.M26_BUILD_DIR
  || path.join(root, 'dist', 'm26-prepublicacion-infraestructura-candidate');
const runtimePath = path.join(buildRoot, 'm26', 'runtime-config.js');
const transportPath = path.join(buildRoot, 'src', 'm26', 'supabase-transport.js');
const applicationPath = path.join(buildRoot, 'src', 'm26', 'app', 'application.js');
for (const requiredPath of [runtimePath, transportPath, applicationPath]) {
  if (!fs.existsSync(requiredPath)) {
    throw new Error(`RC40_VERIFY_RUNTIME_FILE_MISSING:${requiredPath}`);
  }
}

const runtimeSource = fs.readFileSync(runtimePath, 'utf8');
const runtimeMatch = runtimeSource.match(/Object\.freeze\((\{[\s\S]*\})\);\s*$/u);
if (!runtimeMatch) throw new Error('RC40_VERIFY_RUNTIME_FORMAT_INVALID');
const runtime = JSON.parse(runtimeMatch[1]);
const transportSource = fs.readFileSync(transportPath, 'utf8');
const applicationSource = fs.readFileSync(applicationPath, 'utf8');
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
if (!applicationSource.includes('locationLike?.origin')) runtimeFailures.push('recovery-origin');
if (runtimeFailures.length) {
  throw new Error(`RC40_VERIFY_RUNTIME_HARDENING_FAILED:${runtimeFailures.join(',')}`);
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