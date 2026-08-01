import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const checks=[];
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const check=(name,ok,detail='')=>checks.push({name,ok:Boolean(ok),detail:String(detail||'')});
let branch=String(process.env.CF_PAGES_BRANCH||'').trim();
if(!branch){try{branch=execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim();}catch{branch='';}}

const pkg=JSON.parse(read('package.json'));
const runtime=read('public/m26/runtime-config.js');
const serviceWorker=read('public/m26/sw.js');
const workflow=read('src/m26/app/workflow-controller.js');
const renderer=read('src/m26/modules/route-render.js');
const css=read('src/m26/shell/shell.css');
const ciWorkflow=read('.github/workflows/ci.yml');

check('Rama RC35 aislada',branch==='canary/rc35'||branch==='canary/rc35-audit-fixes',branch||'sin rama');
check('Versión de infraestructura o canary RC38 declarada',['26.0.0-prepublicacion-infraestructura.29','26.0.0-canary.38-iri-diagnosis-bioimpedance'].includes(pkg.version),pkg.version);
for(const [key,value] of Object.entries({
  'test:m26:rc35':'node --test tests/m26_rc35_audit_closure.test.mjs',
  'audit:rc35':'node scripts/m26_rc35_audit_gate.mjs',
  'gate:rc35':'node scripts/m26_rc35_release_gate.mjs',
  'build:rc35:canary':'npm run build:rc29 && npm run configure:rc35:canary',
  'configure:rc35:canary':'node scripts/generate_rc35_runtime_config.mjs',
  'verify:build:rc35':'node scripts/verify_rc35_canary_candidate.mjs',
  'validate:rc35:ci':'node scripts/run_rc35_ci_validation.mjs',
}))check(`Script ${key}`,pkg.scripts[key]===value,pkg.scripts[key]||'ausente');

for(const file of [
  'tests/m26_rc35_audit_closure.test.mjs',
  'scripts/m26_rc35_audit_gate.mjs',
  'scripts/m26_rc35_release_gate.mjs',
  'scripts/generate_rc35_runtime_config.mjs',
  'scripts/verify_rc35_canary_candidate.mjs',
  'scripts/run_rc35_ci_validation.mjs',
  'docs/RC35_COACH_AUDIT_CLOSURE.md',
])check(`Existe ${file}`,exists(file));

check('Runtime del repositorio permanece cerrado',/enabled:\s*false/.test(runtime)&&/publishableKey:\s*''/.test(runtime)&&/qaOnly:\s*true/.test(runtime));
check('Service worker base conserva punto de sustitución',/const VERSION='m26-rc28'/.test(serviceWorker)&&/const PREVIOUS_VERSION='m26-rc27'/.test(serviceWorker));
check('Persistencia crítica fail-closed',/M26_IRI_CONFIRM_NOT_PERSISTED/.test(workflow)&&/M26_PLAN_CONFIRM_NOT_PERSISTED/.test(workflow));
check('Interfaz no contiene score global',!/Performance|80\/100|Puntuación 80/.test(renderer));
check('Un único scroll y controles responsivos',/\.m26-main \{ min-height: 0; overflow: visible;/.test(css)&&/m26-client-controls/.test(css)&&/m26-optional-section/.test(css));
check('CI enruta RC35 sin caer en RC29',/Validar RC35 canary/.test(ciWorkflow)&&/npm run validate:rc35:ci/.test(ciWorkflow)&&/github\.ref != 'refs\/heads\/canary\/rc35'/.test(ciWorkflow)&&/rc35-evidencia-validacion/.test(ciWorkflow));
check('Documentación mantiene QA2 y Cliente como gates pendientes',exists('docs/RC35_COACH_AUDIT_CLOSURE.md')&&/Cliente QA 2/.test(read('docs/RC35_COACH_AUDIT_CLOSURE.md'))&&/aplicación Cliente/.test(read('docs/RC35_COACH_AUDIT_CLOSURE.md')));
check('Sin despliegue de producción declarado',!/https?:\/\/(?:www\.)?iberfit\.cl(?:\/|$)|https?:\/\/(?:app|coach)\.iberfit\.cl/.test(read('docs/RC35_COACH_AUDIT_CLOSURE.md')));

const failed=checks.filter((item)=>!item.ok);
const report={
  release:'IBERFIT_M26_CANARY_RC35',version:'26.0.0-canary.35',generatedAt:new Date().toISOString(),
  branch,sourceBranch:'canary/rc34',sourceCommit:'7691b9a85ec6de374834e9c8da48cf0e01163530',backendContract:'RC30',
  passed:checks.length-failed.length,total:checks.length,failed:failed.length,checks,ok:failed.length===0,
  productionModified:false,productionDeployed:false,cloudflareModified:false,
};
fs.mkdirSync(path.join(root,'recovery'),{recursive:true});
fs.writeFileSync(path.join(root,'recovery','RC35_RELEASE_GATE_REPORT.json'),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
if(!report.ok)process.exit(1);
