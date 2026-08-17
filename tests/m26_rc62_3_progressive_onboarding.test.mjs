import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PROGRESSIVE_ONBOARDING_SCHEMA_VERSION,
  progressiveOnboardingTrack,
  progressiveOnboardingScopeKey,
  normalizeProgressiveOnboardingState,
  progressiveOnboardingProgress,
  createProgressiveOnboardingRepository,
  recordProgressiveOnboardingArea,
  renderProgressiveOnboardingPanel,
} from '../src/m26/onboarding/progressive-onboarding.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC62.3 defines one progressive onboarding schema for Client Coach and Admin',()=>{
  assert.equal(PROGRESSIVE_ONBOARDING_SCHEMA_VERSION,'iberfit.progressive-onboarding.v1');
  for(const role of ['client','coach','admin']){
    const track=progressiveOnboardingTrack(role);
    assert.ok(track,role);
    assert.equal(track.role,role);
    assert.equal(track.steps.length,5);
    assert.ok(track.home);
    assert.equal(new Set(track.steps.map((step)=>step.id)).size,5);
  }
  assert.equal(progressiveOnboardingTrack('unknown'),null);
});

test('RC62.3 role tracks use only routes already authorized by the canonical navigation model',()=>{
  const nav=read('src/m26/shell/navigation.js');
  const admin=read('src/m26/admin/navigation.js');
  for(const step of progressiveOnboardingTrack('coach').steps)assert.match(nav,new RegExp(`['"]${step.area}['"]`,'u'));
  for(const step of progressiveOnboardingTrack('client').steps)assert.match(nav,new RegExp(`['"]${step.area}['"]`,'u'));
  for(const step of progressiveOnboardingTrack('admin').steps)assert.match(admin,new RegExp(`['"]${step.area}['"]`,'u'));
});

test('RC62.3 persistence scope hashes identity and never embeds raw user id',()=>{
  const raw='user-very-private-123';
  const key=progressiveOnboardingScopeKey({userId:raw,role:'coach'});
  assert.match(key,/^iberfit\.m26\.progressive-onboarding\.v1:coach:[a-f0-9]{8}$/u);
  assert.doesNotMatch(key,/user-very-private-123/u);
  assert.equal(progressiveOnboardingScopeKey({userId:'',role:'coach'}),null);
});

test('RC62.3 normalizes persistence to visited ids hidden and completion only',()=>{
  const state=normalizeProgressiveOnboardingState({
    visited:['coach-today','coach-today','not-valid'],
    hidden:true,
    healthData:{hrv:42},
    email:'secret@example.com',
  },'coach');
  assert.deepEqual(state.visited,['coach-today']);
  assert.equal(state.hidden,true);
  assert.equal(state.completed,false);
  assert.deepEqual(Object.keys(state).sort(),['completed','hidden','role','schemaVersion','visited']);
});

test('RC62.3 repository persists no health profile or arbitrary identity payload',()=>{
  const calls=[];
  const storage={
    getItem(){return null;},
    setItem(key,value){calls.push([key,value]);},
  };
  const repo=createProgressiveOnboardingRepository({storage});
  const key='iberfit.m26.progressive-onboarding.v1:client:12345678';
  repo.write(key,{role:'client',visited:['client-today'],hidden:false,health:{pain:9},name:'Persona'});
  assert.equal(calls.length,1);
  const body=JSON.parse(calls[0][1]);
  assert.deepEqual(Object.keys(body).sort(),['completed','hidden','role','schemaVersion','visited']);
  assert.equal(JSON.stringify(body).includes('pain'),false);
  assert.equal(JSON.stringify(body).includes('Persona'),false);
});

test('RC62.3 route visits progressively complete only the matching role step',()=>{
  let state=normalizeProgressiveOnboardingState({},'coach');
  state=recordProgressiveOnboardingArea(state,'coach','hoy');
  assert.deepEqual(state.visited,['coach-today']);
  const unchanged=recordProgressiveOnboardingArea(state,'coach','admin-auditoria');
  assert.deepEqual(unchanged.visited,['coach-today']);
  state=recordProgressiveOnboardingArea(state,'coach','clientes');
  assert.deepEqual(state.visited,['coach-today','coach-clients']);
});

