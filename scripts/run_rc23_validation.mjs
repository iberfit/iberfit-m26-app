import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const RELEASE='IBERFIT_M26_CASTELLANO_UX_RC23';
const VERSION='26.0.0-castellano-ux.23';
const testFiles=readdirSync('tests').filter((name)=>name.endsWith('.test.mjs')).sort().map((name)=>path.join('tests',name));
const tasks=[
  {name:'repository-hygiene',command:process.execPath,args:['scripts/remote-gates/check_repository_hygiene.mjs'],timeout:60000},
  {name:'tests',command:process.execPath,args:['--test',...testFiles],timeout:240000},
  {name:'build',command:process.execPath,args:['scripts/build_rc23_local_candidate.mjs'],timeout:60000},
  {name:'module-graph',command:process.execPath,args:['scripts/verify_rc23_module_graph.mjs'],timeout:60000},
  {name:'qa-report-verification',command:process.execPath,args:['scripts/verify_rc23_qa_reports.mjs'],timeout:60000},
  {name:'castellano-gate',command:process.execPath,args:['scripts/m26_rc23_castellano_gate.mjs'],timeout:60000},
  {name:'quality-gate',command:process.execPath,args:['scripts/m26_rc23_quality_gate.mjs'],timeout:120000},
]
const results=[];let failed=false;
for(const task of tasks){
  const started=Date.now();
  const run=spawnSync(task.command,task.args,{cwd:process.cwd(),encoding:'utf8',timeout:task.timeout,maxBuffer:96*1024*1024,env:{...process.env}});
  const item={name:task.name,command:[task.command,...task.args].join(' '),status:run.status,timedOut:run.error?.code==='ETIMEDOUT',durationMs:Date.now()-started,stdout:run.stdout||'',stderr:run.stderr||''};
  item.ok=item.status===0&&!item.timedOut;
  results.push(item);
  console.log(`${item.ok?'PASS':'FAIL'} ${item.name} (${item.durationMs} ms)`);
  if(!item.ok){failed=true;console.error(item.stdout.slice(-10000));console.error(item.stderr.slice(-10000));break;}
}
const testText=(results.find((item)=>item.name==='tests')?.stdout||'')+'\n'+(results.find((item)=>item.name==='tests')?.stderr||'');
const tests={total:Number(testText.match(/^# tests\s+(\d+)$/m)?.[1]||0),passed:Number(testText.match(/^# pass\s+(\d+)$/m)?.[1]||0),failed:Number(testText.match(/^# fail\s+(\d+)$/m)?.[1]||0)};
const safeJson=(file)=>existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
const quality=safeJson('recovery/m26-rc23-quality-gate-results.json');
const visual=safeJson('recovery/RC23_VISUAL_QA_REPORT.json');
const integrated=safeJson('recovery/RC23_INTEGRATED_QA_REPORT.json');
const castellano=safeJson('recovery/RC23_CASTELLANO_GATE_REPORT.json');
const historical=safeJson('recovery/RC22_LOCAL_VALIDATION.json');
const report={
  release:RELEASE,version:VERSION,generatedAt:new Date().toISOString(),
  ok:!failed&&tests.total===225&&tests.passed===225&&tests.failed===0&&quality?.ok&&visual?.passed===22&&visual?.failed===0&&integrated?.passed===2&&castellano?.ok,
  localOnly:true,remoteGatesPassed:false,productionModified:false,productionDeployed:false,
  tests,
  qualityGate:quality?{passed:quality.passed,total:quality.total,failed:quality.failed}:null,
  castellanoGate:castellano?{passed:castellano.passed,total:castellano.total,failed:castellano.failed}:null,
  visualQa:visual?{passed:visual.passed,total:visual.case_count,failed:visual.failed}:null,
  integratedQa:integrated?{passed:integrated.passed,total:integrated.total}:null,
  inheritedEvidence:historical?{release:'RC22',tests:historical.tests,note:'RC23 ejecuta una regresión completa propia; RC22 se conserva únicamente como evidencia histórica.'}:null,
  tasks:results.map(({stdout,stderr,...item})=>({...item,stdoutTail:stdout.split(/\r?\n/).slice(-16).join('\n'),stderrTail:stderr.split(/\r?\n/).slice(-16).join('\n')})),
  pendingExternalGates:['Comparación autenticada exacta de las 52 definiciones remotas','Pruebas con cuentas QA reales de entrenador y cliente','Puente Android Health Connect en dispositivo real','Revisión OAuth restringida de Google Health API','Pruebas en iPhone, Android y tableta físicos','Canario remoto observado y ensayo real de rollback M25.1']
};
writeFileSync('recovery/RC23_LOCAL_VALIDATION.json',JSON.stringify(report,null,2)+'\n');
writeFileSync('recovery/RC23_VALIDATION_OUTPUT.txt',results.map((item)=>`===== ${item.name} =====\n${item.stdout}\n${item.stderr}\nSTATUS ${item.status} TIMEOUT ${item.timedOut} DURATION_MS ${item.durationMs}`).join('\n\n')+'\n');
const remote=safeJson('recovery/RC22_REMOTE_VALIDATION_STATUS.json')||{};
const remote23={...remote,release:RELEASE,localValidationPassed:report.ok,castellanoVisibleValidatedLocally:castellano?.ok===true,productionModified:false,productionDeployed:false,deployable:false};
writeFileSync('recovery/RC23_REMOTE_VALIDATION_STATUS.json',JSON.stringify(remote23,null,2)+'\n');
console.log(`RC23 tests: ${tests.passed}/${tests.total}`);
console.log(`RC23 quality: ${quality?.passed||0}/${quality?.total||0}`);
console.log(`RC23 castellano: ${castellano?.passed||0}/${castellano?.total||0}`);
console.log(`RC23 visual: ${visual?.passed||0}/${visual?.case_count||0}`);
console.log(`RC23 integrated: ${integrated?.passed||0}/${integrated?.total||0}`);
console.log(report.ok?'RC23 LOCAL VALIDATION PASS':'RC23 LOCAL VALIDATION FAIL');
if(!report.ok)process.exit(1);
