import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_REF = 'pjhmrhejsoofmouedavw';
const DEFAULT_BRANCH = 'canary/rc35';
const DEPLOY_BRANCH = String(process.env.CF_PAGES_BRANCH || DEFAULT_BRANCH).trim();
const IS_RC36 = DEPLOY_BRANCH === 'canary/rc36';
const VERSION = IS_RC36 ? '26.0.0-canary.36' : '26.0.0-canary.35';
const RELEASE = IS_RC36 ? 'IBERFIT_M26_CANARY_RC36' : 'IBERFIT_M26_CANARY_RC35';
const SOURCE_RELEASE = IS_RC36 ? 'RC36' : 'RC35';
const SERVICE_WORKER_VERSION = IS_RC36 ? 'm26-rc36-canary-v1' : 'm26-rc35-canary-v1';
const PREVIOUS_SERVICE_WORKER_VERSION = IS_RC36 ? 'm26-rc35-canary-v1' : 'm26-rc33-canary-v1';
const CORE_TOTAL_LIMIT = 3_700_000;
const JAVASCRIPT_LIMIT = 820_000;
const CSS_LIMIT = 155_000;
const MEDIA_TOTAL_LIMIT = 64_000_000;
const MEDIA_FILE_LIMIT = 1_000_000;
const MEDIA_MAP_LIMIT = 2_000_000;
const MEDIA_ROOT_PREFIX = 'public/vendor/repdb/';
const MEDIA_PREFIX = `${MEDIA_ROOT_PREFIX}images/`;
const MEDIA_MAP_PATH =
  `${MEDIA_ROOT_PREFIX}iberfit-canonical-media-map-v1.json`;

const required = [
  'M26_SUPABASE_URL',
  'M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_ONLY',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`RC35_RUNTIME_ENV_MISSING:${missing.join(',')}`);
}

const url = process.env.M26_SUPABASE_URL.replace(/\/$/u, '');
if (new URL(url).hostname !== `${PROJECT_REF}.supabase.co`) {
  throw new Error('RC35_RUNTIME_PROJECT_MISMATCH');
}
if (String(process.env.M26_QA_ONLY).toLowerCase() !== 'true') {
  throw new Error('RC35_RUNTIME_QA_ONLY_REQUIRED');
}

const key = process.env.M26_SUPABASE_PUBLISHABLE_KEY.trim();
const validationOnly =
  String(process.env.M26_RUNTIME_VALIDATION_ONLY || '').toLowerCase() ===
  'true';
