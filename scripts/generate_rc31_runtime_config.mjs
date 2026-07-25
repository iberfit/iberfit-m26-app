import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PROJECT_REF = 'pjhmrhejsoofmouedavw';
const VERSION = '26.0.0-canary.31';
const RELEASE = 'IBERFIT_M26_CANARY_RC31';
const DEFAULT_BRANCH = 'canary/rc31';
const SERVICE_WORKER_VERSION = 'm26-rc31-canary-v1';
const PREVIOUS_SERVICE_WORKER_VERSION = 'm26-rc30-canary-v1';

const required = [
  'M26_SUPABASE_URL',
  'M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_ONLY',
];

const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  throw new Error(`RC31_RUNTIME_ENV_MISSING:${missing.join(',')}`);
}

const url = process.env.M26_SUPABASE_URL.replace(/\/$/, '');

if (new URL(url).hostname !== `${PROJECT_REF}.supabase.co`) {
  throw new Error('RC31_RUNTIME_PROJECT_MISMATCH');
}

if (String(process.env.M26_QA_ONLY).toLowerCase() !== 'true') {
  throw new Error('RC31_RUNTIME_QA_ONLY_REQUIRED');
}

const key = process.env.M26_SUPABASE_PUBLISHABLE_KEY.trim();
const validationOnly =
  String(process.env.M26_RUNTIME_VALIDATION_ONLY || '').toLowerCase() ===
  'true';

if (!key) {
  throw new Error('RC31_RUNTIME_PUBLISHABLE_KEY_MISSING');
}

if (/service[_-]?role/i.test(key)) {
  throw new Error('RC31_RUNTIME_SERVICE_ROLE_FORBIDDEN');
}

