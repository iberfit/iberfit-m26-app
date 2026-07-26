import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (name, ok, details = '') =>
  checks.push({ name, ok: Boolean(ok), details });

const branch = execFileSync('git', ['branch', '--show-current'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const pkg = JSON.parse(read('package.json'));
const selectors = read('src/m26/modules/domain-selectors.js');
const renderer = read('src/m26/modules/route-render.js');
const shellRenderer = read('src/m26/shell/shell-render.js');
const viewModel = read('src/m26/modules/route-view-model.js');
const profile = read('src/m26/domain/client-profile.js');
const projection = read('src/m26/security/role-projection.js');
const iriWorkflow = read('src/m26/workflows/iri-workflow.js');
const wearableContracts = read('src/m26/wearables/contracts.js');
const wearablePolicy = read('src/m26/wearables/free-policy.js');
const build = read('scripts/build_rc29_prepublication_candidate.mjs');
const runtimeGenerator = read('scripts/generate_rc32_runtime_config.mjs');
const runtime = read('public/m26/runtime-config.js');
const serviceWorker = read('public/m26/sw.js');
const css = read('src/m26/shell/shell.css');
const remoteGate = read(
  'scripts/remote-gates/run_authenticated_readonly_gate.mjs',
);

check('Rama canary/rc32', branch === 'canary/rc32', branch);
check(
  'Validador RC32 registrado',
  pkg.scripts['validate:rc32:ci'] ===
    'node scripts/run_rc32_ci_validation.mjs',
);
check(
  'Build RC32 registrado',
  pkg.scripts['build:rc32:canary'] ===
    'npm run build:rc29 && npm run configure:rc32:canary',
);
check(
  'Runtime RC32 registrado',
  pkg.scripts['configure:rc32:canary'] ===
    'node scripts/generate_rc32_runtime_config.mjs',
);
check(
  'Verificador RC32 registrado',
  pkg.scripts['verify:build:rc32'] ===
    'node scripts/verify_rc32_canary_candidate.mjs',
);
check(
  'Agenda separa propuestas y confirmadas',
  /confirmedOnly/.test(selectors) &&
    /proposalOnly/.test(selectors) &&
    /proposals/.test(selectors) &&
    /appointments/.test(selectors),
);
check(
  'Hoy no presenta propuestas como confirmadas',
  /Propuestas por revisar/.test(renderer) &&
    /Sesiones confirmadas/.test(renderer) &&
    !/Agenda confirmada/.test(renderer),
);
check(
  'Estado superior no afirma Todo confirmado',
  /Sin operaciones pendientes/.test(shellRenderer) &&
    !/Todo confirmado/.test(shellRenderer),
);
check(
  'Resumen IRI por dominios',
  /coverageCount/.test(viewModel) &&
    /coverageLabel/.test(viewModel) &&
    /dominios registrados/.test(viewModel),
);
check(
  'Interfaz activa sin puntuación global IRI',
  !/IRI 80/.test(renderer) &&
    !/Performance/.test(renderer) &&
    !/score global/iu.test(renderer),
);
check(
  'Perfil canónico incluye baremo y contacto',
  /sexForNorms/.test(profile) &&
    /email/.test(profile) &&
    /phone/.test(profile) &&
    /trainingAddress/.test(profile) &&
    /preferredContactChannel/.test(profile),
);
check(
  'Dirección requerida según modalidad',
  /logisticsRequired/.test(profile) &&
    /presencial/.test(profile) &&
    /hibrido/.test(profile),
);
check(
  'Proyección mantiene privacidad',
  /email/.test(projection) &&
    /phone/.test(projection) &&
    /trainingAddress/.test(projection) &&
    /privateNotes/.test(projection),
);
check(
  'IRI conserva snapshot de baremo',
  /normContextSnapshot/.test(iriWorkflow) &&
    /normEngineVersion/.test(iriWorkflow) &&
    /sexForNorms/.test(iriWorkflow) &&
    /ageYears/.test(iriWorkflow),
);
check(
  'Samsung Health preparado sin falsa conexión',
  /samsung_health/.test(wearableContracts) &&
    /Health Connect/.test(wearableContracts) &&
    /productionAllowed:\s*false/.test(wearablePolicy),
);
check(
  'Strava preparado con OAuth de servidor',
  /strava/.test(wearableContracts) &&
    /server_oauth/.test(wearableContracts) &&
    /M26_STRAVA_SERVER_OAUTH_REQUIRED/.test(wearablePolicy),
);
check(
  'Build y runtime empaquetan solo activos RepDB necesarios',
  /copy\(MEDIA_MAP_PATH,\s*MEDIA_MAP_PATH\)/u.test(build) &&
    /public\/vendor\/repdb\/images\/flat/u.test(build) &&
    !/copy\('public\/vendor\/repdb',\s*'public\/vendor\/repdb'\)/u.test(
      build,
    ) &&
    [build, runtimeGenerator].every(
      (source) =>
        /unexpectedRepdbFiles/.test(source) &&
        /mediaMapBytes/.test(source) &&
        /repdbPackaged/.test(source) &&
        /MEDIA_TOTAL_LIMIT/.test(source),
    ),
);
check(
  'Rutas RepDB conservan contrato público desplegado',
  /\/public\/vendor\/repdb\//.test(serviceWorker) &&
    /REPDB_MEDIA_MAP_URL='\/public\/vendor\/repdb\//.test(
      read('src/m26/library/exercise-media.js'),
    ),
);
check(
  'CSS previene desbordes y solapamientos',
  /min-width:\s*0/.test(css) &&
    /overflow-wrap:\s*anywhere/.test(css) &&
    /max-width:\s*100%/.test(css),
);
check(
  'Runtime del repositorio permanece fail-closed',
  /enabled:\s*false/.test(runtime) &&
    /publishableKey:\s*''/.test(runtime) &&
    /qaOnly:\s*true/.test(runtime),
);
check(
  'Evidencia remota usa huellas y no muta',
  /userFingerprint/.test(remoteGate) &&
    /clientFingerprint/.test(remoteGate) &&
    /mutationsPerformed/.test(remoteGate),
);
check(
  'Documentación RC32 presente',
  fs.existsSync(path.join(root, 'docs', 'RC32_PRODUCT_HARDENING.md')),
);

const securityRoots = ['src', 'public', 'scripts', 'backend', '.github'];
const forbiddenServiceRole = [];
function scanServiceRole(target) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolute)) {
      scanServiceRole(path.join(target, entry));
    }
    return;
  }
  const extension = path.extname(absolute).toLowerCase();
  if (!['.js', '.mjs', '.yml', '.yaml', '.json', '.sql'].includes(extension)) {
    return;
  }
  const source = fs.readFileSync(absolute, 'utf8');
  if (/service[_-]?role/iu.test(source)) {
    const allowed =
      target.includes('test') ||
      target.includes('gate') ||
      target.includes('runtime_config') ||
      target.includes('runtime-config');
    if (!allowed) forbiddenServiceRole.push(target.replaceAll(path.sep, '/'));
  }
}
for (const target of securityRoots) scanServiceRole(target);
check(
  'Sin credenciales service_role incorporadas',
  forbiddenServiceRole.length === 0,
  forbiddenServiceRole.join(', '),
);

