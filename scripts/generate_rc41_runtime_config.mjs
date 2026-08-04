import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const sourcePath = path.join(root, 'scripts', 'generate_rc35_runtime_config.mjs');
const buildDir = process.env.M26_BUILD_DIR || path.join('dist', 'm26-prepublicacion-infraestructura-candidate');
const runtimePath = path.join(root, buildDir, 'm26', 'runtime-config.js');
const versionPath = path.join(root, buildDir, 'version.json');

const PROJECT_REF = 'tvqnvvwaddcuehqmzvty';
const PRODUCTION_REF = 'pjhmrhejsoofmouedavw';
const BRANCH = 'canary/rc41-architecture-hardening';
const VERSION = '26.0.0-canary.41-pwa-diagnostics';
const RELEASE = 'IBERFIT_M26_CANARY_RC41_PWA_DIAGNOSTICS';
const SW_VERSION = 'm26-rc41-pwa-diagnostics-canary-v1';
const PREVIOUS_SW_VERSION = 'm26-rc40-admin-complete-canary-v1';
const JAVASCRIPT_LIMIT = 1_250_000;

if (!fs.existsSync(sourcePath)) {
  throw new Error('RC41_RUNTIME_BASE_SCRIPT_MISSING');
}

const requiredEnv = ['M26_SUPABASE_URL', 'M26_SUPABASE_PUBLISHABLE_KEY', 'M26_QA_ONLY'];
const missingEnv = requiredEnv.filter((name) => !String(process.env[name] || '').trim());
if (missingEnv.length) {
  throw new Error(`RC41_RUNTIME_ENV_MISSING:${missingEnv.join(',')}`);
}

const expectedUrl = `https://${PROJECT_REF}.supabase.co`;
const suppliedUrl = String(process.env.M26_SUPABASE_URL).replace(/\/$/u, '');
if (suppliedUrl !== expectedUrl) {
  throw new Error(`RC41_RUNTIME_CANARY_URL_REQUIRED:${expectedUrl}`);
}
if (suppliedUrl.includes(PRODUCTION_REF)) {
  throw new Error('RC41_RUNTIME_PRODUCTION_URL_FORBIDDEN');
}
if (String(process.env.M26_QA_ONLY).toLowerCase() !== 'true') {
  throw new Error('RC41_RUNTIME_QA_ONLY_REQUIRED');
}
const deployBranch = String(process.env.CF_PAGES_BRANCH || BRANCH).trim();
if (deployBranch !== BRANCH) {
  throw new Error(`RC41_RUNTIME_BRANCH_REQUIRED:${BRANCH}`);
}

const pagesUrl = String(process.env.CF_PAGES_URL || '').trim();
let previewHost = '';
if (pagesUrl) {
  const parsedPagesUrl = new URL(pagesUrl);
  if (
    parsedPagesUrl.protocol !== 'https:' ||
    !parsedPagesUrl.hostname.endsWith('.pages.dev') ||
    parsedPagesUrl.pathname !== '/' ||
    parsedPagesUrl.search ||
    parsedPagesUrl.hash ||
    parsedPagesUrl.username ||
    parsedPagesUrl.password
  ) {
    throw new Error('RC41_RUNTIME_CF_PAGES_URL_INVALID');
  }
  previewHost = parsedPagesUrl.hostname.toLowerCase();
}
const allowedHosts = [...new Set([
  'm26-canary.iberfit.cl',
  previewHost,
].filter(Boolean))];

let source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/gu, '\n');

const replaceOnce = (pattern, replacement, label) => {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`RC41_RUNTIME_PATCH_MISMATCH:${label}`);
  }
  source = source.replace(pattern, replacement);
};

