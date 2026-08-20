import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const pkg=JSON.parse(read('package.json'));

test('RC64.2B1 keeps dependencies unchanged and adds explicit quality scripts',()=>{
  assert.equal(Object.keys(pkg.dependencies||{}).length,0);
  assert.deepEqual(Object.keys(pkg.devDependencies||{}).sort(),['@playwright/test','axe-core','lighthouse']);
  assert.equal(pkg.devDependencies['@playwright/test'],'1.62.1');
  assert.equal(pkg.devDependencies['axe-core'],'4.12.1');
  assert.equal(pkg.devDependencies.lighthouse,'13.4.1');
  assert.equal(pkg.scripts['quality:rc64:visual'],'node qa/rc64/build-current-surface.mjs && playwright test --config playwright.visual.config.mjs');
  assert.equal(pkg.scripts['quality:rc64:visual:update'],'node qa/rc64/build-current-surface.mjs && playwright test --config playwright.visual.config.mjs --update-snapshots');
  assert.equal(pkg.scripts['quality:rc64:auth-smoke'],'node qa/rc64/build-authenticated-surface.mjs && playwright test --config playwright.authenticated.config.mjs');
});

test('RC64.2B1 quality observability is bounded memory-only and contains no identity health or transport',async()=>{
  const source=read('src/m26/quality/runtime-observability.js');
  for(const forbidden of [
    /\bfetch\s*\(/u,
    /XMLHttpRequest/u,
    /localStorage/u,
    /indexedDB/u,
    /\buserId\b/u,
    /\bclientId\b/u,
    /\bsessionId\b/u,
    /\bheartRate\b/iu,
    /\brrIntervals\b/iu,
    /\bemail\b/iu,
  ])assert.doesNotMatch(source,forbidden);

  const mod=await import('../src/m26/quality/runtime-observability.js');
  const listeners=new Map();
  const scope={
    addEventListener:(type,fn)=>listeners.set(type,fn),
    removeEventListener:(type)=>listeners.delete(type),
  };

  class FakePerformanceObserver{
    constructor(callback){this.callback=callback;}
    observe(){ }
    disconnect(){ }
  }

  const collector=mod.createQualityRuntimeObservability({
    scope,
    limit:2,
    PerformanceObserverImpl:FakePerformanceObserver,
  }).start();

  listeners.get('m26:diagnostic')?.({detail:{stage:'login',code:'M26_AUTH_FAILED',status:401,email:'secret@example.com'}});
  listeners.get('m26:diagnostic')?.({detail:{stage:'hydrate',code:'M26_TIMEOUT',status:504,userId:'secret'}});
  listeners.get('m26:diagnostic')?.({detail:{stage:'extra',code:'M26_EXTRA_FAILED',status:500,heartRateBpm:180}});

  const snapshot=collector.snapshot();
  assert.equal(snapshot.schemaVersion,'iberfit.quality-runtime-observability.v1');
  assert.equal(snapshot.storage,'memory-only');
  assert.equal(snapshot.transport,'none');
  assert.equal(snapshot.identityIncluded,false);
  assert.equal(snapshot.healthDataIncluded,false);
  assert.equal(snapshot.fieldP75Claimed,false);
  assert.equal(snapshot.inpClaimed,false);
  assert.equal(snapshot.metrics.interactionLatencyLabel,'candidate-not-inp');
  assert.equal(snapshot.diagnostics.length,2);
  assert.deepEqual(Object.keys(snapshot.diagnostics[0]).sort(),['code','stage','status']);
  assert.doesNotMatch(JSON.stringify(snapshot),/secret@example|heartRateBpm|userId/iu);
});

test('RC64.2B1 app installs observability dynamically and real-shell verifies its privacy flags',()=>{
  const app=read('public/m26/app.js');
  const spec=read('qa/rc64/real-shell.spec.mjs');
  assert.match(app,/requestIdleCallback/u);
  assert.match(app,/await import\('\/src\/m26\/quality\/runtime-observability\.js'\)/u);
  assert.doesNotMatch(app,/^import .*runtime-observability/mu);
  assert.match(app,/__IBERFIT_M26_QUALITY_OBSERVABILITY_READY__/u);
  assert.match(spec,/iberfit\.quality-runtime-observability\.v1/u);
  assert.match(spec,/identityIncluded\)\.toBe\(false\)/u);
  assert.match(spec,/healthDataIncluded\)\.toBe\(false\)/u);
  assert.match(spec,/interactionLatencyLabel\)\.toBe\('candidate-not-inp'\)/u);
});

