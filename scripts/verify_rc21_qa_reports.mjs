import {existsSync, readFileSync, statSync, writeFileSync} from 'node:fs';

const VERSION='26.0.0-free-integrations-ux.21';
const MAX_AGE_MS=24*60*60*1000;
const definitions=[
  {name:'visual',path:'recovery/RC21_VISUAL_QA_REPORT.json',expected:{passed:18,totalKey:'case_count',total:18,failed:0}},
  {name:'integrated',path:'recovery/RC21_INTEGRATED_QA_REPORT.json',expected:{passed:2,totalKey:'total',total:2}},
];
const checks=[];
for(const item of definitions){
  if(!existsSync(item.path)){
    checks.push({name:item.name,ok:false,reason:`Falta ${item.path}`});
    continue;
  }
  const data=JSON.parse(readFileSync(item.path,'utf8'));
  const ageMs=Date.now()-statSync(item.path).mtimeMs;
  const okVersion=data.version===VERSION;
  const okPassed=data.passed===item.expected.passed;
  const okTotal=data[item.expected.totalKey]===item.expected.total;
  const okFailed=item.expected.failed===undefined||data.failed===item.expected.failed;
  const okFresh=ageMs>=0&&ageMs<=MAX_AGE_MS;
  checks.push({
    name:item.name,
    path:item.path,
    ok:okVersion&&okPassed&&okTotal&&okFailed&&okFresh,
    version:data.version,
    passed:data.passed,
    total:data[item.expected.totalKey],
    failed:data.failed??null,
    ageMs:Math.round(ageMs),
    freshWithinHours:24,
    details:{okVersion,okPassed,okTotal,okFailed,okFresh},
  });
}
const report={
  release:'IBERFIT_M26_FREE_INTEGRATIONS_UX_RC21',
  version:VERSION,
  generatedAt:new Date().toISOString(),
  ok:checks.every((check)=>check.ok),
  checks,
  note:'Este verificador no ejecuta Chromium. Confirma que las evidencias visual e integrada fueron generadas por RC21, están completas y son recientes. Las QA se ejecutan como pasos independientes para evitar procesos Chromium huérfanos en el orquestador.'
};
writeFileSync('recovery/RC21_QA_REPORT_VERIFICATION.json',JSON.stringify(report,null,2)+'\n');
for(const check of checks) console.log(`${check.ok?'PASS':'FAIL'} ${check.name} ${check.passed??0}/${check.total??0}`);
if(!report.ok) process.exit(1);
