import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const controller = read('src/m26/workflows/iri-external-report-controller.js');
const application = read('src/m26/app/application.js');
const routes = read('src/m26/modules/route-render.js');
const css = read('src/m26/workflows/iri-external-report.css');
const generator = read('scripts/generate_rc35_runtime_config.mjs');
const verifier = read('scripts/verify_rc35_canary_candidate.mjs');
const ci = read('.github/workflows/ci.yml');

const preflightIndex = application.indexOf('clientOnboardingPreflight(currentToken())');
const createClientIndex = application.indexOf('transport.createClientDraft(currentToken(),payload)');
const checks = [
  ['Preflight v12.3.x preservado antes de crear cliente', preflightIndex >= 0 && createClientIndex > preflightIndex],
  ['Carga limitada a PDF, JPEG y PNG', /IRI_EXTERNAL_REPORT_MIME_TYPES[\s\S]*application\/pdf[\s\S]*image\/jpeg[\s\S]*image\/png/.test(controller) && !/IRI_EXTERNAL_REPORT_MIME_TYPES[\s\S]{0,180}image\/webp/.test(controller)],
  ['Límite exacto de 50 MB', /IRI_EXTERNAL_REPORT_MAX_BYTES = 50_000_000/.test(controller)],
  ['Ruta privada canónica por cliente y evaluación', /return `\$\{client\}\/\$\{assessment\}\/bioimpedancia`/.test(controller)],
  ['RPC v12 de registro activo', /iberfit_register_iri_external_report_v12/.test(controller)],
  ['Lectura mediante URL firmada privada', /\/storage\/v1\/object\/sign\//.test(controller) && /expiresIn: 300/.test(controller)],
  ['Timeout largo solo para Storage', /IRI_EXTERNAL_REPORT_UPLOAD_TIMEOUT_MS = 180_000/.test(controller) && /timeoutMs: config\.uploadTimeoutMs/.test(controller)],
  ['REST y RPC conservan timeout estándar', /timeoutMs = config\.timeoutMs/.test(controller) && /Math\.min\(Number\(runtime\.timeoutMs/.test(controller)],
  ['Subidas concurrentes bloqueadas por evaluación', /if \(entry\.busy\) return;[\s\S]*validateIriExternalReportFile\(file\)/.test(controller)],
  ['Coach y Admin gestionan; Cliente solo consulta', /\['admin', 'coach'\]\.includes\(role\)/.test(controller) && /data-iri-external-report-host/.test(routes)],
  ['Selector rechaza WEBP en la interfaz', /accept="application\/pdf,image\/png,image\/jpeg"/.test(routes) && !/accept="[^"]*image\/webp/.test(routes)],
  ['Regla v12.3.x de dos dominios preservada', /al menos dos dominios objetivos completos/.test(routes)],
  ['Estados responsive y accesibles incluidos', /aria-live="polite"/.test(controller) && /@media \(max-width: 700px\)/.test(css)],
  ['Metadata RC37 canary exacta', /26\.0\.0-canary\.37-iri-external-report/.test(generator) && /IBERFIT_M26_CANARY_RC37_IRI_EXTERNAL_REPORT/.test(generator) && /canary\/rc37/.test(generator)],
  ['Caché RC37 renueva desde RC36', /m26-rc37-iri-external-report-canary-v2/.test(generator) && /m26-rc36-canary-v10/.test(generator)],
  ['Verificador de build reconoce RC37', /EXPECTED_RC37/.test(verifier) && /iri-upload-timeout/.test(verifier)],
  ['CI enruta y conserva evidencia RC37', /Validar RC37 canary/.test(ci) && /rc37-evidencia-validacion/.test(ci)],
];

const output = {
  release: 'IBERFIT_M26_CANARY_RC37_IRI_EXTERNAL_REPORT',
  version: '26.0.0-canary.37-iri-external-report',
  generatedAt: new Date().toISOString(),
  checks: checks.map(([name, ok]) => ({ name, ok })),
  ok: checks.every(([, ok]) => ok),
  productionModified: false,
  productionDeployed: false,
  cloudflareModified: false,
};
fs.mkdirSync(path.join(root, 'recovery'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'recovery', 'RC37_RELEASE_GATE.json'),
  `${JSON.stringify(output, null, 2)}\n`,
);
console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exit(1);