test('RC64.2B1 visual regression is canonical Linux-only and uses Playwright screenshots',()=>{
  const config=read('playwright.visual.config.mjs');
  const spec=read('qa/rc64/visual.spec.mjs');
  assert.match(config,/process\.platform!=='linux'/u);
  assert.match(config,/RC64_2B_VISUAL_BASELINE_LINUX_ONLY/u);
  assert.match(config,/visual-desktop-chromium/u);
  assert.match(config,/1440/u);
  assert.match(config,/1000/u);
  assert.match(config,/visual-mobile-chromium/u);
  assert.match(config,/390/u);
  assert.match(config,/844/u);
  assert.match(config,/locale:'es-ES'/u);
  assert.match(config,/timezoneId:'America\/Santiago'/u);
  assert.match(spec,/toHaveScreenshot\('preauth-disabled\.png'/u);
  assert.doesNotMatch(`${config}\n${spec}`,/percy|chromatic/iu);
});

test('RC64.2B1 authenticated surface requires real canonical QA environment and never embeds user credentials',()=>{
  const builder=read('qa/rc64/build-authenticated-surface.mjs');
  assert.match(builder,/M26_SUPABASE_URL/u);
  assert.match(builder,/M26_SUPABASE_PUBLISHABLE_KEY/u);
  assert.match(builder,/pjhmrhejsoofmouedavw/u);
  assert.match(builder,/RC64_2B_AUTH_SERVICE_ROLE_FORBIDDEN/u);
  assert.match(builder,/\.tmp','rc64-current-surface/u);
  assert.match(builder,/credentialsEmbedded:false/u);
  assert.doesNotMatch(builder,/M26_QA_(?:COACH|CLIENT).*PASSWORD/u);
  assert.doesNotMatch(builder,/iberfit\.cl\+qa\.[a-z0-9._-]+@/iu);
});

test('RC64.2B1 authenticated browser smoke blocks mutation paths and persists only minimized evidence',()=>{
  const config=read('playwright.authenticated.config.mjs');
  const spec=read('qa/rc64/authenticated-smoke.spec.mjs');
  assert.match(config,/trace:'off'/u);
  assert.match(config,/screenshot:'off'/u);
  assert.match(config,/video:'off'/u);
  assert.match(spec,/M26_QA_COACH_EMAIL/u);
  assert.match(spec,/M26_QA_CLIENT_A_EMAIL/u);
  assert.match(spec,/READ_ONLY_RPCS/u);
  assert.match(spec,/route\.abort\('blockedbyclient'\)/u);
  assert.match(spec,/mutationsPerformed:false/u);
  assert.match(spec,/credentialsPersisted:false/u);
  assert.match(spec,/identityPersisted:false/u);
  assert.match(spec,/healthDataPersisted:false/u);
  assert.doesNotMatch(spec,/M26_QA_CLIENT_B_/u);
  assert.doesNotMatch(spec,/service_role_key|password123|secret@example/iu);
});

test('RC64.2B1 protected workflow generates Linux candidates and auth evidence without write permission',()=>{
  const workflow=read('.github/workflows/remote-gates.yml');
  assert.match(workflow,/workflow_dispatch:/u);
  assert.match(workflow,/runs-on: ubuntu-latest/u);
  assert.match(workflow,/contents: read/u);
  assert.match(workflow,/quality:rc64:visual:update/u);
  assert.match(workflow,/rc64-2b-linux-visual-baseline-candidates/u);
  assert.match(workflow,/quality:rc64:auth-smoke/u);
  assert.match(workflow,/rc64-2b-authenticated-readonly-evidence/u);
  assert.doesNotMatch(workflow,/contents:\s*write/u);
  assert.doesNotMatch(workflow,/git push|wrangler|pages deploy/iu);
});

test('RC64.2B1 roadmap remains open until remote Linux/auth evidence is reviewed',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  const evidence=read('docs/evidence/rc64-2/RC64_2B_VISUAL_AUTH_OBSERVABILITY_FOUNDATION_20260818.md');
  assert.match(roadmap,/RC64_2B=IN_PROGRESS_VISUAL_AUTH_OBSERVABILITY_CLOSEOUT/u);
  assert.match(roadmap,/RC64_2B1=READY_REMOTE_LINUX_AUTH_EVIDENCE/u);
  assert.match(roadmap,/candidate-not-inp/u);
  assert.match(roadmap,/no se cierra/u);
  assert.match(evidence,/RC64\.2B no se cerrará/u);
  assert.match(evidence,/versionar los PNG Linux aprobados/u);
  assert.match(evidence,/nunca email, token, userId, clientId, contraseña ni salud/u);
});
test('RC64.2B1 remote workflow keeps every appended quality action inside preflight steps',()=>{
  const workflow=read('.github/workflows/remote-gates.yml');

  assert.doesNotMatch(workflow,/^- name:/mu);

  for(const step of [
    'Preparar Playwright RC64.2B',
    'Generar candidatos visuales canónicos Linux RC64.2B',
    'Conservar candidatos visuales Linux',
    'Ejecutar smoke autenticado RC64.2B sobre fuente actual sin mutaciones',
    'Conservar evidencia autenticada minimizada RC64.2B',
  ]){
    assert.match(
      workflow,
      new RegExp(`^ {6}- name: ${step.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'mu'),
    );
  }

  assert.match(workflow,/^permissions:\r?\n {2}contents: read$/mu);
  assert.match(workflow,/^ {4}steps:$/mu);
});
test('RC64.2B1 quality observability module is part of the generated PWA shell after tracking',()=>{
  const sw=read('public/m26/sw.js');
  const generator=read('scripts/generate_rc58_app_shell.mjs');

  assert.match(sw,/"\/src\/m26\/quality\/runtime-observability\.js"/u);
  assert.match(generator,/\['ls-files','--','src\/m26','public\/m26'\]/u);
  assert.match(generator,/repoPath\.startsWith\('src\/m26\/'\)/u);
  assert.match(generator,/!\['\.js','\.css'\]\.includes\(extension\)/u);
  assert.match(sw,/VERSION='m26-rc63-2'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc63-1'/u);
});
test('RC64.2B1 validate job fetches full Git history required by RC56 hardware provenance',()=>{
  const ci=read('.github/workflows/ci.yml');
  const rc56=read('tests/m26_rc56_hardware_validation.test.mjs');
  const boundary=ci.indexOf('\n  remote_readonly:\n');
  assert.ok(boundary>0);

  const validate=ci.slice(0,boundary);
  const remoteReadonly=ci.slice(boundary);

  assert.match(
    validate,
    /- name: Descargar repositorio\r?\n\s+uses: actions\/checkout@v4\r?\n\s+with:\r?\n\s+fetch-depth: 0/u,
  );
  assert.equal((validate.match(/actions\/checkout@v4/gu)||[]).length,1);
  assert.equal((remoteReadonly.match(/actions\/checkout@v4/gu)||[]).length,1);

  assert.match(rc56,/gitBlobAtCommit/u);
  assert.match(rc56,/evidence\.baseCommit/u);
  assert.match(rc56,/native\/android\/wear\/IBERFITWearHealthServicesBridge\.kt/u);
  assert.match(rc56,/native\/android\/runtime\/IBERFITWearDataLayerRuntime\.kt/u);
});
test('RC64.2B1 base browser gate remains isolated from specialized visual auth and real-shell specs',()=>{
  const base=read('playwright.config.mjs');
  const realShell=read('playwright.real-shell.config.mjs');
  const visual=read('playwright.visual.config.mjs');
  const authenticated=read('playwright.authenticated.config.mjs');

  assert.match(base,/testMatch:'quality-platform\.spec\.mjs'/u);
  assert.doesNotMatch(base,/testMatch:'\*\*\/\*\.spec\.mjs'/u);

  assert.match(realShell,/testMatch:'real-shell\.spec\.mjs'/u);
  assert.match(visual,/testMatch:'visual\.spec\.mjs'/u);
  assert.match(authenticated,/testMatch:'authenticated-smoke\.spec\.mjs'/u);

  assert.equal(pkg.scripts['quality:rc64:browser'],'playwright test --config playwright.config.mjs');
  assert.equal(pkg.scripts['quality:rc64:real-shell'],'node qa/rc64/build-current-surface.mjs && playwright test --config playwright.real-shell.config.mjs');
  assert.equal(pkg.scripts['quality:rc64:visual'],'node qa/rc64/build-current-surface.mjs && playwright test --config playwright.visual.config.mjs');
  assert.equal(pkg.scripts['quality:rc64:auth-smoke'],'node qa/rc64/build-authenticated-surface.mjs && playwright test --config playwright.authenticated.config.mjs');
});
test('RC64.2B1 authenticated smoke allowlist exactly covers the complete read-only pre-render network surface',()=>{
  const smoke=read('qa/rc64/authenticated-smoke.spec.mjs');
  const application=read('src/m26/app/application.js');
  const communication=read('src/m26/communication/transport.js');
  const baseline=read('supabase/migrations/20260815195022_RECOVERED_CURRENT_PRODUCTION_BASELINE.sql');

  const start=smoke.indexOf('const READ_ONLY_RPCS=new Set([');
  const end=smoke.indexOf(']);',start);
  assert.ok(start>=0&&end>start);
  const allowlist=smoke.slice(start,end+3);
  const rpcNames=[...allowlist.matchAll(/'([a-z0-9_]+)'/gu)].map((match)=>match[1]);

  assert.deepEqual(rpcNames,[
    'iberfit_bootstrap_v26',
    'iberfit_authorized_application_roles_v13',
    'iberfit_appointment_change_requests_v13',
    'iberfit_application_context_v14',
    'iberfit_communication_bootstrap_v14',
    'm26_backend_bootstrap_v43',
    'm26_wearable_bootstrap_v44',
  ]);

  assert.match(smoke,/domain_command_registry_v26/u);
  assert.match(application,/transport\.bootstrap\(currentToken\(\)\)/u);
  assert.match(application,/transport\.commandRegistry\(currentToken\(\)\)/u);
  assert.match(application,/rc39Transport\.extensions\(currentToken\(\)\)/u);
  assert.match(application,/adminTransport\.applicationContextOptional\(currentToken\(\)\)/u);
  assert.match(application,/transport\.backendBootstrap\(currentToken\(\)\)/u);
  assert.match(application,/transport\.wearableBootstrap\(currentToken\(\)\)/u);
  assert.match(application,/communicationTransport\.bootstrapOptional\(currentToken\(\),\{application:activeRole\}\)/u);

  assert.match(communication,/iberfit_communication_bootstrap_v14/u);
  assert.match(communication,/iberfit_communication_execute_v14/u);
  assert.doesNotMatch(allowlist,/iberfit_communication_execute_v14/u);

  const fnStart=baseline.indexOf('CREATE FUNCTION public.iberfit_communication_bootstrap_v14 (');
  const bodyStart=baseline.indexOf('AS $function$',fnStart);
  const bodyEnd=baseline.indexOf('end $function$;',bodyStart);
  assert.ok(fnStart>=0&&bodyStart>fnStart&&bodyEnd>bodyStart);
  const body=baseline.slice(bodyStart,bodyEnd);
  assert.match(body,/select public\.iberfit_application_context_v14\(\)/u);
  assert.match(body,/select public\.iberfit_bootstrap_v26\(\)/u);
  assert.match(body,/from public\.iberfit_conversation_threads/u);
  assert.match(body,/from public\.iberfit_messages/u);
  assert.match(body,/from public\.iberfit_in_app_notifications/u);
  assert.doesNotMatch(body,/\b(?:insert|update|delete|merge|truncate)\b/iu);

  assert.match(smoke,/blockedExternalPaths/u);
  assert.match(smoke,/RC64_2B_BLOCKED_EXTERNAL_DURING_AUTH/u);
  assert.match(smoke,/RC64_2B_RUNTIME_ERROR_DURING_AUTH/u);
  assert.match(smoke,/context\.exposeBinding\('__rc64RecordDiagnostic'/u);
  assert.match(smoke,/runtimeDiagnostics/u);
  assert.match(smoke,/M26_UNCLASSIFIED_DIAGNOSTIC/u);
  assert.match(smoke,/diagnosticSummary/u);
  assert.match(smoke,/unclassified/u);
  assert.doesNotMatch(smoke,/__RC64_2B_DIAGNOSTICS__/u);
  assert.doesNotMatch(smoke,/message\.text\(\)/u);

  const runtimeErrorStart=smoke.indexOf('if(pageErrors>0||consoleErrors>0){');
  const runtimeErrorEnd=smoke.indexOf('      if(await authenticatedRole.isVisible()',runtimeErrorStart);
  assert.ok(runtimeErrorStart>=0&&runtimeErrorEnd>runtimeErrorStart);
  const runtimeErrorBlock=smoke.slice(runtimeErrorStart,runtimeErrorEnd);
  assert.match(runtimeErrorBlock,/runtimeDiagnostics\.slice\(0,8\)/u);
  assert.doesNotMatch(runtimeErrorBlock,/page\.evaluate/u);
  const roleEvidenceStart=smoke.indexOf('evidenceRoles.push(Object.freeze({');
  const roleEvidenceEnd=smoke.indexOf('    await context.close();',roleEvidenceStart);
  assert.ok(roleEvidenceStart>=0&&roleEvidenceEnd>roleEvidenceStart);
  const roleEvidenceBlock=smoke.slice(roleEvidenceStart,roleEvidenceEnd);
  assert.match(roleEvidenceBlock,/blockedExternal,/u);
  assert.doesNotMatch(roleEvidenceBlock,/blockedExternalPaths/u);

  const serializedEvidenceStart=smoke.indexOf('const evidence=Object.freeze({');
  const serializedEvidenceEnd=smoke.indexOf("  await mkdir('recovery'",serializedEvidenceStart);
  assert.ok(serializedEvidenceStart>=0&&serializedEvidenceEnd>serializedEvidenceStart);
  const serializedEvidenceBlock=smoke.slice(serializedEvidenceStart,serializedEvidenceEnd);
  assert.match(serializedEvidenceBlock,/roles:evidenceRoles/u);
  assert.doesNotMatch(serializedEvidenceBlock,/blockedExternalPaths/u);
  assert.doesNotMatch(serializedEvidenceBlock,/diagnosticSummary|runtimeDiagnostics|__rc64RecordDiagnostic/u);
  assert.match(smoke,/JSON\.stringify\(evidence,null,2\)/u);
});
