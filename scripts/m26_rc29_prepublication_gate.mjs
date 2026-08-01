import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, ok, details = '') => checks.push({ name, ok: Boolean(ok), details });
const pkg = JSON.parse(read('package.json'));
const readme = read('README.md');
const contrib = read('CONTRIBUTING.md');
const ci = read('.github/workflows/ci.yml');
const remoteWorkflow = read('.github/workflows/remote-gates.yml');
const remoteGate = read('scripts/remote-gates/run_authenticated_readonly_gate.mjs');
const sql = read('backend/RC29_PREFLIGHT_SUPABASE_READONLY.sql');
const roleSql = read('backend/RC25_ROLE_SEPARATION_PREFLIGHT_READONLY.sql');
const toml = read('cloudflare/wrangler.toml.example');
const cloudflare = read('cloudflare/README.md');
const runtime = read('public/m26/runtime-config.js');
const generator = read('scripts/generate_rc29_runtime_config.mjs');
const docs = read('docs/RC29_PREPUBLICACION_INFRAESTRUCTURA.md');

check(
  'Version RC29 o release canary heredera',
  [
    '26.0.0-prepublicacion-infraestructura.29',
    '26.0.0-canary.38-iri-diagnosis-bioimpedance',
  ].includes(pkg.version),
);
check('Gate por defecto RC29', pkg.scripts.gate === 'npm run validate:rc29');
check('README vigente', /RC29 . Prepublicaci.n/u.test(readme) && !/RC18 Prelaunch/u.test(readme));
check('Contribucion vigente', /validate:rc29/u.test(contrib));
check('CI RC29', /validate:rc29/u.test(ci));
check('CI sin cache npm sin lock', !/cache:\s*npm/u.test(ci));
check('CI sin despliegue', !/wrangler|pages deploy/iu.test(ci));
check('Workflow con dos clientes', /M26_QA_CLIENT_A_EMAIL/u.test(remoteWorkflow) && /M26_QA_CLIENT_B_EMAIL/u.test(remoteWorkflow));
check('Gate usa catalogo 52', /M26_EXTENDED_COMMAND_REGISTRY/u.test(remoteGate) && /length!==52/u.test(remoteGate));
check('Comparacion estricta', /strict:true/u.test(remoteGate));
check('Gate solo lectura', /mutationsPerformed:false/u.test(remoteGate) && !/method:'(?:PUT|PATCH|DELETE)'/u.test(remoteGate));
check('Inspeccion privacidad Cliente', /inspectClientBootstrap/u.test(remoteGate) && /foreignClientIds/u.test(remoteGate));
check('Clientes QA distintos', /RC29_QA_CLIENTS_NOT_DISTINCT/u.test(remoteGate));
check('SQL read only', /begin transaction read only/iu.test(sql) && !/\b(insert|update|delete|alter|create|drop|truncate)\b/iu.test(sql));
check('RPC canonicos SQL', /iberfit_bootstrap_v26/u.test(sql) && /iberfit_command_preflight_v26/u.test(sql) && /iberfit_execute_command_v26/u.test(sql));
check('RC25 corregido', !/m26_bootstrap_v26|m26_execute_command_v26|m26_preflight_command_v26/u.test(roleSql));
check('Cloudflare candidato RC29', /m26-prepublicacion-infraestructura-candidate/u.test(toml) && /M26_RELEASE = "RC29"/u.test(toml));
check('Canario exclusivo', /m26-canary\.iberfit\.cl/u.test(cloudflare));
check('Runtime desactivado', /enabled:\s*false/u.test(runtime) && /publishableKey:\s*''/u.test(runtime));
check('Generador exige QA', /RC29_RUNTIME_QA_ONLY_REQUIRED/u.test(generator));
check('Generador rechaza service role', /RC29_RUNTIME_SERVICE_ROLE_FORBIDDEN/u.test(generator));
check('Repositorio privado documentado', /privado y vac.o/u.test(docs) && /iberfit-app-m26/u.test(docs));
check('Cero dependencias runtime', Object.keys(pkg.dependencies || {}).length === 0);
check('Cero dependencias desarrollo', Object.keys(pkg.devDependencies || {}).length === 0);

const failed = checks.filter((item) => !item.ok);
const report = {
  release: 'IBERFIT_M26_PREPUBLICACION_INFRA_RC29',
  version: '26.0.0-prepublicacion-infraestructura.29',
  generatedAt: new Date().toISOString(),
  passed: checks.length - failed.length,
  total: checks.length,
  failed: failed.length,
  checks,
  ok: failed.length === 0,
};
fs.mkdirSync(path.join(root, 'recovery'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'recovery', 'RC29_PREPUBLICATION_GATE_REPORT.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
