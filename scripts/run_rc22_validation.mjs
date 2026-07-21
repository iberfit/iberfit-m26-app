import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
const testFiles=readdirSync('tests').filter((name)=>name.endsWith('.test.mjs')).sort().map((name)=>path.join('tests',name));
const tasks=[
 {name:'repository-hygiene',command:process.execPath,args:['scripts/remote-gates/check_repository_hygiene.mjs'],timeout:60000},
 {name:'tests',command:process.execPath,args:['--test',...testFiles],timeout:180000},
 {name:'build',command:process.execPath,args:['scripts/build_rc22_local_candidate.mjs'],timeout:60000},
 {name:'module-graph',command:process.execPath,args:['scripts/verify_rc22_module_graph.mjs'],timeout:60000},
 {name:'qa-report-verification',command:process.execPath,args:['scripts/verify_rc22_qa_reports.mjs'],timeout:60000},
 {name:'quality-gate',command:process.execPath,args:['scripts/m26_rc22_quality_gate.mjs'],timeout:120000},
];
const results=[];let failed=false;
for(const task of tasks){const started=Date.now();const run=spawnSync(task.command,task.args,{cwd:process.cwd(),encoding:'utf8',timeout:task.timeout,maxBuffer:64*1024*1024,env:{...process.env}});const item={name:task.name,command:[task.command,...task.args].join(' '),status:run.status,timedOut:run.error?.code==='ETIMEDOUT',durationMs:Date.now()-started,stdout:run.stdout||'',stderr:run.stderr||''};item.ok=item.status===0&&!item.timedOut;results.push(item);console.log(`${item.ok?'PASS':'FAIL'} ${item.name} (${item.durationMs} ms)`);if(!item.ok){failed=true;console.error(item.stdout.slice(-6000));console.error(item.stderr.slice(-6000));break;}}
const testText=(results.find((item)=>item.name==='tests')?.stdout||'')+'\n'+(results.find((item)=>item.name==='tests')?.stderr||'');
const tests={total:Number(testText.match(/^# tests\s+(\d+)$/m)?.[1]||0),passed:Number(testText.match(/^# pass\s+(\d+)$/m)?.[1]||0),failed:Number(testText.match(/^# fail\s+(\d+)$/m)?.[1]||0)};
const quality=JSON.parse(readFileSync('recovery/m26-rc22-quality-gate-results.json','utf8'));
const visual=JSON.parse(readFileSync('recovery/RC22_VISUAL_QA_REPORT.json','utf8'));
const integrated=JSON.parse(readFileSync('recovery/RC22_INTEGRATED_QA_REPORT.json','utf8'));
const historical=JSON.parse(readFileSync('recovery/RC21_LOCAL_VALIDATION.json','utf8'));
const report={release:'IBERFIT_M26_STATE_PERFORMANCE_UX_RC22',version:'26.0.0-state-performance-ux.22',generatedAt:new Date().toISOString(),ok:!failed&&tests.total===216&&tests.passed===216&&tests.failed===0&&quality.ok&&visual.passed===20&&visual.failed===0&&integrated.passed===2,localOnly:true,remoteGatesPassed:false,productionModified:false,productionDeployed:false,tests,qualityGate:{passed:quality.passed,total:quality.total,failed:quality.failed},visualQa:{passed:visual.passed,total:visual.case_count,failed:visual.failed},integratedQa:{passed:integrated.passed,total:integrated.total},inheritedEvidence:{release:'RC21',tests:historical.tests,note:'RC22 ejecuta regresión completa propia y conserva RC21 como evidencia histórica.'},tasks:results.map(({stdout,stderr,...item})=>({...item,stdoutTail:stdout.split(/\r?\n/).slice(-14).join('\n'),stderrTail:stderr.split(/\r?\n/).slice(-14).join('\n')})),pendingExternalGates:['Comparación autenticada exacta de las 52 definiciones remotas','Pruebas con cuentas QA reales Coach y Cliente','Puente Android Health Connect en dispositivo real','Revisión OAuth restringida de Google Health API','Pruebas en iPhone, Android y tablet físicos','Canario remoto observado y ensayo real de rollback M25.1']};
writeFileSync('recovery/RC22_LOCAL_VALIDATION.json',JSON.stringify(report,null,2)+'\n');
writeFileSync('recovery/RC22_VALIDATION_OUTPUT.txt',results.map((item)=>`===== ${item.name} =====\n${item.stdout}\n${item.stderr}\nSTATUS ${item.status} TIMEOUT ${item.timedOut} DURATION_MS ${item.durationMs}`).join('\n\n')+'\n');
const remote=JSON.parse(readFileSync('recovery/RC22_REMOTE_VALIDATION_STATUS.json','utf8'));remote.localValidationPassed=report.ok;writeFileSync('recovery/RC22_REMOTE_VALIDATION_STATUS.json',JSON.stringify(remote,null,2)+'\n');
console.log(`RC22 tests: ${tests.passed}/${tests.total}`);console.log(`RC22 quality: ${quality.passed}/${quality.total}`);console.log(`RC22 visual: ${visual.passed}/${visual.case_count}`);console.log(`RC22 integrated: ${integrated.passed}/${integrated.total}`);console.log(report.ok?'RC22 LOCAL VALIDATION PASS':'RC22 LOCAL VALIDATION FAIL');
if(!report.ok) process.exit(1);
