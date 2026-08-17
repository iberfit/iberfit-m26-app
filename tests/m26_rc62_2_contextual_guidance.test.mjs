import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CONTEXTUAL_GUIDANCE_SCHEMA_VERSION,
  contextualGuidance,
  renderGuidanceTrigger,
  renderGuidancePopover,
} from '../src/m26/guidance/contextual-guidance.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC62.2 guidance has one canonical schema and required topics',()=>{
  assert.equal(CONTEXTUAL_GUIDANCE_SCHEMA_VERSION,'iberfit.contextual-guidance.v1');
  for(const key of ['iri','vfc','data-quality','data-source','data-coverage','data-method','training-load']){
    const entry=contextualGuidance(key);
    assert.ok(entry,key);
    assert.ok(entry.title.length>2,key);
    assert.ok(entry.summary.length>20,key);
    assert.ok(entry.points.length>=3,key);
  }
  assert.equal(contextualGuidance('unknown'),null);
});

test('RC62.2 IRI help explicitly stays non-clinical and non-automatic',()=>{
  const entry=contextualGuidance('iri');
  const copy=[entry.summary,...entry.points].join(' ');
  assert.match(copy,/no sustituye una valoración clínica/iu);
  assert.match(copy,/ni genera una prescripción automática/iu);
});

test('RC62.2 VFC help requires homogeneous method and separates RMSSD from SDNN',()=>{
  const entry=contextualGuidance('vfc');
  const copy=[entry.summary,...entry.points].join(' ');
  assert.match(copy,/método es conocido y homogéneo/iu);
  assert.match(copy,/RMSSD y SDNN no se intercambian/iu);
  assert.match(copy,/no cambia automáticamente/iu);
});

test('RC62.2 quality and coverage explain trust without fabricating health meaning',()=>{
  const quality=[contextualGuidance('data-quality').summary,...contextualGuidance('data-quality').points].join(' ');
  const coverage=[contextualGuidance('data-coverage').summary,...contextualGuidance('data-coverage').points].join(' ');
  assert.match(quality,/no clasifica la salud/iu);
  assert.match(quality,/nunca como cero inventado/iu);
  assert.match(coverage,/no se imputan ni se convierten en cero/iu);
});

test('RC62.2 source and method help preserve provenance and comparability',()=>{
  const source=[contextualGuidance('data-source').summary,...contextualGuidance('data-source').points].join(' ');
  const method=[contextualGuidance('data-method').summary,...contextualGuidance('data-method').points].join(' ');
  assert.match(source,/fuente necesaria para interpretar y auditar/iu);
  assert.match(method,/comparables/iu);
  assert.match(method,/método relevante es desconocido/iu);
});

test('RC62.2 training-load help explains RPE and RIR without automatic prescription',()=>{
  const entry=contextualGuidance('training-load');
  const copy=[entry.summary,...entry.points].join(' ');
  assert.match(copy,/RPE expresa esfuerzo percibido/iu);
  assert.match(copy,/RIR estima repeticiones/iu);
  assert.match(copy,/no órdenes automáticas/iu);
  assert.match(copy,/entrenador decide/iu);
});

test('RC62.2 trigger and popover are keyboard-semantic and catalog-bound',()=>{
  const trigger=renderGuidanceTrigger('vfc',{label:'Ayuda VFC'});
  const popover=renderGuidancePopover('vfc');
  assert.match(trigger,/type="button"/u);
  assert.match(trigger,/data-guidance-key="vfc"/u);
  assert.match(trigger,/aria-haspopup="dialog"/u);
  assert.match(trigger,/aria-expanded="false"/u);
  assert.match(popover,/role="dialog"/u);
  assert.match(popover,/aria-modal="false"/u);
  assert.match(popover,/data-guidance-close/u);
  assert.equal(renderGuidanceTrigger('not-real'),'');
  assert.equal(renderGuidancePopover('not-real'),'');
});

test('RC62.2 controller handles Escape focus return and no backend mutation surface',()=>{
  const source=read('src/m26/guidance/contextual-guidance.js');
  assert.match(source,/event\.key==='Escape'/u);
  assert.match(source,/activeTrigger\.focus/u);
  assert.match(source,/aria-expanded/u);
  assert.doesNotMatch(source,/commandBus|transport\.|supabase|fetch\(|XMLHttpRequest|service_role/iu);
});

test('RC62.2 application owns guidance lifecycle',()=>{
  const app=read('src/m26/app/application.js');
  assert.match(app,/createContextualGuidanceController/u);
  assert.match(app,/guidance=createContextualGuidanceController\(\{root\}\)/u);
  assert.match(app,/guidance\.mount\(\)/u);
  assert.match(app,/guidance\?\.destroy/u);
});

test('RC62.2 contextual help is attached to IRI VFC trust and training load surfaces',()=>{
  const route=read('src/m26/modules/route-render.js');
  const longitudinal=read('src/m26/data-experience/longitudinal-ui.js');
  const trust=read('src/m26/data-experience/data-trust.js');
  const session=read('src/m26/workflows/session-ui.js');
  assert.match(route,/renderGuidanceTrigger\('iri'/u);
  assert.match(longitudinal,/renderGuidanceTrigger\('vfc'/u);
  assert.match(trust,/guidanceKey:'data-source'/u);
  assert.match(trust,/guidanceKey:'data-quality'/u);
  assert.match(trust,/guidanceKey:'data-coverage'/u);
  assert.match(trust,/guidanceKey:'data-method'/u);
  assert.match(session,/renderGuidanceTrigger\('training-load'/u);
});

test('RC62.2 guidance meets touch target focus and responsive popover rules',()=>{
  const css=read('src/m26/design/primitives.css');
  assert.match(css,/IBERFIT RC62\.2 · Contextual Guidance/u);
  assert.match(css,/\.m26-guidance-trigger\{[\s\S]*min-width:var\(--iberfit-size-touch-target\)/u);
  assert.match(css,/\.m26-guidance-trigger:focus-visible/u);
  assert.match(css,/\.m26-guidance-popover\{[\s\S]*position:fixed/u);
  assert.match(css,/@media \(max-width:719px\)[\s\S]*\.m26-guidance-popover/u);
});

test('RC62.2 stabilizes RC62.1 history and versions the guidance shell',()=>{
  const prior=read('tests/m26_rc62_1_agenda_standard.test.mjs');
  const sw=read('public/m26/sw.js');
  assert.match(prior,/preserves durable Agenda Standard closeout/iu);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc62-2[^\n]*m26-rc62-1/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc62-2[^\n]*m26-rc62-1/u);
  assert.match(sw,/"\/src\/m26\/guidance\/contextual-guidance\.js"/u);
});

test('RC62.2 preserves durable Guidance closeout and cross-cutting rails',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(roadmap,/RC62_2=CLOSED_GUIDANCE/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});