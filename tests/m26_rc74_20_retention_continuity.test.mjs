import test from 'node:test';
import assert from 'node:assert/strict';

import {augmentRc39ViewModel} from '../src/m26/rc39/view-model.js';

const now=new Date('2026-09-07T12:00:00.000Z');

function baseCollections({appointments=[]}={}){
  return {
    clients:[{id:'client-1',name:'Cliente Demo'}],
    sessions:[],
    appointments,
    sessionExecutions:[],
    checkins:[],
    wearableDailySummaries:[],
    iriAssessments:[],
    reports:[],
    crmClients:[],
    crmTouchpoints:[],
    crmRenewalOffers:[],
    exercisePerformance:[],
  };
}

function stateFor(role,{appointments=[],selectedClientId='client-1'}={}){
  return {
    identity:{id:`${role}-1`,role,clientId:role==='client'?'client-1':null},
    selectedClientId,
    hydration:{serverTime:now.toISOString()},
    environment:{rc39:{appointmentChangeRequests:false}},
    collections:baseCollections({appointments}),
  };
}

function redContinuityAppointments(){
  return [
    {id:'appointment-1',clientId:'client-1',startAt:'2026-09-05T10:00:00.000Z',status:'ausencia_cliente'},
    {id:'appointment-2',clientId:'client-1',startAt:'2026-09-06T10:00:00.000Z',status:'ausencia_cliente'},
  ];
}

function clientsVm(){
  return {
    kind:'clientes',
    role:'coach',
    canCreate:true,
    selectedClientId:'client-1',
    clients:[{
      id:'client-1',
      name:'Cliente Demo',
      modality:'Presencial',
      followUp:{
        signal:{level:'clear',label:'Sin alertas'},
        topAlert:null,
        adherence:null,
        completedSessions:0,
        plannedSessions:0,
      },
    }],
  };
}

test('Coach recibe continuidad canónica en la cola existente de Clientes',()=>{
  const state=stateFor('coach',{appointments:redContinuityAppointments()});
  const vm=augmentRc39ViewModel(clientsVm(),{identity:state.identity},state,now);
  const client=vm.clients[0];

  assert.equal(client.retentionHealth.band,'red');
  assert.equal(client.retentionHealth.label,'Rojo');
  assert.equal(client.followUp.signal.level,'critical');
  assert.equal(client.followUp.signal.label,'Continuidad · Rojo');
  assert.equal(client.followUp.topAlert.source,'retention-health');
  assert.equal(client.followUp.topAlert.title,'Recuperar continuidad');
  assert.equal(client.followUp.retention.requiresCoachDecision,true);
  assert.equal(client.followUp.retention.autoPrescription,false);
  assert.equal(client.followUp.retention.autoMessage,false);
});

test('Admin recibe la misma señal determinista sin automatizar renovación ni contacto',()=>{
  const state=stateFor('admin',{appointments:redContinuityAppointments()});
  const vm=augmentRc39ViewModel(clientsVm(),{identity:state.identity},state,now);
  const health=vm.clients[0].retentionHealth;

  assert.equal(health.band,'red');
  assert.equal(health.provenance,'deterministic-confirmed-data');
  assert.equal(health.requiresCoachDecision,true);
  assert.equal(health.autoPrescription,false);
  assert.equal(health.autoMessage,false);
  assert.equal('command' in health,false);
  assert.equal('publish' in health,false);
  assert.equal('renewAutomatically' in health,false);
});

test('Expediente integra continuidad dentro del foco profesional existente',()=>{
  const state=stateFor('coach',{appointments:redContinuityAppointments()});
  const input={
    kind:'expediente',
    progress:{},
    alerts:[],
    coachCockpit:{
      items:[{
        kind:'warning',
        signalLabel:'Prioridad actual',
        reason:'Revisión profesional pendiente',
        detail:'Contexto existente del expediente.',
        guidance:'Mantener criterio profesional.',
        source:'coach-cockpit',
      }],
    },
  };
  const vm=augmentRc39ViewModel(input,{identity:state.identity},state,now);
  const focus=vm.coachCockpit.items[0];

  assert.equal(vm.retentionHealth.band,'red');
  assert.equal(vm.decisionBrief.mode,'deterministic-explainable');
  assert.equal(focus.reason,'Revisión profesional pendiente');
  assert.equal(focus.source,'coach-cockpit');
  assert.match(focus.detail,/Contexto existente del expediente/);
  assert.match(focus.detail,/Continuidad · Rojo/);
  assert.match(focus.detail,/ausencia/iu);
  assert.match(focus.guidance,/Mantener criterio profesional/);
  assert.match(focus.guidance,/Recuperar continuidad:/);
  assert.match(focus.guidance,/Decisión del Coach obligatoria/);
  assert.equal(focus.retentionSource,'retention-health');
});

test('Cliente no recibe señales internas de retención ni decision brief de Coach',()=>{
  const state=stateFor('client',{appointments:redContinuityAppointments()});
  const input={kind:'expediente',progress:{},alerts:[],coachCockpit:null};
  const vm=augmentRc39ViewModel(input,{identity:state.identity},state,now);

  assert.equal(vm.retentionHealth,undefined);
  assert.equal(vm.decisionBrief,undefined);
  assert.equal(vm.coachCockpit,null);
  assert.equal(vm.rc39.role,'client');
});

test('Evidencia ausente permanece insuficiente y no se convierte en riesgo ficticio',()=>{
  const state=stateFor('coach',{appointments:[]});
  const vm=augmentRc39ViewModel(clientsVm(),{identity:state.identity},state,now);
  const client=vm.clients[0];

  assert.equal(client.retentionHealth.band,'insufficient');
  assert.equal(client.retentionHealth.label,'Evidencia insuficiente');
  assert.equal(client.retentionHealth.riskSignals.length,0);
  assert.equal(client.followUp.signal.level,'info');
  assert.equal(client.followUp.signal.label,'Continuidad · Evidencia insuficiente');
  assert.equal(client.followUp.retention.autoMessage,false);
});

test('Una prioridad existente de igual o mayor severidad no se sobrescribe',()=>{
  const state=stateFor('coach',{appointments:redContinuityAppointments()});
  const input=clientsVm();
  input.clients[0].followUp.signal={level:'critical',label:'Prioridad clínica contextual'};
  input.clients[0].followUp.topAlert={severity:'critical',title:'Revisar dolor informado',source:'checkin'};
  const vm=augmentRc39ViewModel(input,{identity:state.identity},state,now);
  const follow=vm.clients[0].followUp;

  assert.equal(follow.signal.level,'critical');
  assert.equal(follow.signal.label,'Prioridad clínica contextual');
  assert.equal(follow.topAlert.source,'checkin');
  assert.equal(follow.retention.band,'red');
});
