import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const reportPath=path.join(root,'recovery','RC36_CI_VALIDATION_REPORT.json');
const steps=[];
let testOutput='';
let stopped=false;
function run(name,args,timeoutMs=300_000,envExtra={}){
  if(stopped)return;
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,...envExtra},timeout:timeoutMs,maxBuffer:128*1024*1024});
  const stdout=result.stdout||'',stderr=result.stderr||'',timedOut=result.error?.code==='ETIMEDOUT';
  process.stdout.write(stdout);process.stderr.write(stderr);
  steps.push({name,command:['node',...args].join(' '),status:result.status,signal:result.signal,timedOut,ok:result.status===0&&!timedOut});
  if(name==='tests')testOutput=stdout;
  if(result.status!==0||timedOut)stopped=true;
}
function metric(name){for(const pattern of [new RegExp(`^# ${name}\\s+(\\d+)$`,'mu'),new RegExp(`^ℹ ${name}\\s+(\\d+)$`,'mu')]){const match=testOutput.match(pattern);if(match)return Number(match[1]);}return 0;}
run('repository-hygiene',['scripts/remote-gates/check_repository_hygiene.mjs']);
const testFiles=fs.readdirSync(path.join(root,'tests')).filter((name)=>name.endsWith('.test.mjs')).sort().map((name)=>`tests/${name}`);
run('tests',['--test',...testFiles]);
run('rc29-infrastructure-gate',['scripts/m26_rc29_prepublication_gate.mjs']);
run('rc35-audit-gate',['scripts/m26_rc35_audit_gate.mjs']);
run('rc35-release-gate',['scripts/m26_rc35_release_gate.mjs'],300_000,{CF_PAGES_BRANCH:'canary/rc35'});
run('rc36-product-gate',['scripts/m26_rc36_product_gate.mjs']);
run('build-current-source-with-repdb',['scripts/build_rc29_prepublication_candidate.mjs']);
run('module-graph',['scripts/verify_rc29_module_graph.mjs']);
const tests={total:metric('tests'),passed:metric('pass'),failed:metric('fail'),skipped:metric('skipped')};
let sourceRevision=null;try{sourceRevision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout?.trim()||null;}catch{}
const report={release:'IBERFIT_M26_CANARY_RC36_CI',version:'26.0.0-canary.36-premium-product-ci',generatedAt:new Date().toISOString(),sourceRevision,sourceBranch:'canary/rc35',sourceCommit:'13e2c42d368998e71953f47317b1f61364f8f85e',backendContract:'RC30',ok:!stopped&&steps.every((step)=>step.ok)&&tests.total>0&&tests.failed===0,tests,steps,deliveredScope:['Informe IRI sin puntuaciones visuales no normativas',
'PDF IRI ultra premium con identidad IBERFIT, fondo crema, pestañas seguras, isotipo integrado y marca de agua','Coherencia explícita entre 7 etapas y 3 dominios de resultado','Bioimpedancia estructurada por método, dispositivo y condiciones','Inicio Cliente con acciones propias de bienestar, plan, sesiones, progreso e informes','RC35 estable preservado; RC36 aún no desplegado'],localValidationOnly:true,deployable:false,productionModified:false,productionDeployed:false,cloudflareModified:false,remoteIsolationExecuted:false,remoteMutationGateExecuted:false,pendingExternalGates:['CI de GitHub sobre canary/rc36','Gate autenticado de solo lectura Coach / Cliente QA 1 / Cliente QA 2','QA visual e interacción de Cliente A y Cliente B en móvil y escritorio','Creación posterior del runtime y despliegue canary RC36']};
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
if(!report.ok)process.exit(1);