import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
const root=process.cwd(),dist=path.join(root,'dist','m26-resilience-candidate');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8'),json=(p)=>JSON.parse(read(p)),exists=(p)=>fs.existsSync(path.join(root,p)),sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const walk=(dir,files=[])=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const abs=path.join(dir,entry.name);if(entry.isDirectory())walk(abs,files);else files.push(abs);}return files;};
function protectedComparison(){const manifest=json('recovery/RC16_SHA256_MANIFEST.json');const expected=manifest.entries.filter((entry)=>entry.path.startsWith('legacy/')||entry.path.startsWith('baseline_m25_2/'));const changed=[],missing=[];for(const entry of expected){if(!exists(entry.path))missing.push(entry.path);else if(sha(entry.path)!==entry.sha256)changed.push(entry.path);}const expectedPaths=new Set(expected.map((entry)=>entry.path)),added=[];for(const base of ['legacy','baseline_m25_2'])for(const abs of walk(path.join(root,base))){const rel=path.relative(root,abs).replaceAll(path.sep,'/');if(!expectedPaths.has(rel))added.push(rel);}const report={baseline:'RC16 protected layers',expectedFiles:expected.length,changed,missing,added,ok:!changed.length&&!missing.length&&!added.length};fs.writeFileSync(path.join(root,'recovery','RC17_PROTECTED_BASELINE_COMPARISON.json'),JSON.stringify(report,null,2)+'\n');return report;}
function syntaxAudit(){const files=[...walk(path.join(root,'src','m26')),...walk(path.join(root,'public','m26')),...walk(path.join(root,'scripts')),...walk(path.join(root,'qa'))].filter((f)=>/\.(?:js|mjs)$/.test(f));const failed=[];for(const file of files){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)failed.push({path:path.relative(root,file),error:(r.stderr||r.stdout||'').trim().slice(0,500)});}return {files:files.length,failed,ok:failed.length===0};}
const version=json('dist/m26-resilience-candidate/version.json'),graph=json('recovery/RC17_MODULE_GRAPH_REPORT.json'),visual=json('recovery/RC17_VISUAL_QA_REPORT.json'),integrated=json('recovery/RC17_INTEGRATED_QA_REPORT.json'),remote=json('recovery/RC17_REMOTE_VALIDATION_STATUS.json'),dependencies=json('recovery/RC17_DEPENDENCY_AUDIT.json'),registry=json('qa/rc17_command_registry.json'),protectedReport=protectedComparison(),syntax=syntaxAudit();
const sourceScope=['src/m26','public/m26'].flatMap((d)=>walk(path.join(root,d))).filter((f)=>/\.(?:js|mjs|html|css)$/.test(f)).map((f)=>fs.readFileSync(f,'utf8')).join('\n');
const transport=read('src/m26/supabase-transport.js'),state=read('src/m26/production-state.js'),bus=read('src/m26/command-bus.js'),app=read('src/m26/app/application.js'),execution=read('src/m26/workflows/session-execution.js'),builder=read('src/m26/workflows/session-builder.js'),engagement=read('src/m26/engagement/command-service.js'),catalog=read('src/m26/command-catalog.js'),pwa=read('src/m26/platform/pwa.js'),repo=read('src/m26/platform/offline-command-repository.js'),vault=read('src/m26/app/session-vault.js'),id=read('src/m26/platform/id.js'),headers=read('public/m26/_headers'),sw=read('public/m26/sw.js'),pkg=json('package.json');
const checks=[
 ['version',version.version==='26.0.0-resilience-candidate.17'&&version.status==='not_deployed'&&version.deployable===false],
 ['build-budget',version.budgetOk&&version.totalBytes<=version.budgets.totalLimit],
 ['module-graph',graph.ok&&graph.modules>=49&&!graph.missing.length],
 ['visual-chromium',visual.case_count===15&&visual.passed===15&&visual.failed===0],
 ['integrated-roles',integrated.total===2&&integrated.passed===2&&integrated.results.every((r)=>r.ok&&!r.console_errors.length&&!r.page_errors.length)],
 ['command-registry',registry.length===52&&new Set(registry.map((r)=>r.command_type)).size===52],
 ['protected-baselines',protectedReport.ok&&protectedReport.expectedFiles>=120],
 ['syntax',syntax.ok&&syntax.files>=75],
 ['dependency-audit',dependencies.result==='PASS'&&dependencies.runtime_dependencies===0&&dependencies.development_dependencies===0&&!pkg.dependencies&&!pkg.devDependencies],
 ['no-dynamic-code',! /\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(sourceScope)],
 ['no-secret-patterns',! /eyJ[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]+|service_role\s*[:=]/i.test(sourceScope)],
 ['canonical-project-pin',/M26_CANONICAL_PROJECT_REF/.test(transport)&&/M26_PROJECT_REF_MISMATCH/.test(transport)&&/M26_SUPABASE_ORIGIN_MISMATCH/.test(transport)],
 ['auth-response-strict',/M26_AUTH_INVALID_RESPONSE/.test(transport)&&/email\.includes\('@'\)/.test(transport)&&/M26_RESPONSE_TOO_LARGE/.test(transport)],
 ['client-scope-defense',/restrictCollectionsForIdentity/.test(state)&&/privateNotes/.test(state)&&/M26_CLIENT_IDENTITY_REQUIRED/.test(state)],
 ['operation-collision',/M26_OPERATION_ID_COLLISION/.test(bus)&&/commandFingerprint/.test(bus)],
 ['appointment-window',/APPOINTMENT_EARLY_WINDOW_MS/.test(app)&&/APPOINTMENT_LATE_WINDOW_MS/.test(app)&&/confirmedAppointmentForSession/.test(app)],
 ['target-state-commands',/M26_EXECUTION_PAUSE_TARGET_INVALID/.test(execution)&&/M26_EXECUTION_RESUME_TARGET_INVALID/.test(execution)&&/M26_EXECUTION_CANCEL_TARGET_INVALID/.test(execution)],
 ['draft-structural-validation',/groupType:/.test(builder)&&/blockId:/.test(builder)&&/alternative:/.test(builder)],
 ['engagement-offline-fail-closed',/M26_ENGAGEMENT_ONLINE_REQUIRED/.test(engagement)],
 ['registry-strictness',/strict:true/.test(catalog)&&/duplicates/.test(catalog)&&/incomplete/.test(catalog)],
 ['connectivity-replay',/rerun=true/.test(pwa)&&/while\(rerun&& !?stopped\)|while\(rerun&&!stopped\)/.test(pwa)],
 ['corrupt-repository-purge',/storageKey!==key\(value\.operationId\)/.test(repo)],
 ['session-vault-strict',/M26_SESSION_INVALID/.test(vault)&&/email\.includes\('@'\)/.test(vault)],
 ['crypto-identifiers',/randomUUID/.test(id)&&/getRandomValues/.test(id)],
 ['strict-csp',/Content-Security-Policy:/.test(headers)&&!/unsafe-inline/.test(headers)&&/X-Frame-Options: DENY/.test(headers)],
 ['pwa-auth-api-never-cached',/NEVER_CACHE_PREFIXES/.test(sw)&&/\/auth\/v1\//.test(sw)&&/\/rest\/v1\//.test(sw)&&/m26-rc17/.test(sw)],
 ['runtime-fail-closed',/enabled:\s*false/.test(read('public/m26/runtime-config.js'))],
 ['remote-honesty',remote.supabase_connector_available===false&&remote.m26_application_repository_found===false&&remote.github_modified===false&&remote.production_modified===false&&remote.production_deployed===false],
 ['readonly-audit',/begin transaction read only/i.test(read('backend/RC17_REMOTE_SCHEMA_READONLY.sql'))&&!/\b(?:insert|update|delete|alter|create|drop|truncate)\b/i.test(read('backend/RC17_REMOTE_SCHEMA_READONLY.sql').replace(/^--.*$/gm,''))],
 ['documentation',['README_RC17.md','docs/RC17_DEEP_RESILIENCE_AUDIT.md','docs/RC17_REMOTE_CANARY_RUNBOOK.md','recovery/RC17_RESILIENCE_CHECKPOINT.md'].every(exists)],
];
let failures=0;const resultChecks=checks.map(([name,ok])=>{if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${name}`);return {name,ok:Boolean(ok)};});const report={version:version.version,generatedAt:new Date().toISOString(),passed:checks.length-failures,total:checks.length,syntax,protectedBaseline:protectedReport,checks:resultChecks,ok:failures===0};fs.writeFileSync(path.join(root,'recovery','m26-resilience-gate-results.json'),JSON.stringify(report,null,2)+'\n');console.log(`\n${report.passed}/${report.total} PASS`);if(failures)process.exit(1);
