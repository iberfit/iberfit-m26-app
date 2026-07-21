import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {M26_COMMAND_REGISTRY,M26_EXTENDED_COMMAND_REGISTRY} from '../src/m26/command-catalog.js';
import {WEARABLE_PROVIDERS,WEARABLE_METRICS} from '../src/m26/wearables/contracts.js';
import {ZERO_COST_POLICY} from '../src/m26/wearables/free-policy.js';
import {WEARABLE_CONNECTION_STATES} from '../src/m26/wearables/connection-state.js';

const root=process.cwd();
const abs=(p)=>path.join(root,p),exists=(p)=>fs.existsSync(abs(p)),read=(p)=>fs.readFileSync(abs(p),'utf8'),json=(p)=>JSON.parse(read(p));
const sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(abs(p))).digest('hex');
function walk(dir,files=[]){if(!fs.existsSync(dir))return files;for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const target=path.join(dir,entry.name);if(entry.isDirectory())walk(target,files);else files.push(target);}return files;}
function protectedComparison(){const baseline=json('recovery/RC16_SHA256_MANIFEST.json');const expected=baseline.entries.filter((entry)=>entry.path.startsWith('legacy/')||entry.path.startsWith('baseline_m25_2/'));const changed=[],missing=[];for(const entry of expected){if(!exists(entry.path))missing.push(entry.path);else if(sha(entry.path)!==entry.sha256)changed.push(entry.path);}const expectedPaths=new Set(expected.map((entry)=>entry.path));const added=[];for(const folder of ['legacy','baseline_m25_2'])for(const file of walk(abs(folder))){const rel=path.relative(root,file).replaceAll(path.sep,'/');if(!expectedPaths.has(rel))added.push(rel);}const report={baseline:'RC16 protected layers',expectedFiles:expected.length,changed,missing,added,ok:expected.length===122&&!changed.length&&!missing.length&&!added.length};fs.writeFileSync(abs('recovery/RC21_PROTECTED_BASELINE_COMPARISON.json'),JSON.stringify(report,null,2)+'\n');return report;}
function syntaxAudit(){const files=['src/m26','public/m26','scripts','qa'].flatMap((dir)=>walk(abs(dir))).filter((file)=>/\.(?:js|mjs)$/.test(file)&&!file.endsWith('_bundle.js'));const failed=[];for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)failed.push({path:path.relative(root,file),error:(result.stderr||result.stdout||'').trim().slice(0,700)});}return {files:files.length,failed,ok:failed.length===0};}

