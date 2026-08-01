import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
).version;
const dist = path.join(
  root,
  'dist',
  'm26-prepublicacion-infraestructura-candidate'
);
const CORE_TOTAL_LIMIT = 3_700_000;
const JAVASCRIPT_LIMIT = packageVersion === '26.0.0-canary.38-iri-diagnosis-bioimpedance'
  ? 850_000
  : 820_000;
const CSS_LIMIT = 155_000;
const MEDIA_TOTAL_LIMIT = 64_000_000;
const MEDIA_FILE_LIMIT = 1_000_000;
const MEDIA_MAP_LIMIT = 2_000_000;
const MEDIA_ROOT_PREFIX = 'public/vendor/repdb/';
const MEDIA_PREFIX = `${MEDIA_ROOT_PREFIX}images/`;
const MEDIA_MAP_PATH =
  `${MEDIA_ROOT_PREFIX}iberfit-canonical-media-map-v1.json`;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

function copy(source, target) {
  const from = path.join(root, source);
  const to = path.join(dist, target);
  if (!fs.existsSync(from)) {
    throw new Error(`RC29_BUILD_SOURCE_MISSING:${source}`);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

copy('public/m26/index.html', 'index.html');
copy('public/m26', 'm26');
copy('src/m26', 'src/m26');
copy(
  'baseline_m25_2/exercise-catalog-m25.json',
  'baseline_m25_2/exercise-catalog-m25.json'
);
copy('public/isotipo-iberfit.png', 'public/isotipo-iberfit.png');
copy(MEDIA_MAP_PATH, MEDIA_MAP_PATH);
copy(
  'public/vendor/repdb/images/flat',
  'public/vendor/repdb/images/flat'
);
copy('public/m26/_headers', '_headers');
copy('public/m26/_redirects', '_redirects');

const files = [];
function walk(directory) {
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }

    const relative = path.relative(dist, absolute).replaceAll(path.sep, '/');
    if (['version.json', 'asset-manifest.json'].includes(relative)) continue;
    const bytes = fs.readFileSync(absolute);
    files.push({
      path: relative,
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
  }
}

walk(dist);
files.sort((a, b) => a.path.localeCompare(b.path));

const size = (extension, source = files) =>
  source
    .filter((item) => item.path.endsWith(extension))
    .reduce((sum, item) => sum + item.size, 0);
const mediaImageFiles = files.filter((item) =>
  item.path.startsWith(MEDIA_PREFIX)
);
const mediaMap = files.find((item) => item.path === MEDIA_MAP_PATH) || null;
const unexpectedRepdbFiles = files.filter(
  (item) =>
    item.path.startsWith(MEDIA_ROOT_PREFIX) &&
    item.path !== MEDIA_MAP_PATH &&
    !item.path.startsWith(MEDIA_PREFIX)
);
const coreFiles = files.filter(
  (item) =>
    item.path !== MEDIA_MAP_PATH && !item.path.startsWith(MEDIA_PREFIX)
);
const totalBytes = files.reduce((sum, item) => sum + item.size, 0);
const coreBytes = coreFiles.reduce((sum, item) => sum + item.size, 0);
const mediaImageBytes = mediaImageFiles.reduce(
  (sum, item) => sum + item.size,
  0
);
const mediaMapBytes = mediaMap?.size || 0;
const mediaBytes = mediaImageBytes + mediaMapBytes;
const javascriptBytes = size('.js', coreFiles);
const cssBytes = size('.css', coreFiles);
const jsonBytes = size('.json', coreFiles);
const largestMediaFile = mediaImageFiles.reduce(
  (largest, item) => (item.size > largest.size ? item : largest),
  { path: null, size: 0, sha256: null }
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

const meta = {
  version: '26.0.0-prepublicacion-infraestructura.29',
  release: 'IBERFIT_M26_PREPUBLICACION_INFRA_RC29',
  status: 'not_deployed',
  deployable: false,
  localValidationOnly: true,
  productionModified: false,
  productionDeployed: false,
  builtAt: new Date().toISOString(),
  files: files.length,
  totalBytes,
  coreBytes,
  mediaBytes,
  mediaImageBytes,
  mediaMapBytes,
  mediaFiles: mediaImageFiles.length,
  mediaAssetFiles: mediaImageFiles.length + (mediaMap ? 1 : 0),
  repdbUnexpectedFiles: unexpectedRepdbFiles.map((item) => item.path),
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
  locale: 'es-ES',
  functionalBaseline: 'RC28',
  infrastructureRelease: 'RC29',
  runtimeEnabled: false,
  qaOnly: true,
};

fs.writeFileSync(
  path.join(dist, 'version.json'),
  `${JSON.stringify(meta, null, 2)}\n`
);
fs.writeFileSync(
  path.join(dist, 'asset-manifest.json'),
  `${JSON.stringify(
    {
      version: meta.version,
      locale: meta.locale,
      media: {
        packaged: repdbPackaged,
        files: mediaImageFiles.length,
        assetFiles: mediaImageFiles.length + (mediaMap ? 1 : 0),
        bytes: mediaBytes,
        imageBytes: mediaImageBytes,
        mapBytes: mediaMapBytes,
        mapPath: MEDIA_MAP_PATH,
        unexpectedFiles: unexpectedRepdbFiles.map((item) => item.path),
      },
      files,
    },
    null,
    2
  )}\n`
);

console.log(JSON.stringify(meta, null, 2));
if (!repdbPackaged || !budgetOk) process.exit(1);
