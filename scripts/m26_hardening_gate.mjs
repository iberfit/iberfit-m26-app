import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const dist=path.join(root,'dist','m26-hardening-candidate');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const json=(p)=>JSON.parse(read(p));
const exists=(p)=>fs.existsSync(path.join(root,p));
const sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const walk=(dir,files=[])=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const abs=path.join(dir,entry.name);if(entry.isDirectory())walk(abs,files);else files.push(abs);}return files;};

function protectedComparison(){
  const manifest=json('recovery/RC15_SHA256_MANIFEST.json');
  const expected=manifest.entries.filter((entry)=>entry.path.startsWith('legacy/')||entry.path.startsWith('baseline_m25_2/'));
  const changed=[],missing=[];
  for(const entry of expected){if(!exists(entry.path))missing.push(entry.path);else if(sha(entry.path)!==entry.sha256)changed.push(entry.path);}
  const expectedPaths=new Set(expected.map((entry)=>entry.path));
  const added=[];
  for(const base of ['legacy','baseline_m25_2'])for(const abs of walk(path.join(root,base))){const rel=path.relative(root,abs).replaceAll(path.sep,'/');if(!expectedPaths.has(rel))added.push(rel);}
  const report={generatedAt:new Date().toISOString(),baseline:'RC15 protected layers',expectedFiles:expected.length,changed,missing,added,changedCount:changed.length,missingCount:missing.length,addedCount:added.length,ok:changed.length===0&&missing.length===0&&added.length===0};
  fs.writeFileSync(path.join(root,'recovery','RC16_PROTECTED_BASELINE_COMPARISON.json'),JSON.stringify(report,null,2)+'\n');return report;
}

function syntaxAudit(){
  const files=[...walk(path.join(root,'src','m26')),...walk(path.join(root,'public','m26')),...walk(path.join(root,'scripts')),...walk(path.join(root,'qa'))].filter((file)=>/\.(?:js|mjs)$/.test(file));
  const failed=[];for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)failed.push({path:path.relative(root,file),error:(result.stderr||result.stdout||'').trim().slice(0,500)});}
  return {files:files.length,failed,ok:failed.length===0};
}