replaceOnce(
  /const PROJECT_REF = 'pjhmrhejsoofmouedavw';/u,
  `const PROJECT_REF = '${PROJECT_REF}';`,
  'project-ref',
);
replaceOnce(
  /const DEFAULT_BRANCH = 'canary\/rc35';/u,
  `const DEFAULT_BRANCH = '${BRANCH}';`,
  'default-branch',
);
replaceOnce(
  /const VERSION = IS_RC38[\s\S]*?: '26\.0\.0-canary\.35';/u,
  `const VERSION = '${VERSION}';`,
  'version',
);
replaceOnce(
  /const RELEASE = IS_RC38[\s\S]*?: 'IBERFIT_M26_CANARY_RC35';/u,
  `const RELEASE = '${RELEASE}';`,
  'release',
);
replaceOnce(
  /const SOURCE_RELEASE = IS_RC36 \? 'RC36' : 'RC35';/u,
  "const SOURCE_RELEASE = 'RC41';",
  'source-release',
);
replaceOnce(
  /const DEPLOY_SOURCE_RELEASE = IS_RC38 \? 'RC38' : IS_RC37 \? 'RC37' : SOURCE_RELEASE;/u,
  "const DEPLOY_SOURCE_RELEASE = 'RC41';",
  'deploy-source-release',
);
replaceOnce(
  /const SERVICE_WORKER_VERSION = IS_RC38[\s\S]*?: 'm26-rc35-canary-v1';/u,
  `const SERVICE_WORKER_VERSION = '${SW_VERSION}';`,
  'service-worker-version',
);
replaceOnce(
  /const PREVIOUS_SERVICE_WORKER_VERSION = IS_RC38[\s\S]*?: 'm26-rc33-canary-v1';/u,
  `const PREVIOUS_SERVICE_WORKER_VERSION = '${PREVIOUS_SW_VERSION}';`,
  'previous-service-worker-version',
);
replaceOnce(
  /const JAVASCRIPT_LIMIT = IS_RC38 \|\| PACKAGE_VERSION === '26\.0\.0-canary\.38-iri-diagnosis-bioimpedance'[\s\S]*?: 820_000;/u,
  `const JAVASCRIPT_LIMIT = ${JAVASCRIPT_LIMIT};`,
  'javascript-limit',
);
replaceOnce(
  /backendContract: 'RC30',/u,
  "backendContract: 'RC41',",
  'backend-contract',
);
replaceOnce(
  /  qaOnly: true,\n  timeoutMs:/u,
  `  qaOnly: true,\n  allowedHosts: ${JSON.stringify(allowedHosts)},\n  timeoutMs:`,
  'allowed-hosts',
);

if (source.includes(`const PROJECT_REF = '${PRODUCTION_REF}';`)) {
  throw new Error('RC41_RUNTIME_PRODUCTION_REF_REMAINS');
}

const tempPath = path.join(os.tmpdir(), `iberfit-rc40-runtime-${process.pid}-${Date.now()}.mjs`);
fs.writeFileSync(tempPath, source, 'utf8');

let result;
try {
  result = spawnSync(process.execPath, [tempPath], {
    cwd: root,
    env: {
      ...process.env,
      CF_PAGES_BRANCH: BRANCH,
      M26_SUPABASE_URL: expectedUrl,
      M26_QA_ONLY: 'true',
    },
    stdio: 'inherit',
    windowsHide: true,
  });
} finally {
  fs.rmSync(tempPath, { force: true });
}

if (result?.error) throw result.error;
if (result?.status !== 0) process.exit(result?.status ?? 1);
if (!fs.existsSync(runtimePath) || !fs.existsSync(versionPath)) {
  throw new Error('RC41_RUNTIME_OUTPUT_MISSING');
}

const runtimeSource = fs.readFileSync(runtimePath, 'utf8');
const version = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
const runtimeMatch = runtimeSource.match(/Object\.freeze\((\{[\s\S]*\})\);\s*$/u);
if (!runtimeMatch) throw new Error('RC41_RUNTIME_OUTPUT_INVALID');
const runtime = JSON.parse(runtimeMatch[1]);

const failures = [];
if (runtime.projectRef !== PROJECT_REF) failures.push('runtime-project-ref');
if (runtime.url !== expectedUrl) failures.push('runtime-url');
if (runtime.enabled !== true || runtime.qaOnly !== true) failures.push('runtime-safety');
if (
  !Array.isArray(runtime.allowedHosts) ||
  !runtime.allowedHosts.includes('m26-canary.iberfit.cl') ||
  (previewHost && !runtime.allowedHosts.includes(previewHost))
) failures.push('runtime-allowed-hosts');
if (runtime.version !== VERSION) failures.push('runtime-version');
if (String(runtime.publishableKey || '').includes(PRODUCTION_REF)) failures.push('runtime-production-key-marker');
if (runtimeSource.includes(PRODUCTION_REF)) failures.push('runtime-production-ref');
if (version.version !== VERSION) failures.push('metadata-version');
if (version.release !== RELEASE) failures.push('metadata-release');
if (version.branch !== BRANCH) failures.push('metadata-branch');
if (version.backendContract !== 'RC41') failures.push('metadata-backend-contract');
if (version.productionModified !== false || version.productionDeployed !== false) failures.push('metadata-production-state');
if (version.runtimeEnabled !== true || version.qaOnly !== true) failures.push('metadata-runtime-state');
if (version.budgetOk !== true || Number(version?.budgets?.javascriptLimit) !== JAVASCRIPT_LIMIT) failures.push('metadata-budget');
if (failures.length) {
  throw new Error(`RC41_RUNTIME_POSTCHECK_FAILED:${failures.join(',')}`);
}

console.log(JSON.stringify({
  ok: true,
  release: RELEASE,
  version: VERSION,
  branch: BRANCH,
  projectRef: PROJECT_REF,
  url: expectedUrl,
  qaOnly: true,
  productionModified: false,
  productionDeployed: false,
  runtimePath,
  versionPath,
}, null, 2));