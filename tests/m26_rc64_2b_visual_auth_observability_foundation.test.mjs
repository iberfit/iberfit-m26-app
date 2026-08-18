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
