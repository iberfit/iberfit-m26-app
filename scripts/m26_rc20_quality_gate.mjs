import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {M26_COMMAND_REGISTRY,M26_EXTENDED_COMMAND_REGISTRY} from '../src/m26/command-catalog.js';
import {WEARABLE_PROVIDERS,WEARABLE_METRICS} from '../src/m26/wearables/contracts.js';

const root=process.cwd();
const abs=(p)=>path.join(root,p),exists=(p)=>fs.existsSync(abs(p)),read=(p)=>fs.readFileSync(abs(p),'utf8'),json=(p)=>JSON.parse(read(p));
const sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(abs(p))).digest('hex');
function walk(dir,files=[]){if(!fs.existsSync(dir))return files;for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const target=path.join(dir,entry.name);if(entry.isDirectory())walk(target,files);else files.push(target);}return files;}
function protectedComparison(){const baseline=json('recovery/RC16_SHA256_MANIFEST.json');const expected=baseline.entries.filter((entry)=>entry.path.startsWith('legacy/')||entry.path.startsWith('baseline_m25_2/'));const changed=[],missing=[];for(const entry of expected){if(!exists(entry.path))missing.push(entry.path);else if(sha(entry.path)!==entry.sha256)changed.push(entry.path);}const expectedPaths=new Set(expected.map((entry)=>entry.path));const added=[];for(const folder of ['legacy','baseline_m25_2'])for(const file of walk(abs(folder))){const rel=path.relative(root,file).replaceAll(path.sep,'/');if(!expectedPaths.has(rel))added.push(rel);}const report={baseline:'RC16 protected layers',expectedFiles:expected.length,changed,missing,added,ok:expected.length===122&&!changed.length&&!missing.length&&!added.length};fs.writeFileSync(abs('recovery/RC20_PROTECTED_BASELINE_COMPARISON.json'),JSON.stringify(report,null,2)+'\n');return report;}
function syntaxAudit(){const files=['src/m26','public/m26','scripts','qa'].flatMap((dir)=>walk(abs(dir))).filter((file)=>/\.(?:js|mjs)$/.test(file)&&!file.endsWith('_bundle.js'));const failed=[];for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)failed.push({path:path.relative(root,file),error:(result.stderr||result.stdout||'').trim().slice(0,700)});}return {files:files.length,failed,ok:failed.length===0};}

