import {existsSync,readFileSync,statSync,writeFileSync} from 'node:fs';
const VERSION='26.0.0-state-performance-ux.22';
const MAX_AGE_MS=24*60*60*1000;
const definitions=[
  {name:'visual',path:'recovery/RC22_VISUAL_QA_REPORT.json',expected:{passed:20,totalKey:'case_count',total:20,failed:0}},
  {name:'integrated',path:'recovery/RC22_INTEGRATED_QA_REPORT.json',expected:{passed:2,totalKey:'total',total:2}},
];
const checks=[];
for(const item of definitions){
  if(!existsSync(item.path)){checks.push({name:item.name,ok:false,reason:`Falta ${item.path}`});continue;}
  const data=JSON.parse(readFileSync(item.path,'utf8'));
  const ageMs=Date.now()-statSync(item.path).mtimeMs;
  const okVersion=data.version===VERSION,okPassed=data.passed===item.expected.passed,okTotal=data[item.expected.totalKey]===item.expected.total;
  const okFailed=item.expected.failed===undefined||data.failed===item.expected.failed,okFresh=ageMs>=0&&ageMs<=MAX_AGE_MS;
  checks.push({name:item.name,path:item.path,ok:okVersion&&okPassed&&okTotal&&okFailed&&okFresh,version:data.version,passed:data.passed,total:data[item.expected.totalKey],failed:data.failed??null,ageMs:Math.round(ageMs),freshWithinHours:24,details:{okVersion,okPassed,okTotal,okFailed,okFresh}});
}
const report={release:'IBERFIT_M26_STATE_PERFORMANCE_UX_RC22',version:VERSION,generatedAt:new Date().toISOString(),ok:checks.every((check)=>check.ok),checks,note:'Verifica que las evidencias visual e integrada de RC22 sean completas, recientes y propias de esta versión; no sustituye pruebas remotas ni físicas.'};
writeFileSync('recovery/RC22_QA_REPORT_VERIFICATION.json',JSON.stringify(report,null,2)+'\n');
for(const check of checks) console.log(`${check.ok?'PASS':'FAIL'} ${check.name} ${check.passed??0}/${check.total??0}`);
if(!report.ok) process.exit(1);
