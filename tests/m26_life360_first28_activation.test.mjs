import test from 'node:test';
import assert from 'node:assert/strict';
import {buildClientFirst28Activation} from '../src/m26/experience/first28-activation.js';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const NOW=new Date('2026-11-05T15:00:00Z');
const CLIENT={id:'owner',createdAt:'2026-11-03T12:00:00Z',trainingServiceStatus:'active'};
const EXPERIENCE={serviceKind:'training',readiness:{cycle:true}};
const PROGRESS={clientId:'owner',days:28,completedSessions:1,checkins:2};
const run=overrides=>buildClientFirst28Activation({
  clientId:'owner',client:CLIENT,experience:EXPERIENCE,progress:PROGRESS,now:NOW,...overrides,
});
test('First28 uses true Santiago enrollment day and authorized recent evidence',()=>{
  const a=run();
  assert.equal(a.day,3);
  assert.equal(a.anchor,'client-enrollment');
  assert.equal(a.confirmedSessions,1);
  assert.equal(a.confirmedCheckins,2);
  assert.equal(a.next.area,'progreso');
  assert.equal(a.actionsAreNavigationOnly,true);
});
test('First28 is not shown for another client, paused service, invalid or expired enrollment',()=>{
  assert.equal(run({clientId:'foreign'}),null);
  assert.equal(run({client:{...CLIENT,trainingServiceStatus:'paused'}}),null);
  assert.equal(run({client:{...CLIENT,createdAt:'2025-11-03'}}),null);
  assert.equal(run({client:{...CLIENT,createdAt:'2026-12-01'}}),null);
  assert.equal(run({client:{...CLIENT,createdAt:'2026-02-30'}}),null);
  assert.equal(run({client:{...CLIENT,createdAt:null}}),null);
});
test('First28 unknown or cross-client progress never becomes false zero',()=>{
  for(const progress of [null,{...PROGRESS,clientId:'foreign'},{...PROGRESS,days:7}]){
    const a=run({progress});
    assert.equal(a.confirmedSessions,null);
    assert.equal(a.confirmedCheckins,null);
    assert.equal(a.next.area,'sesion');
  }
  assert.equal(run({experience:{serviceKind:'training',readiness:{cycle:false}}}).next.area,'planificacion');
  assert.equal(run({progress:{...PROGRESS,checkins:0}}).next.area,'actividad');
});
test('First28 lives inside existing Client training journey, not another Start or IRI',()=>{
  const vm={role:'client',serviceKind:'training',
    clients:[{id:'owner',name:'Cliente QA',serviceActive:true,cycle:{name:'Ciclo'},iri:{confirmed:false}}],
    appointments:[],upcoming:[],rc39:{sessionProjections:[]},operations:{},
    clientFirst28:run()};
  const html=renderHoyRoute(vm);
  assert.match(html,/data-m26-first28="3"/u);
  assert.match(html,/data-m26-client-training-journey/u);
  assert.match(html,/data-m26-area="progreso">Ver mi evolución/u);
  assert.doesNotMatch(html,/data-m26-first28[^>]*data-workflow-action="start-published-session"/u);
  assert.doesNotMatch(renderHoyRoute({...vm,serviceKind:'iri_only'}),/data-m26-first28/u);
});
test('First28 labels remain localized in every supported language',()=>{
  for(const language of ['en','fr','pt']){
    for(const label of ['Primeros 28 días','Día','de 28 desde tu alta',
      'Consultar mi planificación','Entrenamiento confirmado en el historial reciente',
      'Bienestar registrado como contexto']){
      assert.notEqual(iberfitSurfaceTranslate(label,{language}),label,language+' '+label);
    }
  }
});
