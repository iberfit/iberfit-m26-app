import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {M26_COMMAND_REGISTRY,M26_EXTENDED_COMMAND_REGISTRY} from '../src/m26/command-catalog.js';
import {WEARABLE_PROVIDERS,WEARABLE_METRICS} from '../src/m26/wearables/contracts.js';
import {ZERO_COST_POLICY} from '../src/m26/wearables/free-policy.js';
import {WEARABLE_CONNECTION_STATES} from '../src/m26/wearables/connection-state.js';
import {IBERFIT_UI_LOCALE} from '../src/m26/ui/castellano.js';

const root=process.cwd();
const VERSION='26.0.0-cierre-local-maximo.28';
const RELEASE='IBERFIT_M26_CIERRE_LOCAL_MAXIMO_RC28';
const abs=(p)=>path.join(root,p);
const exists=(p)=>fs.existsSync(abs(p));
const read=(p)=>fs.readFileSync(abs(p),'utf8');
const json=(p)=>JSON.parse(read(p));
const sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(abs(p))).digest('hex');
function walk(dir,files=[]){
  if(!fs.existsSync(dir))return files;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(entry.name==='.git'||entry.name==='__pycache__')continue;
    const target=path.join(dir,entry.name);
    if(entry.isDirectory())walk(target,files);else files.push(target);
  }
  return files;
}
function protectedComparison(){
  const baseline=json('recovery/RC16_SHA256_MANIFEST.json');
  const expected=baseline.entries.filter((entry)=>entry.path.startsWith('legacy/')||entry.path.startsWith('baseline_m25_2/'));
  const changed=[],missing=[];
  for(const entry of expected){
    if(!exists(entry.path))missing.push(entry.path);
    else if(sha(entry.path)!==entry.sha256)changed.push(entry.path);
  }
  const expectedPaths=new Set(expected.map((entry)=>entry.path));
  const added=[];
  for(const folder of ['legacy','baseline_m25_2']){
    for(const file of walk(abs(folder))){
      const rel=path.relative(root,file).replaceAll(path.sep,'/');
      if(!expectedPaths.has(rel))added.push(rel);
    }
  }
  const report={baseline:'RC16 protected layers',expectedFiles:expected.length,changed,missing,added,ok:expected.length===122&&!changed.length&&!missing.length&&!added.length};
  fs.writeFileSync(abs('recovery/RC28_PROTECTED_BASELINE_COMPARISON.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}
function syntaxAudit(){
  const files=['src/m26','public/m26','scripts','qa']
    .flatMap((dir)=>walk(abs(dir)))
    .filter((file)=>/\.(?:js|mjs)$/.test(file)&&!file.endsWith('_bundle.js'));
  const failed=[];
  for(const file of files){
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    if(result.status!==0)failed.push({path:path.relative(root,file),error:(result.stderr||result.stdout||'').trim().slice(0,700)});
  }
  return {files:files.length,failed,ok:failed.length===0};
}

const build=json('dist/m26-cierre-local-maximo-candidate/version.json');
const graph=json('recovery/RC28_MODULE_GRAPH_REPORT.json');
const visual=json('recovery/RC28_VISUAL_QA_REPORT.json');
const integrated=json('recovery/RC28_INTEGRATED_QA_REPORT.json');
const castellano=json('recovery/RC28_CASTELLANO_GATE_REPORT.json');
const qaVerification=json('recovery/RC28_QA_REPORT_VERIFICATION.json');
const protectedLayers=protectedComparison();
const syntax=syntaxAudit();
const catalog=json('baseline_m25_2/exercise-catalog-m25.json');
const ids=catalog.map((item)=>item.id);
const names=catalog.map((item)=>String(item.name_es||'').trim());

const route=read('src/m26/modules/route-render.js');
const shellRender=read('src/m26/shell/shell-render.js');
const shellCss=read('src/m26/shell/shell.css');
const locale=read('src/m26/ui/castellano.js');
const exerciseLocale=read('src/m26/exercises/castellano.js');
const modality=read('src/m26/domain/modality.js');
const wearable=read('src/m26/wearables/controller.js');
const latest=read('src/m26/platform/latest-task.js');
const store=read('src/m26/canonical-store.js');
const shell=read('src/m26/shell/shell-controller.js');
const pwa=read('src/m26/platform/pwa.js');
const bus=read('src/m26/command-bus.js');
const offlineRepo=read('src/m26/platform/offline-command-repository.js');
const sw=read('public/m26/sw.js');
const runtime=read('public/m26/runtime-config.js');
const transport=read('src/m26/supabase-transport.js');
const headers=read('public/m26/_headers');
const preflight=read('backend/RC22_STATE_PERFORMANCE_PREFLIGHT_READONLY.sql');
const index=read('public/m26/index.html');
const offlinePage=read('public/m26/offline.html');
const manifest=json('public/m26/manifest.webmanifest');
const sourceFiles=['src/m26','public/m26'].flatMap((dir)=>walk(abs(dir))).filter((file)=>/\.(?:js|html|css|json)$/.test(file));
const sourceScope=sourceFiles.map((file)=>fs.readFileSync(file,'utf8')).join('\n');
const visualNoLanguageHits=visual.results.every((item)=>item.ok&&item.metrics?.documentLanguage==='es-ES'&&item.metrics?.forbiddenLanguageHits?.length===0&&item.metrics?.clientEditorialHits?.length===0&&!item.console_errors.length&&!item.page_errors.length);
const integratedNoLanguageHits=integrated.results.every((item)=>item.ok&&item.routes.every((entry)=>entry.metrics?.documentLanguage==='es-ES'&&entry.metrics?.forbiddenLanguageHits?.length===0&&entry.metrics?.clientEditorialHits?.length===0)&&item.finalMetrics?.documentLanguage==='es-ES'&&item.finalMetrics?.forbiddenLanguageHits?.length===0&&!item.console_errors.length&&!item.page_errors.length);
const strippedPreflight=preflight.replace(/^--.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');

const publicationWorkflow=read('src/m26/workflows/publication-workflow.js');
const reportWorkflow=read('src/m26/workflows/report-workflow.js');
const workflowController=read('src/m26/app/workflow-controller.js');
const roleProjection=read('src/m26/security/role-projection.js');
const interactiveAudit=read('src/m26/ui/interactive-audit.js');
const clientContent=read('src/m26/publication/client-content.js');
const routeViewModel=read('src/m26/modules/route-view-model.js');
const checks=[
 ['version-local-only',build.version===VERSION&&build.status==='not_deployed'&&build.deployable===false&&build.localValidationOnly===true&&!build.productionModified&&!build.productionDeployed],
 ['locale-build',build.locale==='es-ES'&&IBERFIT_UI_LOCALE==='es-ES'],
 ['build-budgets',build.budgetOk&&build.totalBytes<=build.budgets.totalLimit&&build.budgets.javascriptBytes<=build.budgets.javascriptLimit&&build.budgets.cssBytes<=build.budgets.cssLimit],
 ['module-graph',graph.ok&&graph.version===VERSION&&graph.modules>=64&&graph.missing.length===0],
 ['syntax-audit',syntax.ok&&syntax.files>=100],
 ['protected-baselines',protectedLayers.ok&&protectedLayers.expectedFiles===122],
 ['exercise-catalog',catalog.length===367&&new Set(ids).size===367&&new Set(names).size===367&&names.every(Boolean)],
 ['command-contract',M26_COMMAND_REGISTRY.length===44&&M26_EXTENDED_COMMAND_REGISTRY.length===52],
 ['publication-state-machine',/M26_PUBLICATION_PREVIEW_REQUIRED/.test(publicationWorkflow)&&/M26_PUBLICATION_REASON_REQUIRED/.test(publicationWorkflow)&&/visibleToClient=true/.test(publicationWorkflow)],
 ['approve-publish-separation',/SESION_APROBAR/.test(publicationWorkflow)&&/SESION_PUBLICAR/.test(publicationWorkflow)&&/INFORME_APROBAR/.test(publicationWorkflow)&&/INFORME_PUBLICAR/.test(publicationWorkflow)],
 ['report-editorial-validation',/assessmentId/.test(reportWorkflow)&&/reviewAccepted/.test(reportWorkflow)&&/a4-premium/.test(reportWorkflow)&&/visibleToClient:false/.test(reportWorkflow)],
 ['publication-online-only',/M26_OFFLINE_PUBLICATION_NOT_ALLOWED/.test(workflowController)&&/isOnline/.test(workflowController)],
 ['publication-no-optimistic-mutation',!/collections\.(?:sessions|reports|trainingCycles)\s*=/.test(workflowController)&&/commandBus\.execute/.test(workflowController)],
 ['client-projection-published-only',/PUBLICATION_SCOPED/.test(roleProjection)&&/PRIVATE_STATUSES/.test(roleProjection)&&/M26_CLIENT_UNPUBLISHED_EXPOSED/.test(roleProjection)],
 ['client-field-allowlists',/SENSITIVE_CLIENT_KEYS/.test(roleProjection)&&/projectRecordForClient/.test(roleProjection)&&/safeSessionBlocks/.test(roleProjection)&&/assertNoSensitiveKeys/.test(roleProjection)],
 ['client-unknown-collections-fail-closed',/if\(!list\)return null/.test(roleProjection)&&/filter\(Boolean\)/.test(roleProjection)],
 ['client-publication-vm-minimal',/if\(role==='client'\)return Object\.freeze\(\{id:clientContent\.id/.test(routeViewModel)&&!/if\(role==='client'\)[^;]+raw/.test(routeViewModel)],
 ['client-content-safe-module',/clientContentView/.test(clientContent)&&/MAX_BLOCKS=80/.test(clientContent)&&/MAX_SECTION_TEXT=2500/.test(clientContent)&&/M26_CLIENT_CONTENT_ENTITY_INVALID/.test(clientContent)],
 ['client-exact-session-selection',/dataset\?\.entityId/.test(workflowController)&&/candidates\.find/.test(workflowController)&&/M26_SESSION_PUBLISHED_REQUIRED/.test(workflowController)],
 ['coach-exact-client-preview',/Así lo verá el cliente/.test(route)&&/Contenido completo que recibirá el cliente/.test(route)&&/clientContentBody\(item\.clientContent,\{preview:true\}\)/.test(route)],
 ['client-no-editorial-copy',visual.results.filter((item)=>item.case?.role==='client'&&['planificacion','sesion','informes'].includes(item.case?.route)).every((item)=>item.metrics?.clientEditorialHits?.length===0)],
 ['client-private-markers-absent',integrated.results.filter((item)=>item.role==='client').every((item)=>item.privacy?.containsPrivateMarker===false&&item.privacy?.containsRaw===false)],
 ['integrated-selected-session',integrated.results.find((item)=>item.role==='client')?.actions?.some((item)=>item.name==='selected-session'&&item.ok===true)],
 ['publication-actions-registered',/'manage-publication'/.test(interactiveAudit)&&/'approve-report'/.test(interactiveAudit)],
 ['wearable-contract',Object.keys(WEARABLE_PROVIDERS).length===6&&Object.keys(WEARABLE_METRICS).length===7&&WEARABLE_CONNECTION_STATES.length===8],
 ['zero-cost-policy',Object.keys(ZERO_COST_POLICY).length===6&&ZERO_COST_POLICY.normalized_file.productionAllowed===true&&ZERO_COST_POLICY.health_connect.developmentAllowed===true&&ZERO_COST_POLICY.apple_health.developmentAllowed===false&&ZERO_COST_POLICY.garmin_connect.developmentAllowed===false],
 ['castellano-gate',castellano.ok&&castellano.passed===16&&castellano.failed===0],
 ['document-language',/<html lang="es-ES">/.test(index)&&/<html lang="es-ES">/.test(offlinePage)&&manifest.lang==='es-ES'],
 ['castellano-statuses',/ready:\s*'Preparado'/.test(locale)&&/pending:\s*'Pendiente'/.test(locale)&&/rejected:\s*'Rechazada'/.test(locale)&&/unavailable:\s*'No disponible'/.test(locale)],
 ['castellano-sources',/checkin:\s*'Registro de bienestar'/.test(locale)&&/wearable:\s*'Datos de dispositivos'/.test(locale)&&/cloud:\s*'Servicio en línea'/.test(locale)],
 ['castellano-operations',/castilianOperationTitle/.test(locale)&&/castilianOperationDetail/.test(locale)&&/Operación IBERFIT/.test(locale)],
 ['castellano-modalities',/Guiada en la aplicación/.test(modality)&&/En línea/.test(modality)],
 ['castellano-visible-copy',/Enviar registro de bienestar/.test(route)&&/El entrenador recibe únicamente resúmenes confirmados/.test(route)&&/VFC media/.test(route)&&/Notas privadas del entrenador/.test(route)],
 ['castellano-exercise-layer',/localiseExerciseForDisplay/.test(exerciseLocale)&&/Apertura de cadera en decúbito lateral/.test(exerciseLocale)&&/Sentadilla en máquina inclinada/.test(exerciseLocale)&&/Ritmo de ejecución/.test(read('src/m26/workflows/session-ui.js'))],
 ['castellano-downloads',/iberfit-plantilla-dispositivos\.json/.test(wearable)&&/iberfit-resumen-dispositivos-/.test(wearable)],
 ['castellano-plurals',/countLabel/.test(route)&&!/1 hábitos|1 informes|1 citas|1 sesiones|1 notas|1 registros/.test(visual.results.map((item)=>item.metrics?.visibleLanguage||'').join('\n'))],
 ['access-responsive-fix',/m26-access-frame/.test(shellCss)&&/box-sizing:\s*border-box/.test(shellCss)&&/@media\s*\(max-width:\s*580px\)/.test(shellCss)],
 ['visual-qa',visual.version===VERSION&&visual.case_count===40&&visual.passed===40&&visual.failed===0&&visualNoLanguageHits],
 ['visual-access-states',visual.results.some((item)=>item.case?.name==='acceso_confirmando_mobile')&&visual.results.some((item)=>item.case?.name==='acceso_error_desktop')],
 ['integrated-qa',integrated.version===VERSION&&integrated.passed===2&&integrated.total===2&&integratedNoLanguageHits],
 ['qa-report-verification',qaVerification.ok===true&&qaVerification.checks?.length===2&&qaVerification.checks.every((item)=>item.ok)],
 ['latest-task-coordinator',/createLatestTaskCoordinator/.test(latest)&&/AbortController/.test(latest)&&/cancel/.test(latest)],
 ['wearable-stale-task-protection',/createLatestTaskCoordinator/.test(wearable)&&/tasks\.begin/.test(wearable)&&/tasks\.cancel/.test(wearable)],
 ['wearable-safe-actions',/Añadir resumen al registro de bienestar/.test(wearable)&&/Descargar resumen/.test(wearable)&&/Descartar vista previa/.test(wearable)],
 ['wearable-local-only',/No se ha enviado ni confirmado ningún dato/.test(wearable)&&/URL\.createObjectURL/.test(wearable)],
 ['wearable-no-raw-summary',/downloadSummary/.test(wearable)&&/archivo original/.test(wearable)&&/acceptedCount/.test(wearable)],
 ['canonical-noop-dedupe',/sameState/.test(store)||/JSON\.stringify/.test(store)||/stateEqual/.test(store)],
 ['canonical-listener-isolation',/for \(const listener/.test(store)&&/try\{listener\(getState\(\)\)/.test(store)&&/onListenerError/.test(store)],
 ['shell-render-coalescing',/queueMicrotask/.test(shell)&&/renderQueued/.test(shell)&&/lastMarkup/.test(shell)],
 ['connectivity-initial-sync',/emitInitial/.test(pwa)&&/emitInitial:true/.test(pwa)],
 ['connectivity-dedup',/lastDelivered/.test(pwa)&&/rerun/.test(pwa)&&/shouldDeliver/.test(pwa)],
 ['retry-backoff',/retryDelayMs/.test(bus)&&/Math\.min/.test(bus)&&/5\*60\*1000/.test(bus)],
 ['retry-metadata',/attempts/.test(bus)&&/nextRetryAt/.test(bus)&&/deferred/.test(bus)],
 ['manual-retry-bypass',/nextRetryAt:null/.test(bus)&&/retry/.test(bus)],
 ['offline-owner-sealing',/ownerId/.test(offlineRepo)&&/M26_OPERATION_OWNER_REQUIRED/.test(offlineRepo)&&/schemaVersion/.test(offlineRepo)],
 ['offline-contamination-removal',/storage\.remove/.test(offlineRepo)&&/value\.ownerId/.test(offlineRepo)],
 ['skip-link',/Saltar al contenido/.test(shellRender)&&/m26-skip-link/.test(shellCss)],
 ['aria-current-active-only',/aria-current="page"/.test(shellRender)&&!/aria-current="false"/.test(shellRender)],
 ['live-operation-status',/role="status"/.test(shellRender)&&/aria-live="polite"/.test(shellRender)&&/aria-atomic="true"/.test(shellRender)],
 ['access-busy',/aria-busy/.test(shellRender)],
 ['main-labelled',/aria-labelledby="m26-page-title"/.test(shellRender)&&/id="m26-page-title"/.test(shellRender)],
 ['reduced-motion',/prefers-reduced-motion/.test(shellCss)],
 ['runtime-version',new RegExp(VERSION.replaceAll('.','\\.')).test(runtime)],
 ['client-info-versioned',/iberfit-m26-web\/\$\{runtime\.version\}/.test(transport)],
 ['service-worker-version',/m26-rc28/.test(sw)&&/PREVIOUS_VERSION='m26-rc27'/.test(sw)&&/NEVER_CACHE_PREFIXES/.test(sw)],
 ['preflight-readonly',!/\b(create|alter|drop|insert|update|delete|truncate|grant|revoke)\b/i.test(strippedPreflight)],
 ['strict-csp',/Content-Security-Policy:/.test(headers)&&!/unsafe-inline/.test(headers)&&/X-Frame-Options:\s*DENY/.test(headers)],
 ['runtime-disabled',/enabled:\s*false/.test(runtime)],
 ['no-dynamic-code',!/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(sourceScope)],
 ['no-embedded-secrets',!/eyJ[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]+|service_role\s*[:=]/i.test(sourceScope)],
 ['rc28-docs',exists('docs/RC28_CIERRE_LOCAL_MAXIMO.md')&&/cierre local máximo/i.test(read('docs/RC28_CIERRE_LOCAL_MAXIMO.md'))&&/deployable: false/i.test(read('docs/RC28_CIERRE_LOCAL_MAXIMO.md'))],
 ['rc28-tests',exists('tests/m26_rc28_local_maximum_closure.test.mjs')&&/publicaciones sin estado público confirmado/i.test(read('tests/m26_rc28_local_maximum_closure.test.mjs'))&&/pantalla de autenticación/i.test(read('tests/m26_rc28_local_maximum_closure.test.mjs'))],
 ['publication-fails-closed-when-status-missing',/if\(PUBLIC_STATUSES\.has\(status\)\)return true;return false/.test(roleProjection)],
 ['normalized-sensitive-key-filtering',/normalizedKey/.test(roleProjection)&&/sensitiveKey/.test(roleProjection)&&/MAX_NESTED_DEPTH=6/.test(roleProjection)&&/MAX_NESTED_STRING=5000/.test(roleProjection)],
 ['exact-remote-revision-scope',/revisionKeyBelongsToClient/.test(roleProjection)&&/new RegExp/.test(roleProjection)&&/escaped/.test(roleProjection)],
 ['top-level-client-projection',/projectIdentityForRole/.test(roleProjection)&&/projectEnvironmentForRole/.test(roleProjection)&&/projectCanaryForRole/.test(roleProjection)&&/projectMetricsForRole/.test(roleProjection)],
 ['identity-boundary-reset',/store\.reset\(\)/.test(read('src/m26/app/application.js'))&&/function onLogout/.test(read('src/m26/app/application.js'))&&/destroyControllers/.test(read('src/m26/app/application.js'))],
 ['canonical-store-reset',/function reset\(/.test(store)&&/reset,/.test(store)],
 ['client-search-accessible',/data-client-search/.test(route)&&/data-client-search-status/.test(route)&&/aria-live="polite"/.test(route)&&/foldSearch/.test(route)&&/cliente encontrado/.test(workflowController)],
 ['auth-mobile-box-model',/\.m26-auth-page, \.m26-auth-page \* \{ box-sizing: border-box; \}/.test(shellCss)&&/\.m26-auth-card \{ max-width: 100%;/.test(shellCss)],
 ['visual-extreme-states',visual.results.some((x)=>x.case?.scenario==='empty')&&visual.results.some((x)=>x.case?.scenario==='no_data')&&visual.results.some((x)=>x.case?.scenario==='long_content')&&visual.results.some((x)=>x.case?.scenario==='many_clients')],
 ['integrated-client-top-level-privacy',integrated.results.find((x)=>x.role==='client')?.privacy?.remoteRevisionKeys?.length===1&&integrated.results.find((x)=>x.role==='client')?.privacy?.containsPrivateMarker===false&&integrated.results.find((x)=>x.role==='client')?.privacy?.clientIds?.length===1],
 ['integrated-logout-clears-state',integrated.results.every((x)=>x.logout&&Object.values(x.logout).every(Boolean))],
 ['active-runtime-no-placeholders',!/(?:TODO|FIXME|HACK)/.test(['src/m26','public/m26'].flatMap((dir)=>walk(abs(dir))).filter((file)=>/\.(?:js|html)$/.test(file)).map((file)=>read(path.relative(root,file))).join('\n'))],
 ['active-runtime-no-console-debug',!/(?:console\.log|debugger\s*;)/.test(['src/m26','public/m26'].flatMap((dir)=>walk(abs(dir))).filter((file)=>/\.(?:js|html)$/.test(file)).map((file)=>read(path.relative(root,file))).join('\n'))],
 ['final-completion-matrix',exists('docs/RC28_MATRIZ_FINAL_DE_COMPLETITUD_LOCAL.md')&&/Requiere infraestructura real/.test(read('docs/RC28_MATRIZ_FINAL_DE_COMPLETITUD_LOCAL.md'))],
 ['controlled-publication-runbook',exists('docs/RC28_RUNBOOK_PUBLICACION_CONTROLADA.md')&&/M25\.1/.test(read('docs/RC28_RUNBOOK_PUBLICACION_CONTROLADA.md'))&&/canario/i.test(read('docs/RC28_RUNBOOK_PUBLICACION_CONTROLADA.md'))],
 ['role-privacy-checklist',exists('docs/RC28_CHECKLIST_PRIVACIDAD_POR_ROL.md')&&/payload/i.test(read('docs/RC28_CHECKLIST_PRIVACIDAD_POR_ROL.md'))],
 ['remote-gates-fail-closed',exists('docs/REMOTE_GATE_MATRIX_RC18.md')&&exists('backend/RC25_ROLE_SEPARATION_PREFLIGHT_READONLY.sql')],
 ['runtime-cache-coherent',new RegExp(VERSION.replaceAll('.','\\.')).test(runtime)&&/VERSION='m26-rc28'/.test(sw)&&/PREVIOUS_VERSION='m26-rc27'/.test(sw)],
];

let failures=0;
const results=checks.map(([name,value])=>{
  const ok=Boolean(value);if(!ok)failures++;
  console.log(`${ok?'PASS':'FAIL'} ${name}`);
  return {name,ok};
});
const report={release:RELEASE,version:VERSION,generatedAt:new Date().toISOString(),localOnly:true,remoteGatesPassed:false,passed:checks.length-failures,total:checks.length,failed:failures,syntax,protectedLayers,checks:results,ok:failures===0};
fs.writeFileSync(abs('recovery/m26-rc28-quality-gate-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(`\n${report.passed}/${report.total} PASS`);
if(failures)process.exit(1);
