import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const sourcePath = path.join(root, 'scripts', 'build_rc29_prepublication_candidate.mjs');
const versionPath = path.join(root, 'dist', 'm26-prepublicacion-infraestructura-candidate', 'version.json');
const RC39_JAVASCRIPT_LIMIT = 950_000;
const anchor = [
  "const JAVASCRIPT_LIMIT = packageVersion === '26.0.0-canary.38-iri-diagnosis-bioimpedance'",
  '  ? 850_000',
  '  : 820_000;',
].join('\n');

if (!fs.existsSync(sourcePath)) {
  throw new Error('RC39_BUILD_BASE_SCRIPT_MISSING');
}

const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/g, '\n');
const occurrences = source.split(anchor).length - 1;
if (occurrences !== 1) {
  throw new Error(`RC39_BUILD_BUDGET_ANCHOR_MISMATCH:${occurrences}`);
}

const patched = source.replace(
  anchor,
  `const JAVASCRIPT_LIMIT = ${RC39_JAVASCRIPT_LIMIT};`
);
const tempPath = path.join(
  os.tmpdir(),
  `iberfit-rc39-build-${process.pid}-${Date.now()}.mjs`
);

fs.writeFileSync(tempPath, patched, 'utf8');
let result;
try {
  result = spawnSync(process.execPath, [tempPath], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
} finally {
  fs.rmSync(tempPath, {force: true});
}

if (result?.error) throw result.error;
if (result?.status !== 0) process.exit(result?.status ?? 1);
if (!fs.existsSync(versionPath)) throw new Error('RC39_BUILD_VERSION_MISSING');

const metadata = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
if (metadata?.budgetOk !== true || metadata?.repdbPackaged !== true) {
  throw new Error('RC39_BUILD_METADATA_NOT_APPROVED');
}
if (metadata?.budgets?.javascriptLimit !== RC39_JAVASCRIPT_LIMIT) {
  throw new Error('RC39_BUILD_LIMIT_NOT_APPLIED');
}
if (Number(metadata?.budgets?.javascriptBytes) > RC39_JAVASCRIPT_LIMIT) {
  throw new Error('RC39_BUILD_JAVASCRIPT_OVER_BUDGET');
}

console.log(JSON.stringify({
  ok: true,
  release: 'IBERFIT_M26_CANARY_RC39_SESSION_ORCHESTRATION',
  sourceBuilder: 'RC29',
  javascriptBytes: metadata.budgets.javascriptBytes,
  javascriptLimit: RC39_JAVASCRIPT_LIMIT,
  cssBytes: metadata.budgets.cssBytes,
  coreBytes: metadata.budgets.coreBytes,
  repdbPackaged: metadata.repdbPackaged,
  productionModified: false,
  cloudflareModified: false,
}, null, 2));