test('RC62.3 progress exposes one next step and deterministic percentage',()=>{
  const progress=progressiveOnboardingProgress({role:'client',visited:['client-today','client-plan']});
  assert.equal(progress.completedCount,2);
  assert.equal(progress.total,5);
  assert.equal(progress.percent,40);
  assert.equal(progress.nextStep.id,'client-session');
  assert.equal(progress.completed,false);
});

test('RC62.3 panel is non modal dismissible and navigates through canonical route buttons',()=>{
  const state=normalizeProgressiveOnboardingState({visited:['client-today']},'client');
  const html=renderProgressiveOnboardingPanel({role:'client',state});
  assert.match(html,/data-progressive-onboarding-panel/u);
  assert.match(html,/data-progressive-onboarding-dismiss/u);
  assert.match(html,/data-m26-area="planificacion"/u);
  assert.match(html,/<progress max="5" value="1">20%<\/progress>/u);
  assert.doesNotMatch(html,/role="dialog"|aria-modal="true"/u);
  assert.match(html,/No almacena datos de salud ni ejecuta acciones por ti/u);
});

test('RC62.3 application owns onboarding lifecycle and identity scope',()=>{
  const app=read('src/m26/app/application.js');
  assert.match(app,/createProgressiveOnboardingController/u);
  assert.match(app,/onboarding=createProgressiveOnboardingController/u);
  assert.match(app,/userId:session\?\.user\?\.id\|\|''/u);
  assert.match(app,/onboarding\.mount\(\)/u);
  assert.match(app,/onboarding\?\.destroy/u);
});

test('RC62.3 controller remains presentation local-only and reuses canonical navigation events',()=>{
  const source=read('src/m26/onboarding/progressive-onboarding.js');
  assert.match(source,/data-m26-area/u);
  assert.match(source,/MutationObserver/u);
  assert.match(source,/localStorage/u);
  assert.doesNotMatch(source,/commandBus|transport\.|supabase|fetch\(|XMLHttpRequest|service_role/iu);
});

test('RC62.3 keeps Driver.js deferred while native progressive checklist is sufficient',()=>{
  const source=[
    read('src/m26/onboarding/progressive-onboarding.js'),
    read('package.json'),
  ].join('\n');
  assert.doesNotMatch(source,/driver\.js|driverjs|from ['"]driver/iu);
});

test('RC62.3 styling preserves touch targets focus mobile and print behavior',()=>{
  const css=read('src/m26/design/primitives.css');
  assert.match(css,/IBERFIT RC62\.3 · Progressive Onboarding/u);
  assert.match(css,/\.m26-progressive-onboarding-launcher[\s\S]*min-height:var\(--iberfit-size-touch-target\)/u);
  assert.match(css,/\.m26-progressive-onboarding-step[\s\S]*grid-template-columns/u);
  assert.match(css,/@media \(max-width:719px\)[\s\S]*m26-progressive-onboarding/u);
  assert.match(css,/@media print[\s\S]*m26-progressive-onboarding/u);
});

test('RC62.3 stabilizes RC62.2 history and versions the onboarding shell',()=>{
  const prior=read('tests/m26_rc62_2_contextual_guidance.test.mjs');
  const sw=read('public/m26/sw.js');
  assert.match(prior,/preserves durable Guidance closeout/iu);
  assert.match(sw,/VERSION='m26-rc62-3'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc62-2'/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc62-3[^\n]*m26-rc62-2/u);
  assert.match(sw,/"\/src\/m26\/onboarding\/progressive-onboarding\.js"/u);
  assert.match(sw,/m26-rc59-0b[^\n]*m26-rc59-0a[^\n]*m26-rc58-6/u);
});

test('RC62.3 closes RC62 and opens Exercise Media Experience',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(roadmap,/RC62=CLOSED_AGENDA_GUIDANCE_ONBOARDING/u);
  assert.match(roadmap,/RC62_1=CLOSED_AGENDA_STANDARD/u);
  assert.match(roadmap,/RC62_2=CLOSED_GUIDANCE/u);
  assert.match(roadmap,/RC62_3=CLOSED_PROGRESSIVE_ONBOARDING/u);
  assert.match(roadmap,/RC63=IN_PROGRESS_EXERCISE_MEDIA_EXPERIENCE/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});