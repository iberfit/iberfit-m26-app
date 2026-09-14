import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CLIENT_CONTEXTUAL_GUIDE_SCHEMA_VERSION,
  clientContextualGuideTipForArea,
  clientContextualGuideScopeKey,
  normalizeClientContextualGuideState,
  createClientContextualGuideRepository,
} from '../src/m26/onboarding/client-contextual-guide.js';
import {renderChallengesRoute,renderHoyRoute,renderRouteView} from '../src/m26/modules/route-render.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('Client guide is contextual by area and includes challenges/community',()=>{
  assert.equal(CLIENT_CONTEXTUAL_GUIDE_SCHEMA_VERSION,'iberfit.client-contextual-guide.v1');
  for(const area of ['hoy','planificacion','sesion','progreso','actividad','mensajes','retos','ajustes']){
    const tip=clientContextualGuideTipForArea(area);
    assert.ok(tip,area);
    assert.equal(tip.area,area);
  }
  assert.equal(clientContextualGuideTipForArea('clientes'),null);
  assert.equal(clientContextualGuideTipForArea('retos').id,'client-context-challenges');
});

test('Client guide persistence stores only acknowledged tip ids under hashed identity scope',()=>{
  const raw='client-private-123';
  const key=clientContextualGuideScopeKey({userId:raw,role:'client'});
  assert.match(key,/^iberfit\.m26\.client-context-guide\.v1:[a-f0-9]{8}$/u);
  assert.doesNotMatch(key,/client-private-123/u);
  assert.equal(clientContextualGuideScopeKey({userId:raw,role:'coach'}),null);

  const calls=[];
  const repo=createClientContextualGuideRepository({storage:{
    getItem(){return null;},
    setItem(k,v){calls.push([k,v]);},
  }});
  repo.write(key,{seenTipIds:['client-context-today','client-context-today','not-real'],health:{pain:9},email:'secret@example.com'});
  const stored=JSON.parse(calls.at(-1)[1]);
  assert.deepEqual(stored.seenTipIds,['client-context-today']);
  assert.deepEqual(Object.keys(stored).sort(),['schemaVersion','seenTipIds']);
  assert.doesNotMatch(JSON.stringify(stored),/pain|secret@example\.com/u);
});

test('Client contextual guide has no numbered tour, checklist, progress meter or next/previous controls',()=>{
  const guide=read('src/m26/onboarding/client-contextual-guide.js');
  assert.match(guide,/data-m26-client-context-guide/u);
  assert.match(guide,/data-m26-client-context-guide-ack/u);
  assert.match(guide,/data-m26-client-context-guide-later/u);
  assert.match(guide,/aria-modal="false"/u);
  assert.doesNotMatch(guide,/Paso \{current\}|data-m26-guided-tour-next|data-m26-guided-tour-previous|<progress/iu);

  const progressive=read('src/m26/onboarding/progressive-onboarding.js');
  assert.match(progressive,/createClientContextualGuideController/u);
  assert.match(progressive,/context\.role==='client'\|\|area!==context\.track\.home/u);
  assert.match(progressive,/if\(context\.role!=='client'\)/u);
});

test('Legacy linear guide is filtered away for Client but remains available for Coach and Admin',()=>{
  const progressive=read('src/m26/onboarding/progressive-onboarding.js');
  assert.match(progressive,/role:'client-contextual'/u);
  assert.match(progressive,/guidedTour\.mount/u);
  assert.match(progressive,/clientContextGuide\.mount/u);
  assert.match(progressive,/guidedTour\.destroy/u);
  assert.match(progressive,/clientContextGuide\.destroy/u);
});

test('Today makes Retos y comunidad directly discoverable without hiding core training navigation',()=>{
  const source=read('src/m26/modules/route-render.js');
  assert.match(source,/data-m26-community-entry/u);
  assert.match(source,/Explorar retos y comunidad/u);
  assert.match(source,/data-m26-area="retos"/u);
  assert.match(source,/Retos y comunidad<\/span><small>Constancia, objetivos e hitos/u);

  const html=renderRouteView({kind:'placeholder',role:'client',title:'Prueba'});
  for(const area of ['hoy','planificacion','sesion','progreso','retos'])assert.match(html,new RegExp(`data-m26-area="${area}"`,'u'));
});

test('Challenges route communicates real private-by-default community state without fake leaderboard',()=>{
  const html=renderChallengesRoute({
    clientId:'client-1',
    challenges:[],
    social:{visibility:'private',sharingEnabled:false,audience:'private'},
  });
  assert.match(html,/data-m26-community-intro/u);
  assert.match(html,/Constancia, objetivos y comunidad con criterio/u);
  assert.match(html,/Tus retos e hitos permanecen privados/u);
  assert.match(html,/no simula comunidad ni posiciones que no existan/u);
  assert.doesNotMatch(html,/puesto #|ranking actual|participantes activos/iu);
});

test('Today client surface exposes the community entry as a real route action',()=>{
  const html=renderHoyRoute({
    role:'client',
    clients:[{name:'Cliente',iri:null,nextAction:null}],
    appointments:[],
    upcoming:[],
    rc39:{sessionProjections:[]},
    operations:{},
  });
  assert.match(html,/m26-client-home-community/u);
  assert.match(html,/data-m26-area="retos"/u);
  assert.match(html,/Constancia que se ve, sin convertirlo en presión/u);
});

test('PWA shell includes contextual guide so installed clients do not lose guidance offline after update',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/"\/src\/m26\/onboarding\/client-contextual-guide\.js"/u);
});