const visibleRoots = ['src', 'public', 'docs', 'README.md', 'CONTRIBUTING.md'];
const textExtensions = new Set([
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.md',
  '.webmanifest',
]);
const mojibake = [];
const mojibakePattern = /\u00c3|\u00c2|\u00e2\u20ac|\u00ef\u00bf\u00bd|\ufffd/u;
function scanVisible(target) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolute)) {
      scanVisible(path.join(target, entry));
    }
    return;
  }
  if (
    !textExtensions.has(path.extname(absolute)) &&
    !['README.md', 'CONTRIBUTING.md'].includes(path.basename(absolute))
  ) {
    return;
  }
  if (mojibakePattern.test(fs.readFileSync(absolute, 'utf8'))) {
    mojibake.push(target.replaceAll(path.sep, '/'));
  }
}
for (const target of visibleRoots) scanVisible(target);
check('Interfaz sin mojibake', mojibake.length === 0, mojibake.join(', '));

const failed = checks.filter((item) => !item.ok);
const report = {
  release: 'IBERFIT_M26_CANARY_RC32',
  version: '26.0.0-canary.32',
  generatedAt: new Date().toISOString(),
  branch,
  inheritedSecurityBaseline: 'RC31 / backend RC30',
  passed: checks.length - failed.length,
  total: checks.length,
  failed: failed.length,
  checks,
  ok: failed.length === 0,
  productionModified: false,
  productionDeployed: false,
  remoteIsolationExecuted: false,
};

fs.mkdirSync(path.join(root, 'recovery'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'recovery', 'RC32_CANARY_GATE_REPORT.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
