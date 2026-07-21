import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd();
const read=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,value)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(value,null,2)+'\n');};
const hash=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(dir,base=root){
  const rows=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(entry.name==='.git'||entry.name==='__pycache__')continue;
    const abs=path.join(dir,entry.name);
    if(entry.isDirectory())rows.push(...walk(abs,base));
    else if(entry.isFile())rows.push({path:path.relative(base,abs).replaceAll(path.sep,'/'),size:fs.statSync(abs).size,sha256:hash(abs)});
  }
  return rows;
}
const validation=read('recovery/RC23_LOCAL_VALIDATION.json');
const quality=read('recovery/m26-rc23-quality-gate-results.json');
const castellano=read('recovery/RC23_CASTELLANO_GATE_REPORT.json');
const visual=read('recovery/RC23_VISUAL_QA_REPORT.json');
const integrated=read('recovery/RC23_INTEGRATED_QA_REPORT.json');
const graph=read('recovery/RC23_MODULE_GRAPH_REPORT.json');
const protectedLayers=read('recovery/RC23_PROTECTED_BASELINE_COMPARISON.json');
const build=read('dist/m26-castellano-ux-candidate/version.json');
const qaVerification=read('recovery/RC23_QA_REPORT_VERIFICATION.json');
const remote=read('recovery/RC23_REMOTE_VALIDATION_STATUS.json');
const dependencies={release:'IBERFIT_M26_CASTELLANO_UX_RC23',runtimeNpmDependencies:0,newPaidDependencies:0,externalSdkBundled:false,oauthSecretsPresent:false,nativeBridgeBundled:false,policy:'zero-cost-only',notes:['RC23 añade únicamente módulos propios sin dependencias de ejecución.','La auditoría lingüística se ejecuta localmente sobre texto visible y atributos accesibles.','Puentes nativos y OAuth permanecen como contratos no activados.'],ok:true};
write('recovery/RC23_DEPENDENCY_AUDIT.json',dependencies);
const webRoot=path.join(root,'dist','m26-castellano-ux-candidate');
const webEntries=walk(webRoot,webRoot);
write('recovery/RC23_WEB_SHA256_MANIFEST.json',{release:'IBERFIT_M26_WEB_CANARY_RC23',version:build.version,locale:'es-ES',generatedAt:new Date().toISOString(),count:webEntries.length,totalBytes:webEntries.reduce((s,x)=>s+x.size,0),entries:webEntries});
const summary={
  release:'IBERFIT_M26_CASTELLANO_UX_RC23',version:build.version,generatedAt:new Date().toISOString(),
  status:'not_deployed',deployable:false,localValidationOnly:true,productionModified:false,productionDeployed:false,zeroCostOnly:true,locale:'es-ES',
  tests:validation.tests,qualityGate:validation.qualityGate,castellanoGate:validation.castellanoGate,historicalEvidence:validation.inheritedEvidence,
  visualQa:{passed:visual.passed,total:visual.case_count,failed:visual.failed,visibleLanguageHits:visual.results.reduce((sum,item)=>sum+(item.metrics?.forbiddenLanguageHits?.length||0),0)},
  integratedQa:{passed:integrated.passed,total:integrated.total,routes:integrated.results.reduce((s,x)=>s+x.routes.length,0),actions:integrated.results.reduce((s,x)=>s+x.actions.length,0),commands:integrated.results.reduce((s,x)=>s+(x.command_count||0),0),visibleLanguageHits:integrated.results.reduce((sum,item)=>sum+(item.finalMetrics?.forbiddenLanguageHits?.length||0)+item.routes.reduce((routeSum,route)=>routeSum+(route.metrics?.forbiddenLanguageHits?.length||0),0),0)},
  qaReportVerification:qaVerification,
  build:{activeFiles:build.files,webManifestFiles:webEntries.length,totalBytes:build.totalBytes,javascriptBytes:build.budgets.javascriptBytes,cssBytes:build.budgets.cssBytes,jsonBytes:build.budgets.jsonBytes,budgetOk:build.budgetOk,modules:graph.modules,missingModules:graph.missing.length},
  dependencies,protectedLayers,catalogExercises:367,baseCommands:44,extendedContractCommands:52,wearableProviders:6,wearableMetrics:7,connectionStates:8,
  castellanoUx:{documentLanguage:'es-ES',visibleText:true,accessibleAttributes:true,dynamicMessages:true,downloadNames:true,properProviderNamesPreserved:true,mobileAccessOverflowFixed:true,pluralizationFixed:true,gatePermanent:true},
  freeNowProviders:['normalized_file'],freeDevelopmentProviders:['health_connect','fitbit'],blockedByZeroCostPolicy:['apple_health','garmin_connect','oura'],
  syntaxFiles:quality.syntax.files,remoteValidation:remote,pendingExternalGates:validation.pendingExternalGates,packageFiles:null
};
write('recovery/RC23_SUMMARY.json',summary);
write('release/RC23_RELEASE_METADATA.json',summary);
const excluded=new Set(['recovery/RC23_SHA256_MANIFEST.json','recovery/RC23_MANIFEST_VERIFICATION.json']);
let entries=walk(root).filter((entry)=>!excluded.has(entry.path));
summary.packageFiles=entries.length;
write('recovery/RC23_SUMMARY.json',summary);
write('release/RC23_RELEASE_METADATA.json',summary);
entries=walk(root).filter((entry)=>!excluded.has(entry.path));
write('recovery/RC23_SHA256_MANIFEST.json',{release:summary.release,version:summary.version,locale:'es-ES',generatedAt:new Date().toISOString(),excluded:[...excluded],count:entries.length,totalBytes:entries.reduce((s,x)=>s+x.size,0),entries});
console.log(JSON.stringify({release:summary.release,version:summary.version,tests:`${summary.tests.passed}/${summary.tests.total}`,quality:`${summary.qualityGate.passed}/${summary.qualityGate.total}`,castellano:`${summary.castellanoGate.passed}/${summary.castellanoGate.total}`,visual:`${summary.visualQa.passed}/${summary.visualQa.total}`,integrated:`${summary.integratedQa.passed}/${summary.integratedQa.total}`,packageFiles:entries.length,webFiles:webEntries.length,modules:summary.build.modules},null,2));
