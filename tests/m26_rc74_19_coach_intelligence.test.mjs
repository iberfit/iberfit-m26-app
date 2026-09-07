import test from 'node:test';
import assert from 'node:assert/strict';

import {augmentRc39ViewModel} from '../src/m26/rc39/view-model.js';

const now=new Date('2026-09-07T12:00:00.000Z');

function stateFor(role){
  return {
    identity:{
      id:`${role}-1`,
      role,
      clientId:role==='client'?'client-1':null,
    },
    selectedClientId:'client-1',
    hydration:{serverTime:now.toISOString()},
    environment:{rc39:{appointmentChangeRequests:false}},
    collections:{
      clients:[{id:'client-1',name:'Cliente Demo'}],
      sessions:[],
      appointments:[],
    },
  };
}

function expediente(){
  return {
    kind:'expediente',
    progress:{
      adherence:0.75,
      completedSessions:3,
      plannedSessions:4,
      averageRpe:7.5,
      lastExecutionAt:'2026-09-06T10:00:00.000Z',
      checkins:0,
      wearable:{daysWithData:0},
      unconfirmedExecutions:1,
      dataQuality:'media',
    },
    alerts:[{
      severity:'warning',
      title:'Adherencia por debajo del objetivo',
      action:'Revisar barreras antes de cambiar la carga.',
    }],
    coachCockpit:{
      items:[{
        kind:'warning',
        signalLabel:'Prioridad actual',
        reason:'Seguimiento requerido',
        detail:'Detalle profesional ya existente.',
        guidance:'Mantener la revisión individual del caso.',
        source:'coach-cockpit',
      }],
    },
  };
}

test('Coach recibe inteligencia explicable dentro del foco existente del expediente',()=>{
  const state=stateFor('coach');
  const vm=augmentRc39ViewModel(expediente(),{identity:state.identity},state,now);

  assert.equal(vm.decisionBrief.mode,'deterministic-explainable');
  assert.equal(vm.decisionBrief.confidence,'media');
  assert.ok(vm.decisionBrief.signals.some((item)=>item.includes('Adherencia confirmada: 75% (3 de 4 sesiones).')));
  assert.ok(vm.decisionBrief.signals.some((item)=>item.includes('RPE medio confirmado: 7.5.')));
  assert.ok(vm.decisionBrief.limitations.some((item)=>item.includes('Sin registro de bienestar confirmado')));
  assert.ok(vm.decisionBrief.limitations.some((item)=>item.includes('Sin datos de dispositivo confirmados')));
  assert.ok(vm.decisionBrief.limitations.some((item)=>item.includes('1 ejecución queda fuera del análisis')));
  assert.match(vm.decisionBrief.safetyNote,/no modifica cargas, no publica sesiones/);

  const focus=vm.coachCockpit.items[0];
  assert.equal(focus.kind,'warning');
  assert.equal(focus.signalLabel,'Prioridad actual');
  assert.equal(focus.reason,'Seguimiento requerido');
  assert.equal(focus.source,'coach-cockpit');
  assert.match(focus.detail,/Detalle profesional ya existente/);
  assert.match(focus.detail,/Señal prioritaria: Adherencia por debajo del objetivo/);
  assert.match(focus.guidance,/Mantener la revisión individual del caso/);
  assert.match(focus.guidance,/Siguiente paso: Revisar barreras antes de cambiar la carga/);
  assert.match(focus.guidance,/Límite de evidencia: Sin registro de bienestar confirmado/);
});

test('Admin recibe el mismo apoyo canónico sin crear acciones automáticas',()=>{
  const state=stateFor('admin');
  const vm=augmentRc39ViewModel(expediente(),{identity:state.identity},state,now);

  assert.equal(vm.decisionBrief.mode,'deterministic-explainable');
  assert.equal(vm.decisionBrief.nextStep,'Revisar barreras antes de cambiar la carga.');
  assert.equal('command' in vm.decisionBrief,false);
  assert.equal('publish' in vm.decisionBrief,false);
  assert.equal('loadChange' in vm.decisionBrief,false);
});

test('Cliente no recibe decision brief interno ni se altera su cockpit por esta capa',()=>{
  const state=stateFor('client');
  const input=expediente();
  const vm=augmentRc39ViewModel(input,{identity:state.identity},state,now);

  assert.equal(vm.decisionBrief,undefined);
  assert.deepEqual(vm.coachCockpit,input.coachCockpit);
  assert.equal(vm.rc39.role,'client');
});

test('Sin evidencia suficiente permanece fail-closed y declara límites concretos',()=>{
  const state=stateFor('coach');
  const input={kind:'expediente',progress:{},alerts:[],coachCockpit:{items:[]}};
  const vm=augmentRc39ViewModel(input,{identity:state.identity},state,now);

  assert.equal(vm.decisionBrief.confidence,'limitada');
  assert.match(vm.decisionBrief.signals[0],/no hay suficientes señales confirmadas/i);
  assert.ok(vm.decisionBrief.limitations.length>=3);
  assert.match(vm.coachCockpit.items[0].guidance,/Límite de evidencia:/);
  assert.match(vm.decisionBrief.safetyNote,/no diagnostica/);
});
