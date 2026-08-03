import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const buildRoot = process.env.M26_BUILD_DIR
  || path.join(root, 'dist', 'm26-prepublicacion-infraestructura-candidate');
const transportPath = path.join(buildRoot, 'src', 'm26', 'supabase-transport.js');

const CANARY_PROJECT_SUFFIX = '.iberfit-m26-canary.pages.dev';
const PRODUCTION_REF = 'pjhmrhejsoofmouedavw';
const needle = "  const canary = host === 'm26-canary.iberfit.cl' || configuredCanary;";
const replacement = [
  "  const projectPreview = /^[a-z0-9-]+\\.iberfit-m26-canary\\.pages\\.dev$/u.test(host);",
  "  const canary = host === 'm26-canary.iberfit.cl' || configuredCanary || projectPreview;",
].join('\n');

if (!fs.existsSync(transportPath)) {
  throw new Error(`RC40_PAGES_PREVIEW_TRANSPORT_MISSING:${transportPath}`);
}

let source = fs.readFileSync(transportPath, 'utf8').replace(/\r\n?/gu, '\n');
const first = source.indexOf(needle);
if (first < 0) throw new Error('RC40_PAGES_PREVIEW_ANCHOR_MISSING');
if (source.indexOf(needle, first + needle.length) >= 0) {
  throw new Error('RC40_PAGES_PREVIEW_ANCHOR_DUPLICATE');
}

source = source.slice(0, first) + replacement + source.slice(first + needle.length);

const escapedCanaryProjectSuffix = CANARY_PROJECT_SUFFIX.replaceAll('.', '\\.');
if (!source.includes(escapedCanaryProjectSuffix)) {
  throw new Error('RC40_PAGES_PREVIEW_SUFFIX_MISSING');
}
if (source.includes(PRODUCTION_REF)) {
  throw new Error('RC40_PAGES_PREVIEW_PRODUCTION_REF_FORBIDDEN');
}

fs.writeFileSync(transportPath, source, 'utf8');

console.log(JSON.stringify({
  ok: true,
  release: 'IBERFIT_M26_CANARY_RC40_ADMIN_COMPLETE',
  pagesPreviewSuffix: CANARY_PROJECT_SUFFIX,
  transportPath: path.relative(root, transportPath).replaceAll(path.sep, '/'),
  productionModified: false,
  productionDeployed: false,
}, null, 2));
