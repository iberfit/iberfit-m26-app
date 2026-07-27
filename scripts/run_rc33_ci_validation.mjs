import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const reportPath=path.join(root,'recovery','RC33_CI_VALIDATION_REPORT.json');
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
run('rc33-first-session-gate',['scripts/m26_rc33_canary_gate.mjs']);
run('build-current-source-with-repdb',['scripts/build_rc29_prepublication_candidate.mjs']);
run('module-graph',['scripts/verify_rc29_module_graph.mjs']);
run('configure-rc33-validation-runtime',['scripts/generate_rc33_runtime_config.mjs']);
run('verify-rc33-canary-candidate',['scripts/verify_rc33_canary_candidate.mjs']);

const tests={total:metric('tests'),passed:metric('pass'),failed:metric('fail'),skipped:metric('skipped')};
let sourceRevision=null;try{sourceRevision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout?.trim()||null;}catch{}
const report={
  release:'IBERFIT_M26_CANARY_RC33_CI',version:'26.0.0-canary.33-ci',generatedAt:new Date().toISOString(),sourceRevision,
  baseCommit:'7e20bd5087d6acdb07d691bb029b4c44be3bc7f6',
  ok:!stopped&&steps.every((step)=>step.ok)&&tests.total>0&&tests.failed===0,
  tests,steps,
  deliveredScope:[
    'Alta de cliente canary con acceso desactivado',
    'Expediente y perfil esencial recuperables',
    'Primera sesión IRI guiada en siete etapas con borrador aislado',
    'Movilidad, fuerza y YMCA de tres minutos según protocolos diferenciados',
    'Diagnóstico por dominios sin puntuación universal inventada',
    'Informe Cliente de siete páginas e informe Coach/Admin de trece páginas base más anexos íntegros',
    'Isotipo integrado, sello interior, marca de agua y protecciones de desbordamiento',
  ],
  localValidationOnly:String(process.env.M26_RUNTIME_VALIDATION_ONLY||'').toLowerCase()==='true',
  productionModified:false,productionDeployed:false,remoteIsolationExecuted:false,remoteMutationGateExecuted:false,
  pendingExternalGates:[
    'Gate autenticado de iberfit_create_client_draft en canary con cliente QA y limpieza posterior',
    'Confirmar si el alta crea una entidad IRI remota o habilitar un contrato backend específico',
    'Aislamiento autenticado Coach / Cliente A / Cliente B',
    'Carga persistente del informe externo de bioimpedancia requiere contrato de almacenamiento y RLS',
    'Comprobación HTTP real del dominio m26-canary.iberfit.cl y MIME de activos',
    'QA visual y de impresión real de ambos informes en móvil, escritorio y zoom 200 %',
  ],
};
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
if(!report.ok)process.exit(1);
