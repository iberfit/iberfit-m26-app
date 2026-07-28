import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const reportPath=path.join(root,'recovery','RC35_CI_VALIDATION_REPORT.json');
const steps=[];
let testOutput='';
let stopped=false;

function run(name,args,timeoutMs=300_000){
  if(stopped)return;
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:process.env,timeout:timeoutMs,maxBuffer:128*1024*1024});
  const stdout=result.stdout||'';const stderr=result.stderr||'';const timedOut=result.error?.code==='ETIMEDOUT';
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
run('rc35-release-gate',['scripts/m26_rc35_release_gate.mjs']);
run('build-current-source-with-repdb',['scripts/build_rc29_prepublication_candidate.mjs']);
run('module-graph',['scripts/verify_rc29_module_graph.mjs']);
run('configure-rc35-validation-runtime',['scripts/generate_rc35_runtime_config.mjs']);
run('verify-rc35-canary-candidate',['scripts/verify_rc35_canary_candidate.mjs']);

const tests={total:metric('tests'),passed:metric('pass'),failed:metric('fail'),skipped:metric('skipped')};
let sourceRevision=null;try{sourceRevision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout?.trim()||null;}catch{}
const report={
  release:'IBERFIT_M26_CANARY_RC35_CI',version:'26.0.0-canary.35-ci',generatedAt:new Date().toISOString(),sourceRevision,
  sourceBranch:'canary/rc34',sourceCommit:'7691b9a85ec6de374834e9c8da48cf0e01163530',backendContract:'RC30',
  ok:!stopped&&steps.every((step)=>step.ok)&&tests.total>0&&tests.failed===0,
  tests,steps,
  deliveredScope:[
    'Persistencia verificable de IRI, ciclos, sesiones y notas privadas',
    'Agenda recuperable e Inteligencia deliberada con aprobación Coach',
    'Informe IRI autocontenido con alternativa ante bloqueo de ventanas',
    'Temporizador Cardio audible y protocolos IRI explicables',
    'Eliminación de la puntuación global histórica del IRI',
    'Un único scroll documental y priorización operativa de Hoy, Clientes y Expediente',
    'Biblioteca filtrable con búsqueda priorizada y ausencias visuales honestas',
    'Actividad y Progreso compactos, visuales y sin integraciones falsas',
  ],
  localValidationOnly:String(process.env.M26_RUNTIME_VALIDATION_ONLY||'').toLowerCase()==='true',
  productionModified:false,productionDeployed:false,cloudflareModified:false,remoteIsolationExecuted:false,remoteMutationGateExecuted:false,
  pendingExternalGates:[
    'CI de GitHub sobre canary/rc35',
    'Gate autenticado de solo lectura Coach / Cliente QA 1 / Cliente QA 2',
    'QA HTTP del dominio m26-canary.iberfit.cl y MIME real de JSON y WebP',
    'QA visual e interacción de Coach y aplicación Cliente en móvil y escritorio',
  ],
};
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
if(!report.ok)process.exit(1);
