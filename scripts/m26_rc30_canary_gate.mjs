import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (name, ok, details = '') => checks.push({
  name,
  ok: Boolean(ok),
  details,
});

const branch = execFileSync('git', ['branch', '--show-current'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const pkg = JSON.parse(read('package.json'));
const recovery = read('src/m26/app/password-recovery.js');
const application = read('src/m26/app/application.js');
const transport = read('src/m26/supabase-transport.js');
const access = read('src/m26/app/access-ui.js');
const serviceWorker = read('public/m26/sw.js');
const headers = read('public/m26/_headers');
const runtime = read('public/m26/runtime-config.js');
const remoteGate = read('scripts/remote-gates/run_authenticated_readonly_gate.mjs');

check('Rama canary/rc30', branch === 'canary/rc30', branch);
check('Prueba RC30 registrada', pkg.scripts['test:m26:rc30'] === 'node --test tests/m26_rc30_password_recovery.test.mjs');
check('Build RC30 canary registrado', pkg.scripts['build:rc30:canary'] === 'npm run build:rc29 && npm run configure:rc29:canary');
check('Token se limpia antes de conservarse', application.indexOf('historyLike.replaceState(') >= 0 && application.indexOf('historyLike.replaceState(') < application.indexOf('recoverySession = recovery.session'));
check('Fragmento falla cerrado sin History API', /M26_RECOVERY_HISTORY_UNAVAILABLE/.test(application) && /fragmentCleared/.test(application));
check('Refresh token no entra al estado de recuperación', !/refreshToken/.test(recovery));
check('Recuperación valida caducidad', /expires_at/.test(recovery) && /expires_in/.test(recovery) && /MAX_RECOVERY_LIFETIME_SECONDS/.test(recovery));
check('Identidad se consulta antes del PUT', transport.indexOf("method: 'GET'") >= 0 && transport.indexOf("method: 'GET'") < transport.indexOf("method: 'PUT'"));
check('Cuenta QA se valida antes de mutar', transport.indexOf('const currentUser = validateRecoveryUser') >= 0 && transport.indexOf('const currentUser = validateRecoveryUser') < transport.indexOf("method: 'PUT'"));
check('Redirección exclusiva canary', transport.includes("redirect.origin !== 'https://m26-canary.iberfit.cl'"));
check('Runtime QA exclusivo canary', /qaOnly \? canary : exactRemote/.test(transport));
check('Respuesta de solicitud genérica', /Si el correo corresponde a una cuenta QA autorizada/.test(application) && !/correo (?:existe|no existe)/i.test(application));
check('Revocación posterior a actualización', application.indexOf('await transport.logout(recoveryToken)') > application.indexOf('await transport.updatePassword'));
check('Formulario accesible', /aria-labelledby="m26-auth-title"/.test(access) && /role="\$\{noticeKind === 'error' \? 'alert' : 'status'\}"/.test(access) && /data-auth-action="back-to-login"/.test(access));
check('Auth y API nunca entran en caché', serviceWorker.includes("'/auth/v1/'") && serviceWorker.includes("'/rest/v1/'") && /request\.method!==['"]GET['"]/.test(serviceWorker));
check('CSP sin script ni estilo inline', /script-src 'self'/.test(headers) && /style-src 'self'/.test(headers) && !/style-src[^\r\n]*unsafe-inline/.test(headers));
check('Runtime de repositorio fail-closed', /enabled:\s*false/.test(runtime) && /publishableKey:\s*''/.test(runtime) && /qaOnly:\s*true/.test(runtime));
check('Evidencia remota usa huellas', /userFingerprint/.test(remoteGate) && /clientFingerprint/.test(remoteGate) && !/roles\.push\(\{name:session\.name,userId/.test(remoteGate));
check('Documentación y checklist RC30', fs.existsSync(path.join(root, 'docs', 'RC30_CANARY_QA.md')));

const visibleRoots = ['src', 'public', 'docs', 'README.md', 'CONTRIBUTING.md'];
const textExtensions = new Set(['.js', '.mjs', '.css', '.html', '.md', '.webmanifest']);
const mojibake = [];
const mojibakePattern = /\u00c3|\u00c2|\u00e2\u20ac|\u00ef\u00bf\u00bd|\ufffd/;

function scanVisible(target) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolute)) scanVisible(path.join(target, entry));
    return;
  }
  if (!textExtensions.has(path.extname(absolute)) && !['README.md', 'CONTRIBUTING.md'].includes(path.basename(absolute))) return;
  if (mojibakePattern.test(fs.readFileSync(absolute, 'utf8'))) mojibake.push(target.replaceAll(path.sep, '/'));
}

for (const target of visibleRoots) scanVisible(target);
check('Interfaz sin mojibake', mojibake.length === 0, mojibake.join(', '));

const failed = checks.filter((item) => !item.ok);
const report = {
  release: 'IBERFIT_M26_CANARY_RC30',
  version: '26.0.0-canary.30',
  generatedAt: new Date().toISOString(),
  branch,
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
  path.join(root, 'recovery', 'RC30_CANARY_GATE_REPORT.json'),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
