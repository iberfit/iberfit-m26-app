import test from 'node:test';
import assert from 'node:assert/strict';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

function clientVM(overrides={}){
  return {
    role:'client',
    serviceKind:'none',
    clients:[{name:'Cliente de prueba',serviceActive:false,iri:{confirmed:true},nextAction:{area:'iri',label:'Ver informe IRI'}}],
    appointments:[],upcoming:[],
    rc39:{sessionProjections:[]},
    operations:{pending:0,conflicts:0,rejected:0},
    wearables:null,
    clientGuide:{communicationAvailable:false},
    challengePreview:null,
    ...overrides
  };
}

test('M42 Solo IRI: no hidden training session, no plan/retos and the only primary action shows reports',()=>{
  const html=renderHoyRoute(clientVM({
    rc39:{sessionProjections:[{id:'old-hidden',visible:true,canClientStart:true,session:{title:'Old hidden workout'}}]}
  }));
  assert.match(html,/Tu punto de partida/);
  assert.match(html,/Diagnóstico IRI/);
  assert.match(html,/data-m26-area="informes"/);
  assert.doesNotMatch(html,/start-published-session|Old hidden workout/);
  assert.doesNotMatch(html,/data-m26-area="planificacion"|data-m26-area="retos"/);
  // Consented health stays available separately from training, including Solo IRI.
  assert.match(html,/class="m26-client-home-primary-zone"[^>]*>[^<]*<button[^>]*data-m26-area="informes"/);
  assert.doesNotMatch(html,/Siguiente paso.*Completar evaluación IRI/);
});

test('M42 Solo IRI: a genuine upcoming appointment is visible without Coach-only navigation',()=>{
  const html=renderHoyRoute(clientVM({
    upcoming:[{id:'iri-appointment',title:'Cita de evaluación IRI',dateLabel:'Mañana',statusRaw:'confirmada'}]
  }));
  assert.match(html,/m26-client-home-appointment/);
  assert.match(html,/Cita de evaluación IRI/);
  assert.doesNotMatch(html,/data-m26-area="agenda"|start-published-session/);
  assert.doesNotMatch(html,/data-m26-area="sesion"/);
});

test('M42 service paused: preserve history but suppress starts even if cached projection says executable',()=>{
  const html=renderHoyRoute(clientVM({
    serviceKind:'training',
    clients:[{name:'Cliente',serviceActive:false,iri:{confirmed:true},cycle:{name:'Plan previo'}}],
    rc39:{sessionProjections:[{id:'from-cache',visible:true,canClientStart:true,session:{title:'Old run'}}]}
  }));
  assert.match(html,/Entrenamiento en pausa/);
  assert.match(html,/Ver mis sesiones/);
  assert.doesNotMatch(html,/start-published-session/);
});

test('M42 active training without published sessions: preserve existing wellbeing CTA and plan access',()=>{
  const html=renderHoyRoute(clientVM({
    serviceKind:'training',
    clients:[{name:'Cliente',serviceActive:true,iri:{confirmed:true},cycle:{name:'Ciclo de 5 semanas'}}]
  }));
  assert.match(html,/Ciclo de 5 semanas/);
  assert.match(html,/Registrar cómo estoy/);
  assert.match(html,/data-m26-area="planificacion"/);
  assert.doesNotMatch(html,/start-published-session/);
});

test('M42 legitimate published autonomous training retains exact canonical start action',()=>{
  const html=renderHoyRoute(clientVM({
    serviceKind:'training',
    clients:[{name:'Cliente',serviceActive:true,iri:{confirmed:true}}],
    rc39:{sessionProjections:[{id:'published-1',visible:true,canClientStart:true,session:{title:'Carrera continua'}}]}
  }));
  assert.match(html,/data-workflow-action="start-published-session" data-entity-id="published-1"/);
  assert.match(html,/Carrera continua/);
});

test('M42 ended training retains historical sessions but does not offer a new workout',()=>{
  const html=renderHoyRoute(clientVM({
    serviceKind:'none',
    clients:[{name:'Cliente',serviceActive:false,trainingServiceStatus:'ended',iri:{confirmed:true}}]
  }));
  assert.match(html,/Tu historial de entrenamiento/);
  assert.match(html,/data-m26-area="sesion"/);
  assert.doesNotMatch(html,/start-published-session/);
  assert.doesNotMatch(html,/Tu evaluación inicial es independiente/);
});

test('M42 legacy status Completada cannot certify an unfinished initial IRI',()=>{
  const html=renderHoyRoute(clientVM({
    clients:[{name:'Cliente',serviceActive:false,trainingServiceStatus:'none',iri:{status:'Completada',confirmed:false}}]
  }));
  assert.match(html,/Consulta el estado de tu evaluación IRI/);
  assert.doesNotMatch(html,/Tu punto de partida confirmado/);
});
