import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
const RELEASE='IBERFIT_M26_CIERRE_LOCAL_MAXIMO_RC28';
const VERSION='26.0.0-cierre-local-maximo.28';
const EXPECTED_TESTS=277;
const testFiles=readdirSync('tests').filter((name)=>name.endsWith('.test.mjs')).sort().map((name)=>path.join('tests',name));
const tasks=[
  {name:'repository-hygiene',command:process.execPath,args:['scripts/remote-gates/check_repository_hygiene.mjs'],timeout:60000},
  {name:'tests',command:process.execPath,args:['--test',...testFiles],timeout:240000},
  {name:'build',command:process.execPath,args:['scripts/build_rc28_local_candidate.mjs'],timeout:60000},
  {name:'module-graph',command:process.execPath,args:['scripts/verify_rc28_module_graph.mjs'],timeout:60000},
  {name:'qa-report-verification',command:process.execPath,args:['scripts/verify_rc28_qa_reports.mjs'],timeout:60000},
  {name:'castellano-gate',command:process.execPath,args:['scripts/m26_rc28_castellano_gate.mjs'],timeout:60000},
  {name:'quality-gate',command:process.execPath,args:['scripts/m26_rc28_local_completion_gate.mjs'],timeout:120000},
];
const results=[];let failed=false;
for(const task of tasks){const started=Date.now();const run=spawnSync(task.command,task.args,{cwd:process.cwd(),encoding:'utf8',timeout:task.timeout,maxBuffer:128*1024*1024,env:{...process.env}});const item={name:task.name,command:[task.command,...task.args].join(' '),status:run.status,timedOut:run.error?.code==='ETIMEDOUT',durationMs:Date.now()-started,stdout:run.stdout||'',stderr:run.stderr||''};item.ok=item.status===0&&!item.timedOut;results.push(item);console.log(`${item.ok?'PASS':'FAIL'} ${item.name} (${item.durationMs} ms)`);if(!item.ok){failed=true;console.error(item.stdout.slice(-12000));console.error(item.stderr.slice(-12000));break;}}
const testText=(results.find((item)=>item.name==='tests')?.stdout||'')+'\n'+(results.find((item)=>item.name==='tests')?.stderr||'');
const tests={total:Number(testText.match(/^# tests\s+(\d+)$/m)?.[1]||0),passed:Number(testText.match(/^# pass\s+(\d+)$/m)?.[1]||0),failed:Number(testText.match(/^# fail\s+(\d+)$/m)?.[1]||0)};
const safeJson=(file)=>existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
const quality=safeJson('recovery/m26-rc28-quality-gate-results.json'),visual=safeJson('recovery/RC28_VISUAL_QA_REPORT.json'),integrated=safeJson('recovery/RC28_INTEGRATED_QA_REPORT.json'),castellano=safeJson('recovery/RC28_CASTELLANO_GATE_REPORT.json');
const report={release:RELEASE,version:VERSION,generatedAt:new Date().toISOString(),ok:!failed&&tests.total===EXPECTED_TESTS&&tests.passed===EXPECTED_TESTS&&tests.failed===0&&quality?.ok&&visual?.passed===40&&visual?.failed===0&&integrated?.passed===2&&castellano?.ok,localOnly:true,remoteGatesPassed:false,productionModified:false,productionDeployed:false,deployable:false,tests,qualityGate:quality?{passed:quality.passed,total:quality.total,failed:quality.failed}:null,castellanoGate:castellano?{passed:castellano.passed,total:castellano.total,failed:castellano.failed}:null,visualQa:visual?{passed:visual.passed,total:visual.case_count,failed:visual.failed}:null,integratedQa:integrated?{passed:integrated.passed,total:integrated.total,routes:integrated.results.reduce((sum,item)=>sum+item.routes.length,0),actions:integrated.results.reduce((sum,item)=>sum+item.actions.length,0),commands:integrated.results.reduce((sum,item)=>sum+(item.command_count||0),0)}:null,tasks:results.map(({stdout,stderr,...item})=>({...item,stdoutTail:stdout.split(/\r?\n/).slice(-18).join('\n'),stderrTail:stderr.split(/\r?\n/).slice(-18).join('\n')})),pendingExternalGates:['Comparación autenticada exacta de las 52 definiciones remotas','Pruebas con cuentas QA reales de entrenador y cliente','Validación de RLS y payloads por identidad en Supabase','Puente Android Health Connect en dispositivo real','Revisión OAuth restringida de Google Health API','Pruebas en iPhone, Android y tableta físicos','Canario remoto observado y ensayo real de rollback M25.1']};
writeFileSync('recovery/RC28_LOCAL_VALIDATION.json',JSON.stringify(report,null,2)+'\n');writeFileSync('recovery/RC28_VALIDATION_OUTPUT.txt',results.map((item)=>`===== ${item.name} =====\n${item.stdout}\n${item.stderr}\nSTATUS ${item.status} TIMEOUT ${item.timedOut} DURATION_MS ${item.durationMs}`).join('\n\n')+'\n');
writeFileSync('recovery/RC28_REMOTE_VALIDATION_STATUS.json',JSON.stringify({release:RELEASE,version:VERSION,localValidationPassed:report.ok,remoteGatesPassed:false,productionModified:false,productionDeployed:false,deployable:false,publicationLifecycleValidatedLocally:quality?.ok===true,roleProjectionValidatedLocally:integrated?.results?.find((x)=>x.role==='client')?.privacy||null,pendingExternalGates:report.pendingExternalGates},null,2)+'\n');
console.log(`RC28 tests: ${tests.passed}/${tests.total}`);console.log(`RC28 quality: ${quality?.passed||0}/${quality?.total||0}`);console.log(`RC28 castellano: ${castellano?.passed||0}/${castellano?.total||0}`);console.log(`RC28 visual: ${visual?.passed||0}/${visual?.case_count||0}`);console.log(`RC28 integrated: ${integrated?.passed||0}/${integrated?.total||0}`);console.log(report.ok?'RC28 LOCAL VALIDATION PASS':'RC28 LOCAL VALIDATION FAIL');if(!report.ok)process.exit(1);
