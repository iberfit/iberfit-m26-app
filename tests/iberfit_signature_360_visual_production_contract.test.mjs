import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {navigationForRole} from '../src/m26/shell/navigation.js';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {renderRouteView} from '../src/m26/modules/route-render.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';
import {experienceNextAction} from '../src/m26/experience/client-experience.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
import {iberfitTranslate} from '../src/m26/ui/i18n.js';
import {createProductionState} from '../src/m26/production-state.js';
import {createShellViewModel} from '../src/m26/shell/shell-view-model.js';
import {renderM26Shell} from '../src/m26/shell/shell-render.js';

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

test('Signature360 records exact U23 production without miscertifying 43 routes',()=>{
  assert.equal(coverage.activeDelivery,'SIGNATURE-U26-authenticated-professional-route-smoke-WIP');
  assert.equal(coverage.productionBaseline.sourceSha,'4c58d70e5f7a984e8bd2663633f7cf9abd68b4e6');
  assert.equal(coverage.productionBaseline.workflowRunId,39479637032);
  assert.equal(coverage.productionBaseline.productionProofUrl,
    'https://github.com/iberfit/iberfit-m26-app/actions/runs/39479637032');
  for(const increment of [
    'signature-client-native-more-escape-focus-recovery-u23',
    'signature-client-tablet-in-flow-dock-no-double-rail-offset-u23',
    'signature-three-role-interactive-route-navigation-u23',
    'signature-mobile-more-native-navigation-and-43-route-shell-inventory-u22',
    'signature-coach-bootstrap-one-read-only-retry-for-exact-sql-timeout-u22',
  ])assert.ok(coverage.productionBaseline.delivered.includes(increment),increment);
  assert.equal(coverage.status,'WIP_NOT_PRODUCTION');
  assert.equal(coverage.qaEvidence.clientRouteReadOnlySmoke.routeCount,9);
  assert.equal(coverage.qaEvidence.clientRouteReadOnlySmoke.neverPromoteToFullAcceptanceAutomatically,true);
  const entries=roles.flatMap(role=>coverage.roles[role]);
  assert.equal(entries.length,43);
  assert.ok(entries.every(entry=>entry.evidenceStatus==='pending'));
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

test('SIGNATURE dock padding remains owned by the dedicated navigation CSS, not generic premium button styles',()=>{
  const premium=fs.readFileSync(new URL('../src/m26/design/premium-ux.css',import.meta.url),'utf8');
  const nav=fs.readFileSync(new URL('../src/m26/ui/client-bottom-nav.css',import.meta.url),'utf8');
  const generic=premium.match(/\.m26-shell button:not\(\.m26-icon-button\):not\(\.m26-nav-item\)[^,]*,/u)?.[0]||'';
  assert.match(generic,/:not\(\.m26-client-bottom-nav-item\)/u);
  assert.match(nav,/\.m26-client-bottom-nav-item\s*\{[\s\S]*?box-sizing:\s*border-box/u);
  assert.match(nav,/@media \(max-width:\s*690px\)[\s\S]*?padding:\s*7px 3px/u);
});

test('Signature360 Client dock uses accessible compact labels without splitting words',()=>{
  const render=fs.readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../src/m26/ui/client-bottom-nav.css',import.meta.url),'utf8');
  const home=fs.readFileSync(new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),'utf8');
  for(const shortLabel of ["shortLabel:'Plan'","shortLabel:'Sesión'","shortLabel:'Avance'"]){
    assert.ok(render.includes(shortLabel),'Client mobile labels must be explicit, concise and never pseudo-content: '+shortLabel);
  }
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
  for(const [source,translations] of [
    ['Plan',{en:'Plan',fr:'Plan',pt:'Plano'}],
    ['Sesión',{en:'Session',fr:'Session',pt:'Sessão'}],
    ['Avance',{en:'Stats',fr:'Suivi',pt:'Avanço'}],
  ]){
    for(const [language,expected] of Object.entries(translations)){
      assert.equal(iberfitSurfaceTranslate(source,{language}),expected);
    }
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
  const upcomingAppointment={
    id:'appointment-confirmed',dateLabel:'17 oct · 11:00',title:'Sesión presencial',statusRaw:'confirmada',
  };
  const withAppointment=renderRouteView({...vm,appointments:[upcomingAppointment],upcoming:[upcomingAppointment]});
  assert.match(withAppointment,/<button type="button" data-m26-area="planificacion" aria-label="Ver próxima cita en tu plan">\s*<span>Próxima cita<\/span>/);
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

test('Signature360 Client Hoy never claims plan publication or IRI self-completion without evidence',()=>{
  const base={role:'client',kind:'hoy',serviceKind:'training',
    clients:[{name:'Cliente QA',serviceActive:true,iri:{confirmed:false,processLabel:'En proceso'}}],
    appointments:[],upcoming:[],rc39:{sessionProjections:[]},clientGuide:{communicationAvailable:false}};
  const pending=renderRouteView(base);
  assert.match(pending,/Tu Coach lo publicará cuando esté listo/);
  assert.match(pending,/Consulta el estado de tu evaluación/);
  assert.doesNotMatch(pending,/Completa tu punto de partida/,'Client should not receive a false IRI self-completion promise');
  const published=renderRouteView({...base,rc39:{sessionProjections:[{id:'published-session',visible:true,canClientStart:false,session:{title:'Sesión confirmada',blocks:[]}}]}});
  assert.match(published,/Sesiones disponibles/,'published sessions are not an unpublished plan');
  assert.match(published,/Consulta las sesiones publicadas/);
  assert.doesNotMatch(published,/Tu Coach lo publicará cuando esté listo/,'do not call published sessions still in preparation');
});

test('Signature360 Client appointment CTA names the actual authorized destination',()=>{
  const next=experienceNextAction({serviceKind:'training',readiness:{nextAppointment:true}},{role:'client'});
  assert.equal(next.area,'planificacion','Cliente has Tu plan, not a separate Agenda route');
  assert.equal(next.label,'Ver próxima cita en tu plan');
  assert.match(next.reason,/fecha y el estado/,'do not claim an appointment is confirmed without its status');
  assert.doesNotMatch(next.reason,/cita confirmada/);

  const vm={role:'client',kind:'hoy',serviceKind:'training',
    clients:[{name:'Cliente QA',serviceActive:true,nextAction:next}],
    appointments:[{id:'upcoming',dateLabel:'Próxima cita',statusRaw:'programada'}],
    upcoming:[],rc39:{sessionProjections:[]},clientGuide:{communicationAvailable:false}};
  const html=renderRouteView(vm);
  const contextual=html.match(/<button type="button" class="m26-client-home-context-action" data-m26-area="planificacion">([\s\S]*?)<\/button>/u)?.[1]||'';
  assert.ok(contextual,'the next appointment action must navigate to Client Tu plan');
  assert.match(contextual,/Ver próxima cita en tu plan/);
  assert.doesNotMatch(contextual,/confirmada/,'a programmed appointment is not automatically confirmed');

  // Old synchronized state may still hold the former Coach-only route.
  // The renderer must remain safe and keep the label consistent after remapping.
  const legacy=renderRouteView({...vm,clients:[{...vm.clients[0],nextAction:{...next,area:'agenda',label:'Ver próxima cita'}}]});
  assert.match(legacy,/class="m26-client-home-context-action" data-m26-area="planificacion">[\s\S]*?<strong>Ver próxima cita en tu plan<\/strong>/);
  assert.doesNotMatch(legacy,/data-m26-area="agenda"/);
  const unauthorized=renderRouteView({...vm,rc39:{sessionProjections:[{id:'published-read-only',visible:true,canClientStart:false,session:{title:'Sesión para consultar'}}]},clients:[{...vm.clients[0],nextAction:{...next,area:'admin-usuarios',label:'Gestionar permisos'}}]});
  assert.doesNotMatch(unauthorized,/class="m26-client-home-context-action"/,'inaccessible role action cannot become a Client CTA');
});

test('Signature360 Client action and status copy remains localized ES EN FR PT',()=>{
  const values=[
    ['Ver próxima cita en tu plan','View next appointment in your plan','Voir le prochain rendez-vous dans votre programme','Ver a próxima marcação no seu plano'],
    ['Consulta el estado de tu evaluación','Check the status of your assessment','Consultez l’état de votre évaluation','Consulte o estado da sua avaliação'],
    ['Sesiones disponibles','Sessions available','Séances disponibles','Sessões disponíveis'],
    ['Plan disponible','Plan available','Programme disponible','Plano disponível'],
    ['Consulta las sesiones publicadas','View published sessions','Consultez les séances publiées','Consulte as sessões publicadas'],
  ];
  for(const [es,en,fr,pt] of values)for(const [language,expected] of [['en',en],['fr',fr],['pt',pt]])
    assert.equal(iberfitSurfaceTranslate(es,{language}),expected,`${language}:${es}`);
});

test('Signature360 Client Plan shows only confirmed upcoming appointments belonging to the authenticated Client',()=>{
  const own='33333333-3333-4333-8333-333333333333';
  const other='44444444-4444-4444-8444-444444444444';
  const now=new Date('2026-10-17T12:00:00Z');
  const state=createProductionState({
    hydration:{status:'ready',confirmedAt:now.toISOString(),serverTime:now.toISOString()},
    identity:{id:'qa-client-user',role:'client',clientId:own,name:'Cliente QA'},
    selectedClientId:other,activeArea:'planificacion',
    collections:{
      clients:[{id:own,name:'Cliente QA',trainingServiceStatus:'active'},{id:other,name:'Persona ajena',trainingServiceStatus:'active'}],
      appointments:[
        {id:'confirmed-own',clientId:own,title:'Sesión presencial propia',startAt:'2026-10-18T16:00:00Z',status:'confirmada',modality:'presencial',location:'Sala IBERFIT'},
        {id:'other-client',clientId:other,title:'Cita privada ajena',startAt:'2026-10-18T17:00:00Z',status:'confirmada'},
        {id:'coach-proposal',clientId:own,title:'Propuesta interna Coach',startAt:'2026-10-18T18:00:00Z',status:'propuesta'},
        {id:'hidden-confirmed',clientId:own,title:'Cita oculta',startAt:'2026-10-18T18:30:00Z',status:'confirmada',visibleToClient:false},
        {id:'withdrawn',clientId:own,title:'Cita cancelada',startAt:'2026-10-18T19:00:00Z',status:'cancelada'},
        {id:'past',clientId:own,title:'Sesión pasada',startAt:'2026-10-16T16:00:00Z',status:'confirmada'},
      ]
    }
  });
  const vm=createRouteViewModel(createShellViewModel(state),state,now);
  assert.equal(vm.kind,'planificacion');
  assert.equal(vm.role,'client');
  assert.deepEqual(vm.clientAppointments.map(item=>item.id),['confirmed-own']);
  const html=renderRouteView(vm);
  assert.match(html,/id="m26-client-next-appointment"/);
  assert.match(html,/Próximas citas/);
  assert.match(html,/Sesión presencial propia/);
  assert.match(html,/Sala IBERFIT/);
  for(const forbidden of ['Cita privada ajena','Propuesta interna Coach','Cita oculta','Cita cancelada','Sesión pasada'])
    assert.ok(!html.includes(forbidden),`Client Plan exposed or invented: ${forbidden}`);
  const noAppointment=renderRouteView({...vm,clientAppointments:[]});
  assert.match(noAppointment,/Sin próximas citas confirmadas/);
  assert.doesNotMatch(noAppointment,/Sesión presencial propia/);
});

test('Signature360 Client Hoy uses upcoming appointments rather than historical today records',()=>{
  const vm={role:'client',kind:'hoy',serviceKind:'training',
    clients:[{name:'Cliente QA',serviceActive:true}],
    appointments:[{id:'earlier',title:'Cita de esta mañana',dateLabel:'Hoy 08:00',statusRaw:'confirmada'}],
    upcoming:[{id:'later',title:'Cita de mañana',dateLabel:'Mañana 10:00',statusRaw:'confirmada'}],
    rc39:{sessionProjections:[]},clientGuide:{communicationAvailable:false}};
  const html=renderRouteView(vm);
  assert.match(html,/<span>Próxima cita<\/span>\s*<strong>Mañana 10:00<\/strong>/);
  assert.doesNotMatch(html,/<span>Próxima cita<\/span>\s*<strong>Hoy 08:00<\/strong>/);
  const none=renderRouteView({...vm,upcoming:[]});
  assert.match(none,/Sin cita programada/);
  assert.doesNotMatch(none,/<span>Próxima cita<\/span>\s*<strong>Hoy 08:00<\/strong>/);
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
  const feature=rule('.m26-shell[data-m26-role="client"] .m26-client-home-feature');
  assert.doesNotMatch(feature,/cream-100|gradient\(/,'large light cards and decorative gradients are forbidden');
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
  assert.match(spec,/toBeLessThanOrEqual\(1\)/,'effective reduced motion must not last more than one millisecond');
  assert.match(spec,/Number\.isFinite\(milliseconds\)/,'non-numeric durations cannot bypass reduced-motion gate');
  assert.doesNotMatch(spec,/toBe\('0s'\)/,'avoid browser-specific serialization of a near-zero transition');
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

test('Signature360 Admin mobile dock uses localized short captions and preserves complete accessible destinations',()=>{
  const identity={id:'qa-admin-dock',role:'admin',name:'Admin sintético'};
  const state=createProductionState({
    hydration:{status:'ready',confirmedAt:'2026-10-16T10:00:00Z',serverTime:'2026-10-16T10:00:00Z'},
    identity,
    environment:'PRODUCTION',
    activeArea:'admin-usuarios',
    collections:createProductionState().collections,
  });
  const vm=createShellViewModel(state);
  const html=renderM26Shell(vm);
  const dock=html.match(/<nav class="m26-mobile-nav"[^>]*>([\s\S]*?)<\/nav>/u)?.[1]||'';
  const sidebar=html.match(/<aside class="m26-sidebar"[^>]*>([\s\S]*?)<\/aside>/u)?.[1]||'';
  assert.ok(dock&&sidebar,'keep separate mobile and desktop navigation');
  assert.match(dock,/data-m26-area="admin-usuarios" aria-current="page" aria-label="Usuarios y accesos"[^>]*>[\s\S]*?<span class="m26-nav-label-standard">Usuarios<\/span><span class="m26-nav-label-micro" aria-hidden="true">Pers\.<\/span>/);
  assert.match(dock,/data-m26-area="admin-agenda" aria-label="Agenda y capacidad"[^>]*>[\s\S]*?<span class="m26-nav-label-standard">Agenda<\/span><span class="m26-nav-label-micro" aria-hidden="true">Citas<\/span>/);
  assert.match(dock,/data-m26-area="admin-operaciones" aria-label="Operaciones"[^>]*>[\s\S]*?<span class="m26-nav-label-standard">Gestión<\/span><span class="m26-nav-label-micro" aria-hidden="true">Ops<\/span>/,'short visual caption retains full semantic destination');
  assert.match(sidebar,/data-m26-area="admin-usuarios"[^>]*>[\s\S]*?<span>Usuarios y accesos<\/span>/,'desktop sidebar keeps its complete label');
  for(const route of ['admin-inicio','admin-usuarios','admin-agenda','admin-operaciones'])
    assert.match(dock,new RegExp('data-m26-area="'+route+'"'),'preserve Admin quick destination '+route);
  const translations={
    es:{users:'Usuarios',agenda:'Agenda',ops:'Gestión'},
    en:{users:'Users',agenda:'Schedule',ops:'Ops'},
    fr:{users:'Comptes',agenda:'Agenda',ops:'Gestion'},
    pt:{users:'Contas',agenda:'Agenda',ops:'Gestão'},
  };
  for(const [language,label] of Object.entries(translations)){
    assert.equal(iberfitTranslate('area.admin-usuarios.mobile',{language}),label.users);
    assert.equal(iberfitTranslate('area.admin-agenda.mobile',{language}),label.agenda);
    assert.equal(iberfitTranslate('area.admin-operaciones.mobile',{language}),label.ops);
    for(const area of ['admin-inicio','admin-usuarios','admin-agenda','admin-operaciones']){
      const caption=iberfitTranslate('area.'+area+'.mobile',{language}).trim();
      assert.ok(caption,'missing compact mobile label');
      assert.ok([...caption].length<=8,`${language}:${area} mobile caption exceeds narrow-dock copy budget`);
    }
  }
  const css=fs.readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
  assert.match(css,/\.m26-shell\[data-m26-role="admin"\] \.m26-mobile-nav > \.m26-nav-item > span/,'no cross-role restyling');
  assert.match(css,/white-space:nowrap/);
  assert.match(css,/text-overflow:ellipsis/);
  assert.match(css,/min-height:3\.25rem/,'Admin dock retains its touch target');
  assert.match(css,/@media\(max-width:420px\)\s*\{\s*\.m26-shell\[data-m26-role="admin"\] \.m26-mobile-nav\s*\{\s*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/,'Admin narrow dock must not inherit five 58px minimum tracks');
  assert.match(css,/\.m26-mobile-nav > \.m26-nav-item:focus-visible\s*\{\s*outline:3px solid Highlight/);
});

test('Signature360 Admin compact navigation has 320px browser evidence for real touch targets and labels',()=>{
  const config=fs.readFileSync(new URL('../playwright.daily-admin-visual.config.mjs',import.meta.url),'utf8');
  const browserSpec=fs.readFileSync(new URL('../qa/admin-interaction/admin-visual-evidence.spec.mjs',import.meta.url),'utf8');
  const adminStyle=fs.readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
  const translations=fs.readFileSync(new URL('../src/m26/ui/i18n.js',import.meta.url),'utf8');
  assert.match(adminStyle,/m26-nav-label-micro/, 'Admin 320px micro captions need a visible responsive style');
  for(const id of ['admin-inicio','admin-usuarios','admin-agenda','admin-operaciones']){
    assert.equal((translations.match(new RegExp('area\\.'+id+'\\.compact','g'))||[]).length,4,'Missing localized micro caption: '+id);
  }
  assert.match(config,/admin-visual-compact-mobile/);
  assert.match(config,/width:320,height:720/);
  assert.match(browserSpec,/if\(viewport\.width<=390\)/,'both 320px and 390px must check the Admin dock');
  const shellRender=fs.readFileSync(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');
  const shellController=fs.readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
  assert.match(shellRender,/m26-nav-label-standard/);
  assert.match(shellRender,/m26-nav-label-micro/);
  assert.match(browserSpec,/getComputedStyle\(candidate\)\.display/,'Browser QA must measure actually visible dock captions');
  assert.match(shellRender, /<summary aria-expanded="false" aria-controls="m26-mobile-more-menu"/, 'Más disclosure must start collapsed');
  const disclosure=fs.readFileSync(new URL('../src/m26/shell/mobile-more-disclosure.js',import.meta.url),'utf8');
  const visualFixture=fs.readFileSync(new URL('../qa/admin-interaction/fixture.mjs',import.meta.url),'utf8');
  assert.match(shellController, /import \{setMobileMoreOpen,syncMobileMoreBackground\}/, 'production shell must use shared disclosure control');
  assert.match(disclosure, /setAttribute\?\.\('aria-expanded',next\?'true':'false'\)/, 'shared disclosure must synchronize its expanded state');
  assert.match(visualFixture, /import \{setMobileMoreOpen\}/, 'real visual fixture must import production disclosure behavior');
  assert.match(visualFixture, /setMobileMoreOpen\(details,!\(details\.open\|\|details\.hasAttribute\('open'\)\)\)/, 'real touch fixture must toggle the shared disclosure');
  for(const state of ["'aria-expanded','false'","'aria-expanded','true'"])
    assert.ok(browserSpec.includes(state), 'browser QA must check both expanded states: '+state);
  for(const contract of ['navScrollWidth','navClientWidth','more.present','more.right','more.hit'])
    assert.ok(browserSpec.includes(contract),`320px Admin Más gate missing: ${contract}`);
  for(const contract of ['scrollWidth','clientWidth','elementFromPoint','aria-label','toBeGreaterThanOrEqual(44)'])
    assert.ok(browserSpec.includes(contract),`Admin dock browser gate missing: ${contract}`);
});

test('Signature360 Admin Users 360 keeps security facts readable and update disclosure keyboard-accessible',()=>{
  const css=fs.readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
  const start=css.indexOf('/* ADMIN_USER_DIRECTORY_EDITORIAL_BEGIN */');
  const end=css.indexOf('/* ADMIN_USER_DIRECTORY_EDITORIAL_END */',start);
  assert.ok(start>=0&&end>start,'use the canonical Admin user-directory CSS section');
  const directory=css.slice(start,end);
  assert.match(directory,/\.m26-admin-user-management > summary:focus-visible\s*\{\s*outline:3px solid/);
  assert.match(directory,/\.m26-admin-user-card-head :is\(h3,p\)\s*\{\s*overflow-wrap:anywhere/);
  const mobile=directory.slice(directory.lastIndexOf('@media(max-width:680px)'));
  assert.match(mobile,/\.m26-admin-user360-grid dt\s*\{\s*font-size:\.75rem/);
  assert.match(mobile,/\.m26-admin-user360-grid small\s*\{\s*font-size:\.8125rem/);
  assert.match(mobile,/\.m26-admin-user360-grid dd strong\s*\{[\s\S]*?overflow-wrap:anywhere/);
  const contrast=directory.slice(directory.lastIndexOf('@media(forced-colors:active)'));
  assert.match(contrast,/\.m26-admin-user-management > summary:focus-visible\s*\{\s*outline-color:Highlight/,'OS high-contrast focus must remain visible');
  assert.match(contrast,/\.m26-admin-user360-card \.m26-admin-badge\s*\{\s*border:1px solid CanvasText/,'security status badges must be visible in high contrast');
  assert.doesNotMatch(contrast,/forced-color-adjust:\s*none/,'do not disable system contrast');
  const rendered=renderAdminRoute({
    kind:'admin-usuarios',admin:true,currentUserId:'qa-admin',
    canManageStatus:true,canManageRoles:false,
    organization:{timezone:'America/Santiago',locale:'es-CL'},
    users:[{id:'qa-user',userId:'qa-user',name:'Persona de prueba con un nombre largo',
      authEmail:'qa.synthetic@example.test',roles:['client'],status:'active',revision:1}],
  });
  assert.match(rendered,/m26-admin-user360-card/);
  assert.match(rendered,/<details class="m26-admin-user-management"><summary>Actualizar usuario<\/summary>/);
  for(const field of ['Último acceso','Relación operativa','Acceso Cliente','Correo de contacto','Coach / cartera','Activación'])
    assert.ok(rendered.includes(field),`Security-relevant fact must never be removed: ${field}`);
  assert.match(rendered,/data-admin-user-search/,'search remains available on mobile');
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

test('SIGNATURE warm optional-activity copy stays localized in four languages',()=>{
  for(const [language,heading,copy] of [
    ['en','Activity on your terms','You can train without a watch. If you choose to share compatible data, you can view it here.'],
    ['fr','Une activité à votre rythme','Vous pouvez vous entraîner sans montre. Si vous choisissez de partager des données compatibles, vous pourrez les consulter ici.'],
    ['pt','Atividade ao seu ritmo','Pode treinar sem relógio. Se optar por partilhar dados compatíveis, poderá consultá-los aqui.'],
  ]){
    assert.equal(iberfitSurfaceTranslate('Actividad a tu ritmo',{language}),heading);
    assert.equal(iberfitSurfaceTranslate('Puedes entrenar sin reloj. Si decides compartir datos compatibles, podrás verlos aquí.',{language}),copy);
  }
});

test('SIGNATURE U1 visual QA visits all nine authenticated Client destinations without business writes',()=>{
  const spec=fs.readFileSync(new URL('../qa/rc64/authenticated-visual-evidence.spec.mjs',import.meta.url),'utf8');
  const roleRenderer=fs.readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  for(const route of ['informes','actividad','mensajes','retos','ajustes']){
    assert.match(roleRenderer,new RegExp('data-m26-area="'+route+'"'),
      'Client Más must preserve the real destination '+route);
    assert.match(spec,new RegExp("'"+route+"'"),
      'Authenticated Client visual QA must visit '+route);
  }
  assert.match(spec,/secondaryClientAreas=\['informes','actividad','mensajes','retos','ajustes'\]/u);
  assert.match(spec,/certifyNonOverlappingClientDock\(page,projectUse,`Cliente \$\{area\}`\)/u,
    'Every additional Client route must verify mobile content is separate from the dock');
  assert.match(spec,/data-client-bottom-nav-route/u,'Route evidence must require the actual active Client destination');
  assert.match(spec,/role="menuitem"/u,'Compact Más destinations must stay keyboard and touch reachable');
  assert.match(spec,/\.m26-sidebar \[data-m26-area=/u,'Desktop Client keeps its own full navigation');
  assert.match(spec,/routeContent\.locator\('\.m26-route-placeholder'\)/u,
    'A placeholder must never be certified as a functional route');
  assert.match(spec,/Client Progreso must retain its own authenticated screenshot/u);
  assert.match(spec,/businessMutationsPerformed:false/u,'Read-only QA never certifies a write as safe');
  assert.match(spec,/expect\(blocked,'Visual evidence attempted a business mutation or foreign request'\)/u);
});

test('SIGNATURE immersive Client workout keeps history and recovery reachable by native scrolling',()=>{
  const css=fs.readFileSync(new URL('../src/m26/ui/client-bottom-nav.css',import.meta.url),'utf8');
  const source=fs.readFileSync(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8');
  const gate=fs.readFileSync(new URL('../qa/device-experience/device-experience.spec.mjs',import.meta.url),'utf8');
  const scope='.m26-shell[data-m26-role="client"]:has(.m26-session-live-secondary-context)';
  assert.ok(css.includes(scope),'Immersive exception must be limited to the active Client session');
  const exception=css.slice(css.indexOf('Immersive Client workout is not'));
  assert.ok(exception.includes('height: auto;')&&exception.includes('overflow: visible;'),
    'Immersive session must restore reachable native scrolling');
  assert.ok(exception.includes('.m26-client-route-shell > :not(.m26-client-bottom-nav-layer)'),
    'The route content must not remain clipped outside the interactive viewport');
  assert.match(source,/class="m26-session-live-secondary-context"/u);
  assert.match(gate,/secondaryContext\.click\(\)/u,
    'Real device regression must exercise History, data and settings without forced clicks');
});

test('SIGNATURE Client compact shell locks document scrolling without disabling route scroll',()=>{
  const css=fs.readFileSync(new URL('../src/m26/ui/client-bottom-nav.css',import.meta.url),'utf8');
  const visual=fs.readFileSync(new URL('../qa/rc64/authenticated-visual-evidence.spec.mjs',import.meta.url),'utf8');
  assert.match(css,/@media \(max-width: 900px\)\s*\{[\s\S]*?\.m26-shell\[data-m26-role="client"\]\s*\{\s*height:\s*100dvh;\s*min-height:\s*0;\s*overflow:\s*clip;/u);
  assert.match(css,/\.m26-client-route-shell > :not\(\.m26-client-bottom-nav-layer\)\s*\{[^}]*overflow-y:\s*auto/u,
    'Only Client route content scrolls, not the outer shell');
  assert.match(visual,/documentScrollY[^\n]*scrollY/u);
  assert.match(css,/\.m26-shell\[data-m26-role="client"\] \.m26-workspace \.m26-main\s*\{[\s\S]*?overflow:\s*clip;/u,
    'Outer main must not be programmatically scrollable by contextual-guide scrollIntoView');
  assert.match(visual,/mainScrollTop/u,'Browser gate measures accidental outer-main scroll');
  assert.match(visual,/hidden main must not scroll the whole dock/u);
  assert.match(visual,/document must not scroll behind the Client dock/u);
  assert.match(visual,/shellBottom[^\n]*viewport-bound/u);
});

test('SIGNATURE mobile dock belongs to a separate viewport row, never the content layer',()=>{
  const css=fs.readFileSync(new URL('../src/m26/ui/client-bottom-nav.css',import.meta.url),'utf8');
  const visual=fs.readFileSync(new URL('../qa/rc64/authenticated-visual-evidence.spec.mjs',import.meta.url),'utf8');
  const start=css.indexOf('SIGNATURE 360 · Non-overlapping Client mobile navigation');
  const end=css.indexOf('@media (max-width: 690px)',start);
  assert.ok(start>=0&&end>start,'responsive Client dock and route must be one CSS composition');
  const layout=css.slice(start,end);
  assert.match(layout,/\.m26-shell\[data-m26-role="client"\] \.m26-workspace \.m26-main\s*\{[^}]*overflow:\s*clip[^}]*padding-bottom:\s*0/u,
    'Non-scrollable outer main protects the dock when guidance scrolls to a setting');
  assert.match(layout,/\.m26-client-route-shell > :not\(\.m26-client-bottom-nav-layer\)\s*\{[^}]*overflow-y:\s*auto/u);
  assert.match(layout,/\.m26-client-bottom-nav-layer\s*\{[^}]*position:\s*relative/u);
  assert.match(layout,/padding-bottom:\s*0/u,'fixed-viewport padding must not compete with a separate dock row');
  assert.match(layout,/grid-auto-rows:\s*max-content/u,'grid rows must preserve full natural height, never crop the next action');
  assert.match(layout,/safe-area-inset-bottom/u);
  assert.match(visual,/certifyNonOverlappingClientDock\(page,projectUse,'Cliente Hoy'\)/u);
  assert.match(visual,/contentBottom[\s\S]*?dockTop/u);
  assert.match(visual,/scrollTop[\s\S]*?maxScroll/u,'final route content remains scroll-reachable');
  assert.match(visual,/featureOwnsPrimary/u,'real-browser test must prevent clipping the primary action');
  assert.match(visual,/authenticated-client-hoy-end/u,'capture the genuinely scrolled final viewport');
  assert.doesNotMatch(layout,/display:\s*none/u,'fix must not hide navigation or interactive content');
});

test('SIGNATURE Client Sessions uses accessible matte surfaces and scoped controls',()=>{
  const css=fs.readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');
  const start=css.indexOf('SIGNATURE 360 · Client Sessions');
  assert.ok(start>0);
  // B27 adds closed native Coach details later in the file; never conflate
  // their safe disclosure state with forbidden Client business-control hiding.
  const nextSection=css.indexOf('/* SIGNATURE B27:',start);
  const signature=css.slice(start,nextSection<0?undefined:nextSection);
  assert.match(signature,/\.m26-shell\[data-m26-role="client"\] \.m26-rc39-sessions/u);
  assert.match(signature,/\.m26-client-sessions-empty/u);
  assert.match(signature,/\.m26-session-preview-actions \.m26-live-workout-action/u);
  assert.match(signature,/min-height:48px/u);
  assert.match(signature,/min-height:50px/u);
  assert.match(signature,/:focus-visible/u);
  assert.match(signature,/@media\(max-width:690px\)/u);
  assert.match(signature,/@media\(forced-colors:active\)/u);
  assert.match(signature,/summary::-webkit-details-marker\{display:none\}/u,'only native disclosure glyph is replaced');
  const withoutNativeGlyph=signature.replace(/summary::-webkit-details-marker\{display:none\}/gu,'');
  assert.doesNotMatch(withoutNativeGlyph,/gradient\(|display:\s*none|pointer-events:\s*none/u,'no hidden business controls or decorative gradients');
});
