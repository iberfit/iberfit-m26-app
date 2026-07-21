import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const read=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,value)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(value,null,2)+'\n');};
const hash=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(dir,base=root){const rows=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(entry.name==='.git'||entry.name==='__pycache__')continue;const abs=path.join(dir,entry.name);if(entry.isDirectory())rows.push(...walk(abs,base));else if(entry.isFile())rows.push({path:path.relative(base,abs).replaceAll(path.sep,'/'),size:fs.statSync(abs).size,sha256:hash(abs)});}return rows;}

const validation=read('recovery/RC19_LOCAL_VALIDATION.json');
const quality=read('recovery/m26-rc19-quality-gate-results.json');
const visual=read('recovery/RC19_VISUAL_QA_REPORT.json');
const integrated=read('recovery/RC19_INTEGRATED_QA_REPORT.json');
const graph=read('recovery/RC19_MODULE_GRAPH_REPORT.json');
const protectedLayers=read('recovery/RC19_PROTECTED_BASELINE_COMPARISON.json');
const build=read('dist/m26-final-local-candidate/version.json');
const dependencies=read('recovery/RC19_DEPENDENCY_AUDIT.json');
const remote=read('recovery/RC19_REMOTE_VALIDATION_STATUS.json');
const webRoot=path.join(root,'dist','m26-final-local-candidate');
const webEntries=walk(webRoot,webRoot);
write('recovery/RC19_WEB_SHA256_MANIFEST.json',{release:'IBERFIT_M26_WEB_CANARY_RC19',version:build.version,generatedAt:new Date().toISOString(),count:webEntries.length,totalBytes:webEntries.reduce((s,x)=>s+x.size,0),entries:webEntries});

const summary={release:'IBERFIT_M26_FINAL_LOCAL_AUDIT_RC19',version:build.version,generatedAt:new Date().toISOString(),status:'not_deployed',deployable:false,localValidationOnly:true,productionModified:false,productionDeployed:false,tests:validation.tests,qualityGate:validation.qualityGate,historicalEvidence:validation.inheritedEvidence,visualQa:{passed:visual.passed,total:visual.case_count,failed:visual.failed},integratedQa:{passed:integrated.passed,total:integrated.total,routes:integrated.results.reduce((s,x)=>s+x.routes.length,0),actions:integrated.results.reduce((s,x)=>s+x.actions.length,0)},build:{activeFiles:build.files,webManifestFiles:webEntries.length,totalBytes:build.totalBytes,javascriptBytes:build.budgets.javascriptBytes,cssBytes:build.budgets.cssBytes,jsonBytes:build.budgets.jsonBytes,budgetOk:build.budgetOk,modules:graph.modules,missingModules:graph.missing.length},dependencies,protectedLayers,catalogExercises:367,baseCommands:44,extendedContractCommands:52,syntaxFiles:quality.syntax.files,remoteValidation:remote,pendingExternalGates:validation.pendingExternalGates,packageFiles:null};
write('recovery/RC19_SUMMARY.json',summary);
const excluded=new Set(['recovery/RC19_SHA256_MANIFEST.json']);
let entries=walk(root).filter((entry)=>!excluded.has(entry.path));
summary.packageFiles=entries.length;write('recovery/RC19_SUMMARY.json',summary);
entries=walk(root).filter((entry)=>!excluded.has(entry.path));
write('recovery/RC19_SHA256_MANIFEST.json',{release:summary.release,version:summary.version,generatedAt:new Date().toISOString(),excluded:[...excluded],count:entries.length,totalBytes:entries.reduce((s,x)=>s+x.size,0),entries});
console.log(JSON.stringify({release:summary.release,version:summary.version,tests:`${summary.tests.passed}/${summary.tests.total}`,quality:`${summary.qualityGate.passed}/${summary.qualityGate.total}`,visual:`${summary.visualQa.passed}/${summary.visualQa.total}`,integrated:`${summary.integratedQa.passed}/${summary.integratedQa.total}`,packageFiles:entries.length,webFiles:webEntries.length},null,2));