if (key.split('.').length === 3) {
  try {
    const payload = JSON.parse(
      Buffer.from(
        key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8'),
    );

    if (payload?.role === 'service_role') {
      throw new Error('RC31_RUNTIME_SERVICE_ROLE_FORBIDDEN');
    }
  } catch (error) {
    if (String(error?.message).includes('SERVICE_ROLE')) {
      throw error;
    }
  }
}

const buildDir =
  process.env.M26_BUILD_DIR ||
  path.join('dist', 'm26-prepublicacion-infraestructura-candidate');

const runtimeTarget = path.join(buildDir, 'm26', 'runtime-config.js');
const versionTarget = path.join(buildDir, 'version.json');
const manifestTarget = path.join(buildDir, 'asset-manifest.json');
const serviceWorkerTarget = path.join(buildDir, 'm26', 'sw.js');

if (!fs.existsSync(path.dirname(runtimeTarget))) {
  throw new Error(`RC31_RUNTIME_BUILD_MISSING:${buildDir}`);
}

const config = {
  enabled: true,
  version: VERSION,
  projectRef: PROJECT_REF,
  url,
  publishableKey: key,
  qaOnly: true,
  timeoutMs: 12000,
  rpc: {
    bootstrap: 'iberfit_bootstrap_v26',
    preflight: 'iberfit_command_preflight_v26',
    execute: 'iberfit_execute_command_v26',
  },
};

fs.writeFileSync(
  runtimeTarget,
  `window.__IBERFIT_M26_RUNTIME__ = Object.freeze(${JSON.stringify(
    config,
    null,
    2,
  )});\n`,
);

if (!fs.existsSync(serviceWorkerTarget)) {
  throw new Error('RC31_RUNTIME_SERVICE_WORKER_MISSING');
}

const originalServiceWorker = fs.readFileSync(serviceWorkerTarget, 'utf8');
const canaryServiceWorker = originalServiceWorker
  .replace(
    "const VERSION='m26-rc28';",
    `const VERSION='${SERVICE_WORKER_VERSION}';`,
  )
  .replace(
    "const PREVIOUS_VERSION='m26-rc27';",
    `const PREVIOUS_VERSION='${PREVIOUS_SERVICE_WORKER_VERSION}';`,
  );

if (canaryServiceWorker === originalServiceWorker) {
  throw new Error('RC31_RUNTIME_SERVICE_WORKER_VERSION_NOT_FOUND');
}

if (
  !canaryServiceWorker.includes(
    `const VERSION='${SERVICE_WORKER_VERSION}';`,
  ) ||
  !canaryServiceWorker.includes(
    `const PREVIOUS_VERSION='${PREVIOUS_SERVICE_WORKER_VERSION}';`,
  )
) {
  throw new Error('RC31_RUNTIME_SERVICE_WORKER_VERSION_INCOMPLETE');
}

fs.writeFileSync(serviceWorkerTarget, canaryServiceWorker);

const files = [];

function walk(directory) {
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }

    const relative = path
      .relative(buildDir, absolute)
      .replaceAll(path.sep, '/');

    if (
      relative === 'version.json' ||
      relative === 'asset-manifest.json'
    ) {
      continue;
    }

    const bytes = fs.readFileSync(absolute);

    files.push({
      path: relative,
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
  }
}

walk(buildDir);
files.sort((a, b) => a.path.localeCompare(b.path));

const duplicatePaths = files
  .map((file) => file.path)
  .filter((entry, index, all) => all.indexOf(entry) !== index);

if (duplicatePaths.length) {
  throw new Error(
    `RC31_RUNTIME_DUPLICATE_ASSETS:${[...new Set(duplicatePaths)].join(',')}`,
  );
}

const sizeByExtension = (extension) =>
  files
    .filter((file) => file.path.endsWith(extension))
    .reduce((total, file) => total + file.size, 0);

const totalBytes = files.reduce((total, file) => total + file.size, 0);
const javascriptBytes = sizeByExtension('.js');
const cssBytes = sizeByExtension('.css');
const jsonBytes = sizeByExtension('.json');

const previousVersion = fs.existsSync(versionTarget)
  ? JSON.parse(fs.readFileSync(versionTarget, 'utf8'))
  : {};

const metadata = {
  ...previousVersion,
  version: VERSION,
  release: RELEASE,
  channel: 'canary',
  status: validationOnly ? 'local_validation' : 'canary_ready',
  deployable: !validationOnly,
  localValidationOnly: validationOnly,
  productionModified: false,
  productionDeployed: false,
  runtimeEnabled: true,
  runtimeCredentialMode: validationOnly
    ? 'synthetic_publishable_validation'
    : 'cloudflare_publishable',
  qaOnly: true,
  sourceRelease: 'RC31',
  backendContract: 'RC30',
  canaryDomain: 'm26-canary.iberfit.cl',
  branch: process.env.CF_PAGES_BRANCH || DEFAULT_BRANCH,
  commit:
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    null,
  builtAt: new Date().toISOString(),
  files: files.length,
  totalBytes,
  budgets: {
    javascriptBytes,
    cssBytes,
    jsonBytes,
    javascriptLimit: 820000,
    cssLimit: 155000,
    totalLimit: 3700000,
  },
  budgetOk:
    javascriptBytes <= 820000 &&
    cssBytes <= 155000 &&
    totalBytes <= 3700000,
};

fs.writeFileSync(
  versionTarget,
  `${JSON.stringify(metadata, null, 2)}\n`,
);

fs.writeFileSync(
  manifestTarget,
  `${JSON.stringify(
    {
      version: VERSION,
      release: RELEASE,
      locale: metadata.locale || 'es-ES',
      files,
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      runtimeTarget,
      versionTarget,
      manifestTarget,
      version: VERSION,
      release: RELEASE,
      branch: metadata.branch,
      serviceWorkerVersion: SERVICE_WORKER_VERSION,
      previousServiceWorkerVersion: PREVIOUS_SERVICE_WORKER_VERSION,
      projectRef: PROJECT_REF,
      qaOnly: true,
      files: files.length,
      budgetOk: metadata.budgetOk,
      keyType: key.startsWith('sb_publishable_')
        ? 'publishable'
        : 'legacy_anon_or_publishable',
      validationOnly,
    },
    null,
    2,
  ),
);

if (!metadata.budgetOk) {
  process.exit(1);
}
