import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const legacy = new URL('../legacy/m25_official/', import.meta.url);
const baseline = new URL('../baseline_m25_2/', import.meta.url);
const failures = [];
const checks = [];
function check(name, ok, detail = '') { checks.push({ name, ok, detail }); if (!ok) failures.push(name); }
async function text(url) { return readFile(url, 'utf8'); }
async function files(dir) {
  const out=[];
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    const p=new URL(entry.name + (entry.isDirectory()?'/':''),dir);
    if(entry.isDirectory()) out.push(...await files(p)); else out.push(p);
  }
  return out;
}
const legacyZipHash = '5668226f69e4655ac0806ba1db8df1af10ced65f9a8c52d943d4ad4dcc2fa190';
const sourceZipCandidates = [
  new URL('../recovery/artifacts/IBERFIT_M25_CLOUDFLARE_PRODUCTION_OFFICIAL.zip', import.meta.url),
  new URL('../../IBERFIT_M25_CLOUDFLARE_PRODUCTION(1).zip', import.meta.url)
];
let sourceZipResult = null;
for (const candidate of sourceZipCandidates) {
  try {
    const digest=createHash('sha256').update(await readFile(candidate)).digest('hex');
    sourceZipResult = { digest, candidate: candidate.pathname };
    break;
  } catch {}
}
if (sourceZipResult) {
  check('M25 físico coincide con el artefacto oficial', sourceZipResult.digest===legacyZipHash, `${sourceZipResult.digest} @ ${sourceZipResult.candidate}`);
} else {
  check('M25 físico coincide con el artefacto oficial', false, 'artefacto oficial no encontrado dentro ni junto al paquete');
}
const catalog=JSON.parse(await text(new URL('exercise-catalog-m25.json',legacy)));
check('Catálogo canónico preserva 367 ejercicios', Array.isArray(catalog)&&catalog.length===367, String(catalog.length));
const version=JSON.parse(await text(new URL('version.json',baseline)));
check('Baseline queda explícitamente no desplegable', version.deployable===false, JSON.stringify(version));
const app=await text(new URL('src/app.js',baseline));
const iri=await text(new URL('src/iri.js',baseline));
check('M25.2 sincroniza derivados antes de persistir', app.includes('synchronizeIriDerivedFields(before)'), 'save-iri-draft');
check('Puntuación/calidad/clasificación se calculan en vivo', app.includes('Puntuación vigente')&&app.includes('automaticClassification'), 'live-reading');
check('Contrato de sincronización IRI exportado', iri.includes('export function synchronizeIriDerivedFields'), 'iri.js');
check('M25 oficial permanece congelado como referencia', (await text(new URL('version.json',legacy))).includes('"M25"'), 'legacy/version.json');
const jsFiles=(await files(baseline)).filter((url)=>url.pathname.endsWith('.js'));
check('Baseline contiene los 45 JavaScript esperados', jsFiles.length===45, String(jsFiles.length));
const report={generatedAt:new Date().toISOString(),pass:failures.length===0,total:checks.length,passed:checks.filter(x=>x.ok).length,failed:failures,checks};
console.log(JSON.stringify(report,null,2));
if(failures.length) process.exitCode=1;
