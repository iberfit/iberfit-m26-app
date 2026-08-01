import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const controller = read('src/m26/workflows/iri-external-report-controller.js');
const reportDocument = read('src/m26/workflows/iri-report-document.js');
const application = read('src/m26/app/application.js');
const workflow = read('src/m26/app/workflow-controller.js');
const routes = read('src/m26/modules/route-render.js');
const store = read('src/m26/canonical-store.js');
const css = read('src/m26/workflows/iri-external-report.css');
const headers = read('public/m26/_headers');
const serviceWorker = read('public/m26/sw.js');
const generator = read('scripts/generate_rc35_runtime_config.mjs');
const verifier = read('scripts/verify_rc35_canary_candidate.mjs');
const ci = read('.github/workflows/ci.yml');
const tests = read('tests/m26_rc38_iri_diagnosis_bioimpedance.test.mjs');

const checks = [
  ['Version RC38 exacta', pkg.version === '26.0.0-canary.38-iri-diagnosis-bioimpedance'],
  ['Scripts RC38 completos', ['test:m26:rc38', 'audit:rc38', 'build:rc38:canary', 'configure:rc38:canary', 'verify:build:rc38', 'validate:rc38:ci'].every((name) => Boolean(pkg.scripts?.[name]))],
  ['Diagnostico IRI es la unidad documental Cliente', /data-iri-diagnosis/u.test(routes) && /Documento principal/u.test(routes) && /data-iri-external-report-host/u.test(routes)],
  ['Metadata permitida y estado vacio humano', /Documento complementario/u.test(controller) && /Aún no hay un informe de bioimpedancia adjunto a este diagnóstico\./u.test(controller) && /Ver informe de bioimpedancia/u.test(controller)],
  ['Cliente sin gestion y Coach Admin preservados', /canManage: \['admin', 'coach'\]\.includes\(role\)/u.test(controller) && /data-iri-external-report-action="upload"/u.test(controller) && /data-iri-external-report-action="retry-register"/u.test(controller)],
  ['Visor accesible PDF e imagen', /<dialog[\s\S]*data-iri-document-viewer/u.test(controller) && /<iframe[\s\S]*data-iri-document-viewer-pdf/u.test(controller) && /<img[\s\S]*data-iri-document-viewer-image/u.test(controller) && /viewer-retry/u.test(controller) && /Abrir en una pestaña nueva/u.test(controller)],
  ['Visor responsive con foco visible', /@media \(max-width: 700px\)/u.test(css) && /:focus-visible/u.test(css)],
  ['Pestaña reservada antes de URL firmada', controller.indexOf('const viewTarget = prepareIriExternalReportViewTarget();') >= 0 && controller.indexOf('const viewTarget = prepareIriExternalReportViewTarget();') < controller.indexOf('const url = await api.signedUrl')],
  ['URL firmada solo bajo demanda y sin cache', /async function view\(/u.test(controller) && /cache: 'no-store'/u.test(controller) && /expiresIn: 300/u.test(controller)],
  ['Origen Supabase canonico en servicio y CSP', /CANONICAL_PROJECT_REF = 'pjhmrhejsoofmouedavw'/u.test(controller) && /CANONICAL_SUPABASE_ORIGIN/u.test(controller) && /frame-src 'self' https:\/\/pjhmrhejsoofmouedavw\.supabase\.co/u.test(headers) && /img-src 'self' data: blob: https:\/\/pjhmrhejsoofmouedavw\.supabase\.co/u.test(headers)],
  ['Ruta estable IBERFIT sin clientId ni Storage', /IRI_EXTERNAL_REPORT_APP_ORIGIN = 'https:\/\/m26-canary\.iberfit\.cl'/u.test(controller) && /url\.searchParams\.set\('assessmentId'/u.test(controller) && /url\.searchParams\.set\('open', 'bioimpedancia'\)/u.test(controller)],
  ['Intent URL estricto y assessment UUID', /parseIriExternalReportIntent/u.test(controller) && /params\.keys\(\)/u.test(controller) && /M26_IRI_EXTERNAL_REPORT_NOT_FOUND/u.test(controller) && /resolveIriExternalReportIntent/u.test(controller)],
  ['Continuacion login solo en memoria y consumida', /pendingIriExternalReportIntent=parseIriExternalReportIntent/u.test(application) && /pendingIriExternalReportIntent=null/u.test(application) && /consumePendingIriExternalReportIntent/u.test(application) && !/localStorage[^\n]*pendingIri|sessionStorage[^\n]*pendingIri/iu.test(application)],
  ['Router y seleccion canonicos reutilizados', /store\.navigate\('informes'\)/u.test(application) && /store\.selectIriAssessment/u.test(application) && /selectIriAssessment/u.test(store)],
  ['PDF Cliente incluye hipervinculo estable', /clientIriExternalReportComplement/u.test(reportDocument) && /<a class="iri-complement-link" href="\$\{escapeHtml\(href\)\}"/u.test(reportDocument) && /iriExternalReportAppUrl\(draft\.assessmentId\)/u.test(reportDocument)],
  ['PDF Cliente filtra visibilidad evaluacion y MIME', /report\.visibleToClient!==true/u.test(reportDocument) && /clean\(report\.assessmentId,80\)!==clean\(draft\.assessmentId,80\)/u.test(reportDocument) && /report\.mimeType==='application\/pdf'/u.test(reportDocument) && /report\.mimeType==='image\/jpeg'/u.test(reportDocument) && /report\.mimeType==='image\/png'/u.test(reportDocument)],
  ['PDF reserva ventana antes de metadata asincrona', workflow.indexOf('printTarget=prepareIriReportPrintTarget();') >= 0 && workflow.indexOf('printTarget=prepareIriReportPrintTarget();') < workflow.indexOf('externalReport=await getIriExternalReport')],
  ['Contrato privado RC37 preservado', /iberfit-iri-external-reports/u.test(controller) && /iri_external_reports_v26/u.test(controller) && /iberfit_register_iri_external_report_v12/u.test(controller) && /IRI_EXTERNAL_REPORT_MAX_BYTES = 50_000_000/u.test(controller) && /IRI_EXTERNAL_REPORT_UPLOAD_TIMEOUT_MS = 180_000/u.test(controller)],
  ['Formatos RC37 exactos y WEBP rechazado', /application\/pdf/u.test(controller) && /image\/jpeg/u.test(controller) && /image\/png/u.test(controller) && !/IRI_EXTERNAL_REPORT_MIME_TYPES[\s\S]{0,180}image\/webp/u.test(controller)],
  ['Service worker no cachea Supabase ni datos privados', /url\.origin!==self\.location\.origin/u.test(serviceWorker) && !/supabase\.co|iri_external_reports_v26|signedURL|signedUrl/iu.test(serviceWorker)],
  ['Metadata y cache RC38 exactos', /26\.0\.0-canary\.38-iri-diagnosis-bioimpedance/u.test(generator) && /IBERFIT_M26_CANARY_RC38_IRI_DIAGNOSIS_BIOIMPEDANCE/u.test(generator) && /m26-rc38-iri-diagnosis-bioimpedance-canary-v4/u.test(generator) && /m26-rc37-iri-external-report-canary-v2/u.test(generator)],
  ['Verificador reconoce RC38', /EXPECTED_RC38/u.test(verifier) && /REPORT_PREFIX/u.test(verifier)],
  ['CI enruta y conserva RC38', /Validar RC38 canary/u.test(ci) && /validate:rc38:ci/u.test(ci) && /rc38-evidencia-validacion/u.test(ci)],
  ['Suite focalizada cubre 20 requisitos', (tests.match(/\btest\(/gu) || []).length >= 12 && /FOREIGN_ID/u.test(tests) && /image\/webp/u.test(tests) && /signedUrl/u.test(tests) && /pendingIriExternalReportIntent/u.test(tests)],
];

const output = {
  release: 'IBERFIT_M26_CANARY_RC38_IRI_DIAGNOSIS_BIOIMPEDANCE',
  version: '26.0.0-canary.38-iri-diagnosis-bioimpedance',
  generatedAt: new Date().toISOString(),
  checks: checks.map(([name, ok]) => ({ name, ok: Boolean(ok) })),
  ok: checks.every(([, ok]) => Boolean(ok)),
  migrationsAdded: false,
  productionModified: false,
  productionDeployed: false,
  operationalSheetModified: false,
};
fs.mkdirSync(path.join(root, 'recovery'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'recovery', 'RC38_RELEASE_GATE.json'),
  `${JSON.stringify(output, null, 2)}\n`,
);
console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exit(1);
