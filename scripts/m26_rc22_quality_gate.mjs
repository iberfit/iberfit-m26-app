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
function protectedComparison(){
  const baseline=json('recovery/RC16_SHA256_MANIFEST.json');
  const expected=baseline.entries.filter((entry)=>entry.path.startsWith('legacy/')||entry.path.startsWith('baseline_m25_2/'));
  const changed=[],missing=[];
  for(const entry of expected){if(!exists(entry.path))missing.push(entry.path);else if(sha(entry.path)!==entry.sha256)changed.push(entry.path);}
  const expectedPaths=new Set(expected.map((entry)=>entry.path)),added=[];
  for(const folder of ['legacy','baseline_m25_2'])for(const file of walk(abs(folder))){const rel=path.relative(root,file).replaceAll(path.sep,'/');if(!expectedPaths.has(rel))added.push(rel);}
  const report={baseline:'RC16 protected layers',expectedFiles:expected.length,changed,missing,added,ok:expected.length===122&&!changed.length&&!missing.length&&!added.length};
  fs.writeFileSync(abs('recovery/RC22_PROTECTED_BASELINE_COMPARISON.json'),JSON.stringify(report,null,2)+'\n');return report;
}
function syntaxAudit(){
  const files=['src/m26','public/m26','scripts','qa'].flatMap((dir)=>walk(abs(dir))).filter((file)=>/\.(?:js|mjs)$/.test(file)&&!file.endsWith('_bundle.js'));
  const failed=[];
  for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)failed.push({path:path.relative(root,file),error:(result.stderr||result.stdout||'').trim().slice(0,700)});}
  return {files:files.length,failed,ok:failed.length===0};
}
const build=json('dist/m26-state-performance-ux-candidate/version.json');
const graph=json('recovery/RC22_MODULE_GRAPH_REPORT.json');
const visual=json('recovery/RC22_VISUAL_QA_REPORT.json');
const integrated=json('recovery/RC22_INTEGRATED_QA_REPORT.json');
const protectedLayers=protectedComparison(),syntax=syntaxAudit();
const catalog=json('baseline_m25_2/exercise-catalog-m25.json');
const ids=catalog.map((item)=>item.id),names=catalog.map((item)=>String(item.name_es||'').trim());
const latest=read('src/m26/platform/latest-task.js'),store=read('src/m26/canonical-store.js'),shell=read('src/m26/shell/shell-controller.js'),shellRender=read('src/m26/shell/shell-render.js'),pwa=read('src/m26/platform/pwa.js'),bus=read('src/m26/command-bus.js'),offline=read('src/m26/platform/offline-command-repository.js'),wearable=read('src/m26/wearables/controller.js'),routes=read('src/m26/modules/route-render.js'),css=read('src/m26/shell/shell.css'),sw=read('public/m26/sw.js'),runtime=read('public/m26/runtime-config.js'),transport=read('src/m26/supabase-transport.js'),preflight=read('backend/RC22_STATE_PERFORMANCE_PREFLIGHT_READONLY.sql'),headers=read('public/m26/_headers');
const sourceFiles=['src/m26','public/m26'].flatMap((dir)=>walk(abs(dir))).filter((file)=>/\.(?:js|html|css|json)$/.test(file));
const sourceScope=sourceFiles.map((file)=>fs.readFileSync(file,'utf8')).join('\n');
const checks=[
 ['version-local-only',build.version==='26.0.0-state-performance-ux.22'&&build.status==='not_deployed'&&build.deployable===false&&build.localValidationOnly===true&&!build.productionModified&&!build.productionDeployed],
 ['build-budgets',build.budgetOk&&build.totalBytes<=build.budgets.totalLimit&&build.budgets.javascriptBytes<=build.budgets.javascriptLimit&&build.budgets.cssBytes<=build.budgets.cssLimit],
 ['module-graph',graph.ok&&graph.modules>=58&&graph.missing.length===0],
 ['syntax-audit',syntax.ok&&syntax.files>=100],
 ['protected-baselines',protectedLayers.ok&&protectedLayers.expectedFiles===122],
 ['exercise-catalog',catalog.length===367&&new Set(ids).size===367&&new Set(names).size===367],
 ['command-contract',M26_COMMAND_REGISTRY.length===44&&M26_EXTENDED_COMMAND_REGISTRY.length===52],
 ['wearable-contract',Object.keys(WEARABLE_PROVIDERS).length===6&&Object.keys(WEARABLE_METRICS).length===7&&WEARABLE_CONNECTION_STATES.length===8],
 ['zero-cost-policy',Object.keys(ZERO_COST_POLICY).length===6&&ZERO_COST_POLICY.normalized_file.productionAllowed===true&&ZERO_COST_POLICY.health_connect.productionAllowed===false],
 ['latest-task-coordinator',/createLatestTaskCoordinator/.test(latest)&&/AbortController/.test(latest)&&/cancel/.test(latest)],
 ['wearable-stale-task-protection',/createLatestTaskCoordinator/.test(wearable)&&/tasks\.begin/.test(wearable)&&/tasks\.cancel/.test(wearable)],
 ['wearable-safe-actions',/Añadir resumen al check-in/.test(wearable)&&/Descargar resumen/.test(wearable)&&/Descartar vista previa/.test(wearable)],
 ['wearable-local-only',/No se ha enviado ni confirmado ningún dato/.test(wearable)&&/URL\.createObjectURL/.test(wearable)],
 ['wearable-no-raw-summary',/downloadSummary/.test(wearable)&&/Resumen descargado sin incluir el archivo original/.test(wearable)&&/acceptedCount/.test(wearable)],
 ['canonical-noop-dedupe',/sameState/.test(store)||/JSON\.stringify/.test(store)||/stateEqual/.test(store)],
 ['canonical-listener-isolation',/for \(const listener/.test(store)&&/try\{listener\(getState\(\)\)/.test(store)&&/onListenerError/.test(store)],
 ['shell-render-coalescing',/queueMicrotask/.test(shell)&&/renderQueued/.test(shell)&&/lastMarkup/.test(shell)],
 ['connectivity-initial-sync',/emitInitial/.test(pwa)&&/emitInitial:true/.test(pwa)],
 ['connectivity-dedup',/lastDelivered/.test(pwa)&&/rerun/.test(pwa)&&/shouldDeliver/.test(pwa)],
 ['retry-backoff',/retryDelayMs/.test(bus)&&/Math\.min/.test(bus)&&/5\*60\*1000/.test(bus)],
 ['retry-metadata',/attempts/.test(bus)&&/nextRetryAt/.test(bus)&&/deferred/.test(bus)],
 ['manual-retry-bypass',/nextRetryAt:null/.test(bus)&&/retry/.test(bus)],
 ['offline-owner-sealing',/ownerId/.test(offline)&&/M26_OPERATION_OWNER_REQUIRED/.test(offline)&&/schemaVersion/.test(offline)],
 ['offline-contamination-removal',/storage\.remove/.test(offline)&&/value\.ownerId/.test(offline)],
 ['skip-link',/Saltar al contenido/.test(shellRender)&&/m26-skip-link/.test(css)],
 ['aria-current-active-only',/aria-current="page"/.test(shellRender)&&!/aria-current="false"/.test(shellRender)],
 ['live-operation-status',/role="status"/.test(shellRender)&&/aria-live="polite"/.test(shellRender)&&/aria-atomic="true"/.test(shellRender)],
 ['access-busy',/aria-busy/.test(shellRender)],
 ['main-labelled',/aria-labelledby="m26-page-title"/.test(shellRender)&&/id="m26-page-title"/.test(shellRender)],
 ['reduced-motion',/prefers-reduced-motion/.test(css)],
 ['verification-retry-copy',/Reintentar ahora/.test(routes)&&/nextRetryAt/.test(routes)&&/Intentos:/.test(routes)],
 ['runtime-version',/26\.0\.0-state-performance-ux\.22/.test(runtime)],
 ['client-info-versioned',/iberfit-m26-web\/\$\{runtime\.version\}/.test(transport)],
 ['service-worker-version',/m26-rc22/.test(sw)&&/m26-rc21/.test(sw)&&/NEVER_CACHE_PREFIXES/.test(sw)],
 ['visual-qa',visual.version===build.version&&visual.case_count===20&&visual.passed===20&&visual.failed===0&&visual.results.every((item)=>item.ok&&!item.console_errors.length&&!item.page_errors.length)],
 ['integrated-qa',integrated.version===build.version&&integrated.passed===2&&integrated.total===2&&integrated.results.every((item)=>item.ok&&!item.console_errors.length&&!item.page_errors.length)],
 ['visual-new-cases',visual.results.some((item)=>/actividad_preview/.test(item.case?.name||''))&&visual.results.some((item)=>/verificacion_retry/.test(item.case?.name||''))],
 ['preflight-readonly',!/\b(create|alter|drop|insert|update|delete|truncate|grant|revoke)\b/i.test(preflight.replace(/^--.*$/gm,''))],
 ['strict-csp',/Content-Security-Policy:/.test(headers)&&!/unsafe-inline/.test(headers)&&/X-Frame-Options:\s*DENY/.test(headers)],
 ['runtime-disabled',/enabled:\s*false/.test(runtime)],
 ['no-dynamic-code',!/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(sourceScope)],
 ['no-embedded-secrets',!/eyJ[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]+|service_role\s*[:=]/i.test(sourceScope)],
 ['rc22-docs',exists('docs/RC22_STATE_PERFORMANCE_UX.md')&&/backoff exponencial/i.test(read('docs/RC22_STATE_PERFORMANCE_UX.md'))],
 ['rc22-tests',exists('tests/m26_rc22_sync_performance_accessibility.test.mjs')&&/latest-task/i.test(read('tests/m26_rc22_sync_performance_accessibility.test.mjs'))],
 ['remote-gates-fail-closed',exists('docs/REMOTE_GATE_MATRIX_RC18.md')&&exists('backend/RC22_STATE_PERFORMANCE_PREFLIGHT_READONLY.sql')],
 ['no-stale-runtime-marker',!/iberfit-m26-hardening-rc17|26\.0\.0-rc17/.test(sourceScope)],
];
let failures=0;
const results=checks.map(([name,value])=>{const ok=Boolean(value);if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${name}`);return {name,ok};});
const report={release:'IBERFIT_M26_STATE_PERFORMANCE_UX_RC22',version:build.version,generatedAt:new Date().toISOString(),localOnly:true,remoteGatesPassed:false,passed:checks.length-failures,total:checks.length,failed:failures,syntax,protectedLayers,checks:results,ok:failures===0};
fs.writeFileSync(abs('recovery/m26-rc22-quality-gate-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(`\n${report.passed}/${report.total} PASS`);
if(failures) process.exit(1);