const version=json('dist/m26-hardening-candidate/version.json');
const graph=json('recovery/RC16_MODULE_GRAPH_REPORT.json');
const visual=json('recovery/RC16_VISUAL_QA_REPORT.json');
const integrated=json('recovery/RC16_INTEGRATED_QA_REPORT.json');
const remote=json('recovery/RC16_REMOTE_VALIDATION_STATUS.json');
const registry=json('qa/rc16_command_registry.json');
const protectedReport=protectedComparison();
const syntax=syntaxAudit();
const sourceScope=['src/m26','public/m26'].flatMap((dir)=>walk(path.join(root,dir))).filter((file)=>/\.(?:js|mjs|html|css)$/.test(file)).map((file)=>fs.readFileSync(file,'utf8')).join('\n');
const headers=read('public/m26/_headers');const sw=read('public/m26/sw.js');const transport=read('src/m26/supabase-transport.js');const bus=read('src/m26/command-bus.js');const recovery=read('src/m26/workflows/session-recovery.js');const timer=read('src/m26/workflows/session-timer.js');const catalog=read('src/m26/exercises/catalog.js');const progress=read('src/m26/engagement/progress-engine.js');const css=read('src/m26/shell/shell.css');
const checks=[
 ['version',version.version==='26.0.0-hardening-candidate.16'&&version.status==='not_deployed'&&version.deployable===false],
 ['build-budget',version.budgetOk&&version.totalBytes<=version.budgets.totalLimit&&version.budgets.javascriptBytes<=version.budgets.javascriptLimit&&version.budgets.cssBytes<=version.budgets.cssLimit],
 ['module-graph',graph.ok&&graph.modules===49&&graph.missing.length===0],
 ['visual-chromium',visual.case_count===15&&visual.passed===15&&visual.failed===0&&visual.results.every((row)=>row.ok)],
 ['integrated-roles',integrated.total===2&&integrated.passed===2&&integrated.results.every((row)=>row.ok&&!row.console_errors.length&&!row.page_errors.length)],
 ['command-registry',registry.length===52&&new Set(registry.map((row)=>row.command_type)).size===52],
 ['protected-baselines',protectedReport.ok&&protectedReport.expectedFiles>=120],
 ['syntax',syntax.ok&&syntax.files>=70],
 ['no-dynamic-code',!/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(sourceScope)],
 ['no-secret-patterns',!/eyJ[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]+|service_role\s*[:=]/i.test(sourceScope)],
 ['strict-csp',/Content-Security-Policy:/.test(headers)&&!/unsafe-inline/.test(headers)&&/X-Frame-Options: DENY/.test(headers)],
 ['pwa-cache-exclusions',/NEVER_CACHE_PREFIXES/.test(sw)&&/\/auth\/v1\//.test(sw)&&/\/rest\/v1\//.test(sw)&&/\/rpc\//.test(sw)&&/isRuntimeConfig/.test(sw)],
 ['transport-origin-lock',/M26_SUPABASE_ORIGIN_MISMATCH/.test(transport)&&/credentials:\s*'omit'/.test(transport)&&/redirect:\s*'error'/.test(transport)&&/referrerPolicy:\s*'no-referrer'/.test(transport)],
 ['command-single-flight',/const inFlight=new Map\(\)/.test(bus)&&/flushInFlight/.test(bus)&&/M26_COMMAND_PAYLOAD_TOO_LARGE/.test(bus)],
 ['recovery-hardening',/CREDENTIALS_FORBIDDEN/.test(recovery)&&/SAVED_AT_INVALID/.test(recovery)&&/EXECUTION_INDEX_INVALID/.test(recovery)],
 ['timer-hardening',/function finiteAt/.test(timer)&&/function asMs/.test(timer)&&/M26_TIMER_AT_INVALID/.test(timer)],
 ['catalog-origin-lock',/resolveBrowserCatalogUrl/.test(catalog)&&/CROSS_ORIGIN_FORBIDDEN/.test(catalog)&&/catalog\.count<367/.test(catalog)],
 ['progress-canonical',/recordedAt/.test(progress)&&/assessmentDate/.test(progress)&&/normalizeNumericString/.test(progress)&&/loadKg/.test(progress)],
 ['builder-layout',/\.m26-builder-editor\{grid-template-columns:minmax\(0,1fr\)/.test(css)],
 ['runtime-fail-closed',/enabled:\s*false/.test(read('public/m26/runtime-config.js'))],
 ['remote-honesty',remote.supabase_connector_available===false&&remote.m26_application_repository_found===false&&remote.production_modified===false&&remote.production_deployed===false],
 ['readonly-audit',/begin transaction read only/i.test(read('backend/RC16_REMOTE_SCHEMA_READONLY.sql'))&&!/\b(?:insert|update|delete|alter|create|drop|truncate)\b/i.test(read('backend/RC16_REMOTE_SCHEMA_READONLY.sql').replace(/^--.*$/gm,''))],
 ['documentation',['README_RC16.md','docs/RC16_DEEP_AUDIT.md','docs/RC16_BACKEND_SECURITY_AUDIT.md','recovery/RC16_HARDENING_CHECKPOINT.md'].every(exists)],
];
let failures=0;const resultChecks=checks.map(([name,ok])=>{console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failures++;return {name,ok:Boolean(ok)};});
const report={version:version.version,generatedAt:new Date().toISOString(),passed:checks.length-failures,total:checks.length,syntax,protectedBaseline:protectedReport,checks:resultChecks,ok:failures===0};
fs.writeFileSync(path.join(root,'recovery','m26-hardening-gate-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(`\n${report.passed}/${report.total} PASS`);if(failures)process.exit(1);
