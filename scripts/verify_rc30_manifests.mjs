import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function verify(manifestPath, base) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
  const failures = [];
  for (const entry of manifest.entries) {
    const file = path.join(root, base, entry.path);
    if (!fs.existsSync(file)) {
      failures.push({ path: entry.path, reason: 'missing' });
      continue;
    }
    const size = fs.statSync(file).size;
    const digest = sha256(file);
    if (size !== entry.size || digest !== entry.sha256) failures.push({ path: entry.path, reason: 'mismatch' });
  }
  return {
    manifestPath,
    expected: manifest.count,
    verified: manifest.entries.length - failures.length,
    failures,
    ok: failures.length === 0 && manifest.count === manifest.entries.length,
  };
}

const full = verify('recovery/RC30_SHA256_MANIFEST.json', '');
const web = verify('recovery/RC30_WEB_SHA256_MANIFEST.json', 'dist/m26-prepublicacion-infraestructura-candidate');
const report = {
  release: 'IBERFIT_M26_CANARY_RC30',
  version: '26.0.0-canary.30',
  generatedAt: new Date().toISOString(),
  full,
  web,
  ok: full.ok && web.ok,
  productionModified: false,
  productionDeployed: false,
};
fs.writeFileSync(path.join(root, 'recovery', 'RC30_MANIFEST_VERIFICATION.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${full.ok ? 'PASS' : 'FAIL'} full ${full.verified}/${full.expected}`);
console.log(`${web.ok ? 'PASS' : 'FAIL'} web ${web.verified}/${web.expected}`);
if (!report.ok) process.exit(1);