if (!key) throw new Error('RC35_RUNTIME_PUBLISHABLE_KEY_MISSING');
if (/service[_-]?role/iu.test(key)) {
  throw new Error('RC35_RUNTIME_SERVICE_ROLE_FORBIDDEN');
}
if (key.split('.').length === 3) {
  try {
    const payload = JSON.parse(
      Buffer.from(
        key.split('.')[1].replace(/-/gu, '+').replace(/_/gu, '/'),
        'base64',
      ).toString('utf8'),
    );
    if (payload?.role === 'service_role') {
      throw new Error('RC35_RUNTIME_SERVICE_ROLE_FORBIDDEN');
    }
  } catch (error) {
    if (String(error?.message).includes('SERVICE_ROLE')) throw error;
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
  throw new Error(`RC35_RUNTIME_BUILD_MISSING:${buildDir}`);
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
  throw new Error('RC35_RUNTIME_SERVICE_WORKER_MISSING');
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
  throw new Error('RC35_RUNTIME_SERVICE_WORKER_VERSION_NOT_FOUND');
}
if (
  !canaryServiceWorker.includes(
    `const VERSION='${SERVICE_WORKER_VERSION}';`,
  ) ||
  !canaryServiceWorker.includes(
    `const PREVIOUS_VERSION='${PREVIOUS_SERVICE_WORKER_VERSION}';`,
  )
) {
  throw new Error('RC35_RUNTIME_SERVICE_WORKER_VERSION_INCOMPLETE');
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
    if (relative === 'version.json' || relative === 'asset-manifest.json') {
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

const paths = files.map((file) => file.path);
const duplicates = paths.filter(
  (entry, index) => paths.indexOf(entry) !== index,
);
if (duplicates.length) {
  throw new Error(
    `RC35_RUNTIME_DUPLICATE_ASSETS:${[...new Set(duplicates)].join(',')}`,
  );
}

const mediaImageFiles = files.filter((file) =>
  file.path.startsWith(MEDIA_PREFIX)
);
const mediaMap = files.find((file) => file.path === MEDIA_MAP_PATH) || null;
const unexpectedRepdbFiles = files.filter(
  (file) =>
    file.path.startsWith(MEDIA_ROOT_PREFIX) &&
    file.path !== MEDIA_MAP_PATH &&
    !file.path.startsWith(MEDIA_PREFIX)
);
const coreFiles = files.filter(
  (file) =>
    file.path !== MEDIA_MAP_PATH && !file.path.startsWith(MEDIA_PREFIX)
);
const sum = (items) => items.reduce((total, file) => total + file.size, 0);
const sizeByExtension = (extension, items) =>
  items
    .filter((file) => file.path.endsWith(extension))
    .reduce((total, file) => total + file.size, 0);
const totalBytes = sum(files);
const coreBytes = sum(coreFiles);
const mediaImageBytes = sum(mediaImageFiles);
const mediaMapBytes = mediaMap?.size || 0;
const mediaBytes = mediaImageBytes + mediaMapBytes;
const javascriptBytes = sizeByExtension('.js', coreFiles);
const cssBytes = sizeByExtension('.css', coreFiles);
const jsonBytes = sizeByExtension('.json', coreFiles);
const largestMediaFile = mediaImageFiles.reduce(
  (largest, file) => (file.size > largest.size ? file : largest),
  { path: null, size: 0, sha256: null },
);
const repdbPackaged = Boolean(
  mediaMap &&
    mediaImageFiles.length > 0 &&
    unexpectedRepdbFiles.length === 0
);
const budgetOk =
  javascriptBytes <= JAVASCRIPT_LIMIT &&
  cssBytes <= CSS_LIMIT &&
  coreBytes <= CORE_TOTAL_LIMIT &&
  mediaBytes <= MEDIA_TOTAL_LIMIT &&
  largestMediaFile.size <= MEDIA_FILE_LIMIT &&
  Boolean(mediaMap && mediaMap.size <= MEDIA_MAP_LIMIT) &&
  unexpectedRepdbFiles.length === 0;

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
  sourceRelease: SOURCE_RELEASE,
  backendContract: 'RC30',
  canaryDomain: 'm26-canary.iberfit.cl',
  branch: DEPLOY_BRANCH,
  commit:
    process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || null,
  builtAt: new Date().toISOString(),
  files: files.length,
  totalBytes,
  coreBytes,
  mediaBytes,
  mediaImageBytes,
  mediaMapBytes,
  mediaFiles: mediaImageFiles.length,
  mediaAssetFiles: mediaImageFiles.length + (mediaMap ? 1 : 0),
  repdbUnexpectedFiles: unexpectedRepdbFiles.map((file) => file.path),
  repdbPackaged,
  budgets: {
    javascriptBytes,
    cssBytes,
    jsonBytes,
    coreBytes,
    mediaBytes,
    mediaImageBytes,
    mediaMapBytes,
    largestMediaFile,
    javascriptLimit: JAVASCRIPT_LIMIT,
    cssLimit: CSS_LIMIT,
    coreTotalLimit: CORE_TOTAL_LIMIT,
    mediaTotalLimit: MEDIA_TOTAL_LIMIT,
    mediaFileLimit: MEDIA_FILE_LIMIT,
    mediaMapLimit: MEDIA_MAP_LIMIT,
  },
  budgetOk,
};

fs.writeFileSync(versionTarget, `${JSON.stringify(metadata, null, 2)}\n`);
fs.writeFileSync(
  manifestTarget,
  `${JSON.stringify(
    {
      version: VERSION,
      release: RELEASE,
      locale: metadata.locale || 'es-ES',
      media: {
        packaged: repdbPackaged,
        files: mediaImageFiles.length,
        assetFiles: mediaImageFiles.length + (mediaMap ? 1 : 0),
        bytes: mediaBytes,
        imageBytes: mediaImageBytes,
        mapBytes: mediaMapBytes,
        mapPath: MEDIA_MAP_PATH,
        unexpectedFiles: unexpectedRepdbFiles.map((file) => file.path),
      },
      files,
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify(
    {
      ok: repdbPackaged && budgetOk,
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
      coreBytes,
      mediaBytes,
      mediaImageBytes,
      mediaMapBytes,
      mediaFiles: mediaImageFiles.length,
      mediaAssetFiles: mediaImageFiles.length + (mediaMap ? 1 : 0),
      repdbUnexpectedFiles: unexpectedRepdbFiles.map((file) => file.path),
      repdbPackaged,
      budgetOk,
      keyType: key.startsWith('sb_publishable_')
        ? 'publishable'
        : 'legacy_anon_or_publishable',
      validationOnly,
    },
    null,
    2,
  ),
);

if (!repdbPackaged || !budgetOk) process.exit(1);
