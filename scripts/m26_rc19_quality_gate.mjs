import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {M26_COMMAND_REGISTRY,M26_EXTENDED_COMMAND_REGISTRY} from '../src/m26/command-catalog.js';

const root=process.cwd();
const abs=(p)=>path.join(root,p),exists=(p)=>fs.existsSync(abs(p)),read=(p)=>fs.readFileSync(abs(p),'utf8'),json=(p)=>JSON.parse(read(p));
const sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(abs(p))).digest('hex');
function walk(dir,files=[]){if(!fs.existsSync(dir))return files;for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const target=path.join(dir,entry.name);if(entry.isDirectory())walk(target,files);else files.push(target);}return files;}
function protectedComparison(){const baseline=json('recovery/RC16_SHA256_MANIFEST.json');const expected=baseline.entries.filter((entry)=>entry.path.startsWith('legacy/')||entry.path.startsWith('baseline_m25_2/'));const changed=[],missing=[];for(const entry of expected){if(!exists(entry.path))missing.push(entry.path);else if(sha(entry.path)!==entry.sha256)changed.push(entry.path);}const expectedPaths=new Set(expected.map((entry)=>entry.path));const added=[];for(const folder of ['legacy','baseline_m25_2'])for(const file of walk(abs(folder))){const rel=path.relative(root,file).replaceAll(path.sep,'/');if(!expectedPaths.has(rel))added.push(rel);}const report={baseline:'RC16 protected layers',expectedFiles:expected.length,changed,missing,added,ok:expected.length===122&&!changed.length&&!missing.length&&!added.length};fs.writeFileSync(abs('recovery/RC19_PROTECTED_BASELINE_COMPARISON.json'),JSON.stringify(report,null,2)+'\n');return report;}
function syntaxAudit(){const files=['src/m26','public/m26','scripts','qa'].flatMap((dir)=>walk(abs(dir))).filter((file)=>/\.(?:js|mjs)$/.test(file)&&!file.endsWith('rc17_bundle.js')&&!file.endsWith('rc19_bundle.js'));const failed=[];for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)failed.push({path:path.relative(root,file),error:(result.stderr||result.stdout||'').trim().slice(0,700)});}return {files:files.length,failed,ok:failed.length===0};}