const build=json('dist/m26-performance-wearables-candidate/version.json');
const graph=json('recovery/RC20_MODULE_GRAPH_REPORT.json');
const visual=json('recovery/RC20_VISUAL_QA_REPORT.json');
const integrated=json('recovery/RC20_INTEGRATED_QA_REPORT.json');
const protectedLayers=protectedComparison();const syntax=syntaxAudit();
const catalog=json('baseline_m25_2/exercise-catalog-m25.json');
const ids=catalog.map((item)=>item.id),names=catalog.map((item)=>String(item.name_es||'').trim());
const production=read('src/m26/production-state.js'),normalization=read('src/m26/wearables/normalization.js'),contracts=read('src/m26/wearables/contracts.js'),bridge=read('src/m26/wearables/bridge-service.js'),controller=read('src/m26/wearables/controller.js'),routes=read('src/m26/modules/route-render.js'),progress=read('src/m26/engagement/progress-engine.js'),application=read('src/m26/app/application.js'),css=read('src/m26/shell/shell.css'),sw=read('public/m26/sw.js'),migration=read('backend/RC20_WEARABLES_MIGRATION_GUARDED.sql'),preflight=read('backend/RC20_WEARABLES_PREFLIGHT_READONLY.sql'),headers=read('public/m26/_headers'),runtime=read('public/m26/runtime-config.js');
const sourceScope=['src/m26','public/m26'].flatMap((dir)=>walk(abs(dir))).filter((file)=>/\.(?:js|html|css|json)$/.test(file)).map((file)=>fs.readFileSync(file,'utf8')).join('\n');
const checks=[
 ['version-local-only',build.version==='26.0.0-performance-wearables.20'&&build.status==='not_deployed'&&build.deployable===false&&build.localValidationOnly===true&&!build.productionModified&&!build.productionDeployed],
 ['build-budgets',build.budgetOk&&build.totalBytes<=build.budgets.totalLimit&&build.budgets.javascriptBytes<=build.budgets.javascriptLimit&&build.budgets.cssBytes<=build.budgets.cssLimit],
 ['module-graph',graph.ok&&graph.modules>=55&&graph.missing.length===0],
 ['syntax-audit',syntax.ok&&syntax.files>=90],
 ['protected-baselines',protectedLayers.ok&&protectedLayers.expectedFiles===122],
 ['exercise-catalog',catalog.length===367&&new Set(ids).size===367&&new Set(names).size===367],
 ['command-contract',M26_COMMAND_REGISTRY.length===44&&M26_EXTENDED_COMMAND_REGISTRY.length===52],
 ['provider-contract',Object.keys(WEARABLE_PROVIDERS).length===6&&/native_bridge/.test(contracts)&&/server_oauth/.test(contracts)&&/local_preview/.test(contracts)],
 ['metric-contract',Object.keys(WEARABLE_METRICS).length===7&&/restingHeartRate/.test(contracts)&&/hrvMs/.test(contracts)&&/sleepMinutes/.test(contracts)],
 ['wearable-collections',/wearableConnections/.test(production)&&/wearableDailySummaries/.test(production)&&/wearableSyncRuns/.test(production)],
 ['client-isolation',/CLIENT_SCOPED_COLLECTIONS/.test(production)&&/restrictCollectionsForIdentity/.test(production)],
 ['normalization-bounds',/MAX_EXPORT_BYTES=5_000_000/.test(normalization)&&/MAX_EXPORT_ROWS=10_000/.test(normalization)&&/definition\.min/.test(normalization)&&/definition\.max/.test(normalization)],
 ['deduplication',/clientId\}\|\$\{item\.provider\}\|\$\{item\.date\}/.test(normalization)&&/sourceUpdatedAt/.test(normalization)],
 ['missing-remains-null',/return null/.test(normalization)&&!/Math\.max\(definition\.min/.test(normalization)],
 ['local-import-only',/no se ha sincronizado nada/i.test(controller)&&/file\.text\(\)/.test(controller)&&/URL\.createObjectURL/.test(controller)],
 ['bridge-scope-minimization',/READ_SCOPES/.test(bridge)&&/filter\(\(item\)=>READ_SCOPES\.includes/.test(bridge)&&/M26_WEARABLE_NATIVE_BRIDGE_UNAVAILABLE/.test(bridge)],
 ['bridge-client-integrity',/result\.value\.clientId===id/.test(bridge)&&/M26_WEARABLE_CLIENT_REQUIRED/.test(bridge)],
 ['client-controls-consent',/wearable\.canControl/.test(routes)&&/Control del cliente/.test(routes)&&/El cliente decide/.test(routes)],
 ['coach-read-only',/Coach recibe únicamente resúmenes confirmados/.test(routes)&&/data-wearable-import/.test(routes)],
 ['no-fake-connect-action',!/data-wearable-action="connect/.test(routes)&&!/Conectar Apple Health/.test(routes)],
 ['non-clinical-language',/nunca diagnósticos/.test(routes)&&/No transforma datos de wearable en indicaciones clínicas/.test(routes)&&/no en sustitución/.test(routes)],
 ['progress-complement',/summarizeWearableData/.test(progress)&&/wearable/.test(progress)&&/Actividad de dispositivo/.test(routes)],
 ['responsive-wearables',/RC20 · wearables/.test(css)&&/m26-wearable-source/.test(css)&&/@media\(max-width:420px\)/.test(css)],
 ['application-controller',/createWearableController/.test(application)&&/wearables\.mount/.test(application)&&/wearables\?\.destroy/.test(application)&&!application.includes('destroyControllers();sessionUi=null;\n    destroyControllers();')],
 ['safe-cache-strategy',/m26-rc20/.test(sw)&&/NEVER_CACHE_PREFIXES/.test(sw)&&/runtime-config/.test(sw)],
 ['visual-qa',visual.version==='26.0.0-performance-wearables.20'&&visual.case_count===18&&visual.passed===18&&visual.failed===0&&visual.results.every((item)=>item.ok&&!item.console_errors.length&&!item.page_errors.length)],
 ['integrated-qa',integrated.version==='26.0.0-performance-wearables.20'&&integrated.passed===2&&integrated.total===2&&integrated.results.every((item)=>item.ok&&!item.console_errors.length&&!item.page_errors.length)],
 ['guarded-migration',/allow_rc20_wearables/.test(migration)&&/REMOTE_BOOTSTRAP_AND_WRITE_PATH_REQUIRED/.test(migration)&&/rollback;\s*$/.test(migration)],
 ['rls-read-only',((migration.match(/enable row level security/g)||[]).length===3)&&!/create policy .* for (insert|update|delete)/i.test(migration)&&/revoke all .* from anon/g.test(migration)],
 ['token-protection',/access_token/.test(migration)&&/refresh_token/.test(migration)&&/cursor_encrypted bytea/.test(migration)],
 ['preflight-readonly',!/\b(create|alter|drop|insert|update|delete|truncate|grant|revoke)\b/i.test(preflight.replace(/^--.*$/gm,''))],
 ['strict-csp',/Content-Security-Policy:/.test(headers)&&!/unsafe-inline/.test(headers)&&/X-Frame-Options:\s*DENY/.test(headers)],
 ['runtime-disabled',/enabled:\s*false/.test(runtime)],
 ['no-dynamic-code',!/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(sourceScope)],
 ['no-embedded-secrets',!/eyJ[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]+|service_role\s*[:=]/i.test(sourceScope)],
 ['remote-gates-fail-closed',exists('docs/REMOTE_GATE_MATRIX_RC18.md')&&exists('backend/RC20_WEARABLES_PREFLIGHT_READONLY.sql')],
];
let failures=0;const results=checks.map(([name,value])=>{const ok=Boolean(value);if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${name}`);return {name,ok};});
const report={release:'IBERFIT_M26_PERFORMANCE_WEARABLES_RC20',version:build.version,generatedAt:new Date().toISOString(),localOnly:true,remoteGatesPassed:false,passed:checks.length-failures,total:checks.length,failed:failures,syntax,protectedLayers,checks:results,ok:failures===0};
fs.writeFileSync(abs('recovery/m26-rc20-quality-gate-results.json'),JSON.stringify(report,null,2)+'\n');console.log(`\n${report.passed}/${report.total} PASS`);if(failures)process.exit(1);
