import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {navigationForRole} from '../src/m26/shell/navigation.js';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {renderRouteView} from '../src/m26/modules/route-render.js';
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

test('Signature360 Client dock uses accessible compact labels without splitting words',()=>{
  const render=fs.readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../src/m26/ui/client-bottom-nav.css',import.meta.url),'utf8');
  const home=fs.readFileSync(new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),'utf8');
  assert.match(render,/shortLabel:'Tu plan'/,'Client mobile short label must be explicit, not CSS pseudo-content');
  assert.match(render,/aria-label="\$\{escapeHtml\(item\.label\)\}"/,'full destination name remains accessible');
  assert.match(render,/m26-client-bottom-nav-label-compact/);
  assert.match(css,/white-space:nowrap/,'nav words must remain together at narrow widths');
  assert.match(css,/text-overflow:ellipsis/,'avoid spilling into adjacent hit targets');
  assert.match(css,/button\.m26-client-bottom-nav-item \.m26-client-bottom-nav-label-full\s*\{\s*display:none;/);
  assert.match(css,/button\.m26-client-bottom-nav-item \.m26-client-bottom-nav-label-compact\s*\{\s*display:block;/);
  const start=home.indexOf('CLIENT HOME V1 · PREMIUM DAILY MOBILE EXPERIENCE');
  const end=home.indexOf('CLIENT360_DECISION_V2_BEGIN',start);
  const hoy=home.slice(start,end);
  assert.match(hoy,/\.m26-client-home-secondary-disclosure > summary\{\s*display:grid;/,'Mobile disclosure summary is a stable two-column grid');
  assert.match(hoy,/\.m26-client-home-secondary-disclosure > summary::after\{\s*grid-column:2;/,'Disclosure indicator stays in its own column');
  for(const [language,expected] of [['en','Your plan'],['fr','Votre plan'],['pt','O seu plano']]){
    assert.equal(iberfitSurfaceTranslate('Tu plan',{language}),expected);
  }
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

test('Signature360 Client Hoy does not invent appointments when calendar is empty',()=>{
  const vm={role:'client',kind:'hoy',serviceKind:'training',
    clients:[{name:'Cliente de prueba'}],appointments:[],upcoming:[],
    rc39:{sessionProjections:[]},clientGuide:{communicationAvailable:false}};
  const empty=renderRouteView(vm);
  assert.match(empty,/<button type="button" data-m26-area="sesion" aria-label="Ver mis sesiones">/);
  assert.match(empty,/Sin cita programada/);
  assert.match(empty,/Cuando tengas una cita, aparecerá aquí\./);
  assert.doesNotMatch(empty,/Tu Coach la añadirá aquí/,'do not fabricate a future Coach booking');
  assert.match(empty,/data-m26-area="sesion" aria-label="Ver mis sesiones"/,'existing Client session destination remains available without a fictitious booking');
  const withAppointment=renderRouteView({...vm,appointments:[{
    id:'appointment-confirmed',dateLabel:'17 oct · 11:00',title:'Sesión presencial',statusRaw:'confirmada',
  }]});
  assert.match(withAppointment,/<button type="button" data-m26-area="sesion">\s*<span>Próxima cita<\/span>/);
  assert.match(withAppointment,/17 oct · 11:00/);
  assert.match(withAppointment,/Sesión presencial/);
  assert.doesNotMatch(withAppointment,/Sin cita programada/);
  for(const [spanish,en,fr,pt] of [
    ['Sin cita programada','No appointment scheduled','Aucun rendez-vous programmé','Sem consulta agendada'],
    ['Cuando tengas una cita, aparecerá aquí.','Your next appointment will appear here.','Votre prochain rendez-vous apparaîtra ici.','A sua próxima marcação aparecerá aqui.'],
  ]){
    for(const [locale,translation] of [['en',en],['fr',fr],['pt',pt]]){
      assert.equal(iberfitSurfaceTranslate(spanish,{language:locale}),translation);
    }
  }
});

test('Signature360 Client Hoy has matte editorial hierarchy and immobile touch controls',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),'utf8');
  const start=css.indexOf('CLIENT HOME V1 · PREMIUM DAILY MOBILE EXPERIENCE');
  const end=css.indexOf('CLIENT360_DECISION_V2_BEGIN',start);
  assert.ok(start>0&&end>start,'read the existing canonical Client Hoy stylesheet, not an override');
  const home=css.slice(start,end);
  const rule=(selector)=>{
    const pos=home.indexOf(selector+'{');
    assert.ok(pos>=0,`Missing Client Hoy selector: ${selector}`);
    return home.slice(pos,home.indexOf('}',pos)+1);
  };
  const hero=rule('.m26-shell[data-m26-role="client"] .m26-client-home-hero');
  assert.doesNotMatch(hero,/gradient\(/,'Hero must be matte without gradients');
  assert.match(hero,/background:var\(--iberfit-color-surface-base\)/);
  const greeting=rule('.m26-shell[data-m26-role="client"] .m26-client-home-greeting h2');
  assert.match(greeting,/overflow-wrap:anywhere/,'long names must never overflow 320px');
  assert.match(greeting,/line-height:1\.15/,'editorial heading needs comfortable line spacing');
  const detail=rule('.m26-shell[data-m26-role="client"] .m26-client-home-greeting > p:not(.m26-eyebrow)');
  assert.match(detail,/line-height:1\.55/,'secondary copy must remain legible');
  const primary=rule('.m26-shell[data-m26-role="client"] .m26-client-home-primary-zone .m26-today-action.is-primary');
  assert.match(primary,/transform:none/);
  assert.doesNotMatch(primary,/transition:[^;]*transform/,'CTA must not jump under a finger');
  const hover=rule('.m26-shell[data-m26-role="client"] .m26-client-home-primary-zone .m26-today-action.is-primary:hover');
  assert.match(hover,/transform:none/,'avoid inherited translateY on hover');
  const focus=rule('.m26-shell[data-m26-role="client"] .m26-client-home-primary-zone .m26-today-action.is-primary:focus-visible');
  assert.match(focus,/outline:3px solid/);
  const secondary=rule('.m26-shell[data-m26-role="client"] .m26-client-home-secondary-disclosure > summary:focus-visible');
  assert.match(secondary,/outline:3px solid/,'secondary disclosure needs keyboard-visible focus');
  const compact=home.slice(home.lastIndexOf('@media(max-width:390px)'));
  assert.match(compact,/font-size:\.875rem/,'secondary actions remain readable on 320px screens');
  assert.doesNotMatch(compact,/font-size:\.76rem/,'do not regress to tiny mobile labels');
});

test('Signature360 Client Hoy evidence includes authenticated compact mobile 320px and real overflow checks',()=>{
  const config=fs.readFileSync(new URL('../playwright.authenticated-visual.config.mjs',import.meta.url),'utf8');
  const spec=fs.readFileSync(new URL('../qa/rc64/authenticated-visual-evidence.spec.mjs',import.meta.url),'utf8');
  assert.match(config,/authenticated-visual-compact-mobile-chromium/);
  assert.match(config,/width:320,height:720/);
  assert.match(spec,/data-m26-area="hoy"/);
  assert.match(spec,/m26-client-home-v1/);
  assert.match(spec,/authenticated-client-hoy/);
  assert.match(spec,/scrollWidth/);
  assert.match(spec,/transitionDuration/);
  assert.match(spec,/businessMutationsPerformed:false/,'authenticated evidence must remain read-only');
});

test('Signature360 Client Hoy respects reduced motion and forced-colors contrast',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),'utf8');
  const section=css.slice(css.indexOf('CLIENT HOME V1 · PREMIUM DAILY MOBILE EXPERIENCE'),css.indexOf('CLIENT360_DECISION_V2_BEGIN'));
  assert.match(section,/@media\(prefers-reduced-motion:reduce\)\s*\{/);
  const reduced=section.slice(section.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced,/\.m26-shell\[data-m26-role="client"\] \.m26-client-home-primary-zone \.m26-today-action\.is-primary\s*\{\s*transition:none;/);
  assert.match(section,/@media\(forced-colors:active\)/);
  const contrast=section.slice(section.indexOf('@media(forced-colors:active)'));
  for(const color of ['Canvas','CanvasText','ButtonFace','ButtonText','Highlight'])
    assert.ok(contrast.includes(color),`System color token absent: ${color}`);
  assert.doesNotMatch(contrast,/forced-color-adjust:\s*none/,'Allow system forced color adjustments');
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
