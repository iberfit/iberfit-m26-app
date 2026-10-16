import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {navigationForRole} from '../src/m26/shell/navigation.js';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const coverage=JSON.parse(fs.readFileSync(new URL('../qa/visual/signature-360-coverage.json',import.meta.url),'utf8'));
const roles=['client','coach','admin'];

test('Signature 360 inventories exactly every navigable surface for each role',()=>{
  for(const role of roles){
    const nav=navigationForRole(role);
    const actual=[...new Set([...nav.primary,...nav.context,...nav.tools].map(({key})=>key))].sort();
    const entries=coverage.roles[role];
    assert.ok(Array.isArray(entries)&&entries.length>0,role);
    const expected=entries.map(({area})=>area).sort();
    assert.deepEqual(expected,actual,`${role}: update Signature360 coverage when navigation changes`);
    assert.equal(new Set(expected).size,expected.length,`${role}: no duplicate areas`);
    for(const entry of entries){
      assert.match(entry.acceptance,/[^\s]{3,}/,`${role}:${entry.area} missing acceptance`);
      assert.ok(['P0','P1','P2'].includes(entry.priority),`${role}:${entry.area} invalid priority`);
      assert.ok(['pending','verified'].includes(entry.evidenceStatus),`${role}:${entry.area} invalid evidence`);
      if(entry.evidenceStatus==='verified')assert.match(entry.proofUrl||'',/^https:\/\//,`${role}:${entry.area} requires public proof link`);
    }
  }
});

test('Signature360 always requires production evidence and broad responsive/states',()=>{
  assert.equal(coverage.target,'https://app.iberfit.cl');
  assert.ok(['WIP_NOT_PRODUCTION','PRODUCTION_VERIFIED'].includes(coverage.status),'explicit certification state required');
  if(coverage.status==='PRODUCTION_VERIFIED'){
    assert.match(coverage.productionSha||'',/^[0-9a-f]{40}$/,'production source SHA must be exact');
    assert.match(coverage.productionProofUrl||'',/^https:\/\//,'link to exact live deployment evidence');
    for(const role of roles) for(const entry of coverage.roles[role])
      assert.equal(entry.evidenceStatus,'verified',`${role}:${entry.area} lacks authenticated visual evidence`);
  }
  for(const width of [320,390,768,1024,1440]) assert.ok(coverage.viewports.includes(width));
  for(const state of ['loading','empty','populated','error','retry','offline','conflict','session-expired'])
    assert.ok(coverage.screenStates.includes(state),state);
  for(const checkpoint of ['canary-exact-sha','production-promotion-workflow','production-exact-sha','postprod-smoke','rollback-ready'])
    assert.ok(coverage.releaseEvidence.includes(checkpoint),checkpoint);
  for(const topic of ['keyboard-and-focus','mobile-more','touch-and-safe-area','pwa-background-reconnect','no-data-loss','reduced-motion','visual-contrast-wcag-aa'])
    assert.ok(coverage.crossCutting.includes(topic),topic);
});

test('Signature360 form focus remains visually stable across Cliente/Coach/Admin',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
  const formStart=css.indexOf('   FORM CONTROLS');
  const formEnd=css.indexOf('   NOTICES / STATES',formStart);
  assert.ok(formStart>0&&formEnd>formStart,'form controls section must exist');
  const form=css.slice(formStart,formEnd);
  assert.ok(!/transform:\s*translateY\(/.test(form),'focus must not physically move form fields');
  assert.match(form,/outline-offset|box-shadow\s*:/,'focus must retain visible focus indication');
});

test('Signature360 Client dock stays calm, touch-friendly and safe-area aware',()=>{
  const css=fs.readFileSync(new URL('../src/m26/ui/client-bottom-nav.css',import.meta.url),'utf8');
  const itemStart=css.indexOf('.m26-client-bottom-nav-item {');
  const hoverStart=css.indexOf('.m26-client-bottom-nav-item:hover');
  const focusStart=css.indexOf('.m26-client-bottom-nav-item:focus-visible',hoverStart);
  assert.ok(itemStart>=0&&hoverStart>itemStart&&focusStart>hoverStart);
  const item=css.slice(itemStart,hoverStart);
  const hover=css.slice(hoverStart,focusStart);
  assert.match(item,/min-height:\s*66px/,'primary tap targets remain comfortable');
  const declaredTargets=[...css.matchAll(/\.m26-client-bottom-nav-item\s*\{([^}]*)\}/g)]
    .map(([,rules])=>rules.match(/min-height:\s*(\d+)px/)?.[1]).filter(Boolean).map(Number);
  assert.ok(declaredTargets.length>=2,'desktop and mobile dock target sizes must be checked');
  for(const height of declaredTargets)assert.ok(height>=66,`Client dock target falls below 66px at a responsive breakpoint: ${height}px`);
  assert.doesNotMatch(item,/transition:[\s\S]*?transform/,'touch target must not animate position');
  assert.doesNotMatch(hover,/transform\s*:/,'hover cannot move navigation targets');
  assert.match(css,/env\(safe-area-inset-bottom\)/,'notch and home indicator clearance is preserved');
  assert.match(css,/@media \(prefers-reduced-motion:\s*reduce\)/,'motion accessibility is preserved');
  assert.match(css,/\.m26-client-bottom-nav-item:focus-visible/,'keyboard focus must remain visible');
  assert.match(css,/box-shadow:inset 0 2px 0 #C5A059/,'existing M41 active-state signature is retained');
  assert.doesNotMatch(css,/gradient\(/,'Client dock should remain matte');
});

test('Signature360 appointment states remain localized in ES/EN/FR/PT',()=>{
  const values=[
    ['Programada','Scheduled','Programmée','Agendada'],
    ['Confirmada','Confirmed','Confirmée','Confirmada'],
    ['Completada','Completed','Terminée','Concluída'],
    ['Cancelada','Cancelled','Annulée','Cancelada'],
    ['Reprogramada','Rescheduled','Reprogrammée','Reagendada'],
    ['No asistió','Did not attend','Absence','Não compareceu'],
  ];
  for(const [es,en,fr,pt] of values){
    for(const [language,expected] of [['en',en],['fr',fr],['pt',pt]]){
      assert.equal(iberfitSurfaceTranslate(es,{language}),expected,`${language}: ${es}`);
    }
  }
});

test('Signature360 Admin agenda keeps accessible horizontal scroll and chronological order',()=>{
  const css=fs.readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
  assert.match(css,/\.m26-admin-agenda-table:focus-visible/);
  assert.match(css,/\.m26-admin-agenda-table :is\(th,td\):first-child/);
  assert.match(css,/position:sticky/);
  const appointments=[
    {clientName:'Second Person',startAt:'2026-10-18T12:00:00Z',status:'scheduled'},
    {clientName:'Undated Person',startAt:null,status:'scheduled'},
    {clientName:'First Person',startAt:'2026-10-17T12:00:00Z',status:'scheduled'},
  ];
  const html=renderAdminRoute({admin:true,kind:'admin-agenda',
    organization:{timezone:'America/Santiago',locale:'es-CL'},appointments});
  assert.ok(html.includes('class="m26-admin-table m26-admin-agenda-table" role="region" aria-label="Agenda global" tabindex="0"'));
  assert.match(html,/<th scope="col">Cliente<\/th>/);
  assert.match(html,/<tr><td><strong>First Person<\/strong>/);
  assert.ok(html.indexOf('First Person')<html.indexOf('Second Person'));
  assert.ok(html.indexOf('Second Person')<html.indexOf('Undated Person'));
  assert.equal(appointments[0].clientName,'Second Person','render must not reorder source state');
  const empty=renderAdminRoute({admin:true,kind:'admin-agenda',appointments:[]});
  assert.match(empty,/Agenda vacía/);
  assert.doesNotMatch(empty,/tabindex="0"/);
});

test('Signature360 Admin agenda displays people, ownership and localized dates, not raw UUIDs',()=>{
  const vm={
    admin:true,kind:'admin-agenda',
    organization:{timezone:'America/Santiago',locale:'es-CL'},
    appointments:[{
      startAt:'2026-10-16T15:30:00Z',
      clientId:'uuid-client-123',
      clientName:'Ana Pérez',
      coachName:'Coach Roberto',
      modality:'presencial',
      status:'scheduled',
    }],
  };
  const html=renderAdminRoute(vm);
  for(const text of ['Agenda global','Fecha y hora','Cliente','Coach','Modalidad','Estado','Ana Pérez','Coach Roberto','Presencial']){
    assert.ok(html.includes(text),text);
  }
  assert.doesNotMatch(html,/<td>uuid-client-123<\/td>/,'technical ID cannot be the primary attendee label');
  assert.match(html,/<td>Presencial<\/td>/,'use the existing canonical sports modality label');
  assert.match(html,/>Programada<\/span>/,'show a human-readable appointment status');
  const modalities=renderAdminRoute({...vm,appointments:[
    {modality:'guiada_en_app',status:'confirmed'},
    {modality:'online',status:'completed'},
    {modality:'hibrido',status:'rescheduled'},
    {modality:'unknown_custom_mode',status:'unknown_custom_status'},
  ]});
  for(const label of ['Guiada en la aplicación','En línea','Híbrido','Confirmada','Completada','Reprogramada']){
    assert.ok(modalities.includes(label),`agenda human label: ${label}`);
  }
  assert.ok(modalities.includes('unknown_custom_mode'),'unknown appointment modes remain visible for tracing');
  assert.ok(modalities.includes('unknown_custom_status'),'unknown statuses must remain visible instead of being misclassified');

  assert.doesNotMatch(html,/2026-10-16T15:30:00Z/,'render should use organization-local date');
  const missing=renderAdminRoute({...vm,appointments:[{
    clientId:'missing-client',status:'scheduled',
    clientName:'',coachName:'',startAt:null,
  }]});
  assert.ok(missing.includes('Cliente sin identificar'));
  assert.ok(missing.includes('Sin Coach indicado'));
  assert.ok(missing.includes('missing-client'),'missing identity keeps a traceable secondary reference');
  assert.ok(missing.includes('Fecha por confirmar'));
  const unsafe=renderAdminRoute({...vm,appointments:[{
    clientName:'<img src=x onerror=alert(1)>',coachName:'<script>alert(1)</script>',
    modality:'online',status:'scheduled',
  }]});
  assert.doesNotMatch(unsafe,/<img src=x onerror/);
  assert.doesNotMatch(unsafe,/<script>alert\(1\)<\/script>/);
  assert.match(unsafe,/&lt;img/);
});