const build=json('dist/m26-free-integrations-ux-candidate/version.json');
const graph=json('recovery/RC21_MODULE_GRAPH_REPORT.json');
const visual=json('recovery/RC21_VISUAL_QA_REPORT.json');
const integrated=json('recovery/RC21_INTEGRATED_QA_REPORT.json');
const protectedLayers=protectedComparison(),syntax=syntaxAudit();
const catalog=json('baseline_m25_2/exercise-catalog-m25.json');
const ids=catalog.map((item)=>item.id),names=catalog.map((item)=>String(item.name_es||'').trim());
const policy=read('src/m26/wearables/free-policy.js'),stateMachine=read('src/m26/wearables/connection-state.js'),normalization=read('src/m26/wearables/normalization.js'),controller=read('src/m26/wearables/controller.js'),routes=read('src/m26/modules/route-render.js'),css=read('src/m26/shell/shell.css'),sw=read('public/m26/sw.js'),preflight=read('backend/RC21_FREE_INTEGRATIONS_PREFLIGHT_READONLY.sql'),headers=read('public/m26/_headers'),runtime=read('public/m26/runtime-config.js');
const sourceScope=['src/m26','public/m26'].flatMap((dir)=>walk(abs(dir))).filter((file)=>/\.(?:js|html|css|json)$/.test(file)).map((file)=>fs.readFileSync(file,'utf8')).join('\n');
const checks=[
 ['version-local-only',build.version==='26.0.0-free-integrations-ux.21'&&build.status==='not_deployed'&&build.deployable===false&&build.localValidationOnly===true&&!build.productionModified&&!build.productionDeployed],
 ['build-budgets',build.budgetOk&&build.totalBytes<=build.budgets.totalLimit&&build.budgets.javascriptBytes<=build.budgets.javascriptLimit&&build.budgets.cssBytes<=build.budgets.cssLimit],
 ['module-graph',graph.ok&&graph.modules>=57&&graph.missing.length===0],
 ['syntax-audit',syntax.ok&&syntax.files>=95],
 ['protected-baselines',protectedLayers.ok&&protectedLayers.expectedFiles===122],
 ['exercise-catalog',catalog.length===367&&new Set(ids).size===367&&new Set(names).size===367],
 ['command-contract',M26_COMMAND_REGISTRY.length===44&&M26_EXTENDED_COMMAND_REGISTRY.length===52],
 ['provider-contract',Object.keys(WEARABLE_PROVIDERS).length===6&&Object.keys(WEARABLE_METRICS).length===7],
 ['zero-cost-policy-six',Object.keys(ZERO_COST_POLICY).length===6],
 ['free-now-local-file',ZERO_COST_POLICY.normalized_file.productionAllowed===true&&ZERO_COST_POLICY.normalized_file.developmentAllowed===true],
 ['health-connect-development',ZERO_COST_POLICY.health_connect.developmentAllowed===true&&ZERO_COST_POLICY.health_connect.productionAllowed===false],
 ['apple-cost-block',ZERO_COST_POLICY.apple_health.developmentAllowed===false&&/M26_ZERO_COST_POLICY_BLOCKED/.test(policy)],
 ['garmin-partner-block',ZERO_COST_POLICY.garmin_connect.developmentAllowed===false&&/M26_PARTNER_OR_COMMERCIAL_ACCESS_REQUIRED/.test(policy)],
 ['google-health-adapter',WEARABLE_PROVIDERS.fitbit.label.includes('Google Health API')&&/google_health_api:'fitbit'/.test(read('src/m26/wearables/contracts.js'))],
 ['connection-states',WEARABLE_CONNECTION_STATES.length===8&&/M26_WEARABLE_TRANSITION_INVALID/.test(stateMachine)&&/TRANSITIONS/.test(stateMachine)],
 ['blocked-state-downgrade',/!policy\?\.developmentAllowed/.test(stateMachine)&&/next='unavailable'/.test(stateMachine)],
 ['safe-error-messages',/wearableErrorMessage/.test(stateMachine)&&/SAFE_ERROR_CODES/.test(stateMachine)],
 ['async-import-yield',/parseWearableExportTextAsync/.test(normalization)&&/scheduler\?\.yield/.test(normalization)&&/requestIdleCallback/.test(normalization)],
 ['async-import-abort',/M26_WEARABLE_IMPORT_ABORTED/.test(normalization)&&/AbortController/.test(controller)],
 ['double-submit-guard',/aria-busy/.test(controller)&&/setFormBusy/.test(controller)],
 ['preview-focus',/data-wearable-preview-title/.test(controller)&&/\.focus\?\./.test(controller)],
 ['local-import-only',/no se ha sincronizado nada/i.test(controller)&&/file\.text\(\)/.test(controller)&&/URL\.createObjectURL/.test(controller)],
 ['ux-zero-cost-copy',/Plan gratuito de integraciones/.test(routes)&&/Solo vista previa local · gratuito/.test(routes)&&/Coste cero/.test(routes)],
 ['no-fake-connect-action',!/data-wearable-action="connect/.test(routes)&&!/Conectar Apple Health/.test(routes)&&!/Conectar Garmin/.test(routes)],
 ['coach-read-only',/Coach recibe únicamente resúmenes confirmados/.test(routes)],
 ['non-clinical-language',/nunca diagnósticos/.test(routes)&&/No transforma datos de wearable en indicaciones clínicas/.test(routes)],
 ['responsive-free-policy',/RC21 · free integrations/.test(css)&&/prefers-reduced-motion/.test(css)],
 ['safe-cache-strategy',/m26-rc21/.test(sw)&&/NEVER_CACHE_PREFIXES/.test(sw)&&/runtime-config/.test(sw)],
 ['visual-qa',visual.version==='26.0.0-free-integrations-ux.21'&&visual.case_count===18&&visual.passed===18&&visual.failed===0&&visual.results.every((item)=>item.ok&&!item.console_errors.length&&!item.page_errors.length)],
 ['integrated-qa',integrated.version==='26.0.0-free-integrations-ux.21'&&integrated.passed===2&&integrated.total===2&&integrated.results.every((item)=>item.ok&&!item.console_errors.length&&!item.page_errors.length)],
 ['preflight-readonly',!/\b(create|alter|drop|insert|update|delete|truncate|grant|revoke)\b/i.test(preflight.replace(/^--.*$/gm,''))],
 ['strict-csp',/Content-Security-Policy:/.test(headers)&&!/unsafe-inline/.test(headers)&&/X-Frame-Options:\s*DENY/.test(headers)],
 ['runtime-disabled',/enabled:\s*false/.test(runtime)],
 ['no-dynamic-code',!/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(sourceScope)],
 ['no-embedded-secrets',!/eyJ[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]+|service_role\s*[:=]/i.test(sourceScope)],
 ['remote-gates-fail-closed',exists('docs/REMOTE_GATE_MATRIX_RC18.md')&&exists('backend/RC21_FREE_INTEGRATIONS_PREFLIGHT_READONLY.sql')],
 ['rc21-docs',exists('docs/RC21_FREE_INTEGRATIONS_UX.md')&&/política de coste cero/i.test(read('docs/RC21_FREE_INTEGRATIONS_UX.md'))],
 ['state-fuzz-test',exists('tests/m26_rc21_free_integrations_state_fuzz.test.mjs')&&/1500/.test(read('tests/m26_rc21_free_integrations_state_fuzz.test.mjs'))],
];
let failures=0;const results=checks.map(([name,value])=>{const ok=Boolean(value);if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${name}`);return {name,ok};});
const report={release:'IBERFIT_M26_FREE_INTEGRATIONS_UX_RC21',version:build.version,generatedAt:new Date().toISOString(),localOnly:true,remoteGatesPassed:false,passed:checks.length-failures,total:checks.length,failed:failures,syntax,protectedLayers,checks:results,ok:failures===0};
fs.writeFileSync(abs('recovery/m26-rc21-quality-gate-results.json'),JSON.stringify(report,null,2)+'\n');console.log(`\n${report.passed}/${report.total} PASS`);if(failures)process.exit(1);