const build=json('dist/m26-final-local-candidate/version.json');
const graph=json('recovery/RC19_MODULE_GRAPH_REPORT.json');
const visual=json('recovery/RC19_VISUAL_QA_REPORT.json');
const integrated=json('recovery/RC19_INTEGRATED_QA_REPORT.json');
const protectedLayers=protectedComparison();
const syntax=syntaxAudit();
const catalog=json('baseline_m25_2/exercise-catalog-m25.json');
const ids=catalog.map((item)=>item.id),names=catalog.map((item)=>String(item.name_es||'').trim());
const modality=read('src/m26/domain/modality.js'),search=read('src/m26/exercises/search.js'),agenda=read('src/m26/workflows/agenda-workflow.js'),iri=read('src/m26/workflows/iri-workflow.js'),sessionController=read('src/m26/workflows/session-controller.js'),workflowController=read('src/m26/app/workflow-controller.js'),engagementController=read('src/m26/engagement/engagement-controller.js'),routes=read('src/m26/modules/route-render.js'),css=read('src/m26/shell/shell.css'),sw=read('public/m26/sw.js'),headers=read('public/m26/_headers'),runtime=read('public/m26/runtime-config.js');
const sourceScope=['src/m26','public/m26'].flatMap((dir)=>walk(abs(dir))).filter((file)=>/\.(?:js|html|css|json)$/.test(file)).map((file)=>fs.readFileSync(file,'utf8')).join('\n');
const checks=[
  ['version-local-only',build.version==='26.0.0-final-local-audit.19'&&build.status==='not_deployed'&&build.deployable===false&&build.localValidationOnly===true&&!build.productionModified&&!build.productionDeployed],
  ['build-budgets',build.budgetOk&&build.totalBytes<=build.budgets.totalLimit&&build.budgets.javascriptBytes<=build.budgets.javascriptLimit&&build.budgets.cssBytes<=build.budgets.cssLimit],
  ['module-graph',graph.ok&&graph.modules>=51&&graph.missing.length===0],
  ['syntax-audit',syntax.ok&&syntax.files>=80],
  ['protected-baselines',protectedLayers.ok&&protectedLayers.expectedFiles===122],
  ['exercise-catalog',catalog.length===367&&new Set(ids).size===367&&new Set(names).size===367&&catalog.every((item)=>item.id&&item.name_es&&item.active!==false)],
  ['command-contract',M26_COMMAND_REGISTRY.length===44&&M26_EXTENDED_COMMAND_REGISTRY.length===52&&new Set(M26_EXTENDED_COMMAND_REGISTRY.map((item)=>item.type)).size===52],
  ['canonical-modalities',/guiada_app.+guiada_en_app/.test(modality)&&/hibrido/.test(modality)&&!/value="guiada_app"/.test(routes)&&/name="modality" required/.test(routes)],
  ['appointment-validation',/modality==='presencial'/.test(agenda)&&/errors\.push\('location'\)/.test(agenda)&&/end<=start/.test(agenda)],
  ['objective-iri',/hasObjectiveMeasurement/.test(iri)&&/bodyComposition/.test(iri)&&/strengthPatterns/.test(iri)&&/value!==null&&value!==''/.test(iri)],
  ['indexed-search',/createExerciseSearchIndex/.test(search)&&/tokens\.every/.test(search)&&/catalogSearch\.search/.test(workflowController)],
  ['autosave-efficiency',/autosaveDelayMs=180/.test(sessionController)&&/clearTimeout\(autosaveTimer\)/.test(sessionController)&&/flushAutosave/.test(sessionController)&&/if\(mounted\)return/.test(sessionController)],
  ['keyboard-forms',/addEventListener\('submit',onSubmit\)/.test(workflowController)&&/addEventListener\('submit',onSubmit\)/.test(engagementController)&&/event\.preventDefault/.test(workflowController)&&/ensureValidForm/.test(engagementController)&&/type="submit"/.test(routes)],
  ['form-native-validation',!/data-workflow-form="(?:iri|planning|appointment|intelligence)"[^>]*novalidate/.test(routes)&&!/data-engagement-form="(?:checkin|habit-definition)"[^>]*novalidate/.test(routes)&&/name="bodyFatPercent" required/.test(routes)],
  ['accessible-actions',/aria-label="Registrar hoy:/.test(routes)&&/aria-live="polite"/.test(routes)&&/m26-field-help/.test(routes)],
  ['responsive-refinement',/RC19 · legibilidad/.test(css)&&/content-visibility:\s*auto/.test(css)&&!/\.m26-stack > \.m26-list-card \{ content-visibility/.test(css)&&/grid-template-columns:\s*minmax\(0,1fr\) auto/.test(css)],
  ['safe-cache-strategy',/m26-rc19/.test(sw)&&/CACHE_FIRST_PATHS/.test(sw)&&/networkFirst/.test(sw)&&/NEVER_CACHE_PREFIXES/.test(sw)&&/runtime-config/.test(sw)],
  ['visual-qa',visual.version==='26.0.0-final-local-audit.19'&&visual.case_count===15&&visual.passed===15&&visual.failed===0&&visual.results.every((item)=>item.ok&&!item.console_errors.length&&!item.page_errors.length)],
  ['integrated-qa',integrated.version==='26.0.0-final-local-audit.19'&&integrated.passed===2&&integrated.total===2&&integrated.results.every((item)=>item.ok&&!item.console_errors.length&&!item.page_errors.length)],
  ['strict-csp',/Content-Security-Policy:/.test(headers)&&!/unsafe-inline/.test(headers)&&/X-Frame-Options:\s*DENY/.test(headers)],
  ['runtime-disabled',/enabled:\s*false/.test(runtime)],
  ['no-dynamic-code',!/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(sourceScope)],
  ['no-embedded-secrets',!/eyJ[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]+|service_role\s*[:=]/i.test(sourceScope)],
  ['remote-gates-still-fail-closed',exists('scripts/remote-gates/supabase_readonly_preflight.sql')&&exists('docs/REMOTE_GATE_MATRIX_RC18.md')&&/READ_ONLY_REMOTE_GATE/.test(read('.github/workflows/remote-gates.yml'))],
];
let failures=0;const results=checks.map(([name,value])=>{const ok=Boolean(value);if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${name}`);return {name,ok};});
const report={release:'IBERFIT_M26_FINAL_LOCAL_AUDIT_RC19',version:build.version,generatedAt:new Date().toISOString(),localOnly:true,remoteGatesPassed:false,passed:checks.length-failures,total:checks.length,failed:failures,syntax,protectedLayers,checks:results,ok:failures===0};
fs.writeFileSync(abs('recovery/m26-rc19-quality-gate-results.json'),JSON.stringify(report,null,2)+'\n');console.log(`\n${report.passed}/${report.total} PASS`);if(failures)process.exit(1);
