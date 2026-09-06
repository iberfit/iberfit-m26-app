import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveCoachCockpit,
  augmentCoachCockpitWithCrm,
} from '../src/m26/experience/coach-cockpit.js';
import {applyCommercialCoachCockpit} from '../src/m26/communication/view-model.js';

const NOW=new Date('2026-09-06T18:00:00Z');

function baseCockpit({alerts=[]}={}){
  return deriveCoachCockpit([
    {
      client:{
        id:'c1',
        name:'Ana',
        experience:{stage:'active',priority:1},
        nextAction:{key:'followup',label:'Revisar expediente',area:'expediente'},
      },
      alerts,
    },
  ]);
}

function crm(status,{date='2026-09-01T10:00:00.000Z'}={}){
  return {
    clientId:'c1',
    clientName:'Ana',
    client:{plan:'Híbrido 2x/sem',modality:'hibrido'},
    renewal:{
      status,
      statusLabel:status==='overdue'?'Renovación vencida':'Renovación próxima',
      date,
      evidence:status==='overdue'
        ?'La fecha explícita de renovación ya pasó. No implica impago ni abandono.'
        :'Existe una fecha explícita de renovación próxima.',
    },
  };
}

test('Renovación vencida entra como proceso comercial manual sin contaminar riskFocus',()=>{
  const cockpit=augmentCoachCockpitWithCrm(baseCockpit(),[crm('overdue')]);
  assert.equal(cockpit.totalClients,1);
  assert.equal(cockpit.processCount,1);
  assert.equal(cockpit.attentionCount,1);
  assert.equal(cockpit.riskFocus,null);
  const item=cockpit.items.find((entry)=>entry.source==='crm-renewals');
  assert.ok(item);
  assert.equal(item.kind,'process');
  assert.equal(item.actionType,'manual-attention');
  assert.equal(item.nextAction.area,'clientes');
  assert.equal(item.requiresHumanDecision,true);
  assert.equal(item.autoMessage,false);
  assert.equal(item.autoCharge,false);
  assert.equal(item.paymentInference,false);
  assert.match(item.guidance,/no implica impago ni abandono/iu);
  assert.doesNotMatch(item.guidance,/cobrar|deuda confirmada/iu);
});

test('Renovación próxima es información comercial y no genera atención de riesgo',()=>{
  const cockpit=augmentCoachCockpitWithCrm(
    baseCockpit(),
    [crm('upcoming',{date:'2026-09-15T10:00:00.000Z'})],
  );
  assert.equal(cockpit.totalClients,1);
  assert.equal(cockpit.infoCount,1);
  assert.equal(cockpit.attentionCount,0);
  assert.equal(cockpit.riskFocus,null);
  const item=cockpit.items.find((entry)=>entry.source==='crm-renewals');
  assert.equal(item.kind,'info');
  assert.equal(item.nextAction.area,'clientes');
  assert.equal(item.paymentInference,false);
});

test('Estados comerciales sin acción no introducen ruido en el Cockpit',()=>{
  for(const status of ['insufficient','current','completed']){
    const cockpit=augmentCoachCockpitWithCrm(baseCockpit(),[crm(status)]);
    assert.equal(cockpit.items.filter((entry)=>entry.source==='crm-renewals').length,0,status);
    assert.equal(cockpit.totalClients,1,status);
  }
});

test('La proyección CRM es idempotente y no duplica cliente ni acción',()=>{
  const once=augmentCoachCockpitWithCrm(baseCockpit(),[crm('overdue')]);
  const twice=augmentCoachCockpitWithCrm(once,[crm('overdue')]);
  assert.equal(twice.totalClients,1);
  assert.equal(twice.items.filter((entry)=>entry.source==='crm-renewals').length,1);
  assert.equal(twice.processCount,1);
});

test('Un riesgo operativo existente conserva riskFocus frente a una renovación vencida',()=>{
  const base=baseCockpit({
    alerts:[{
      severity:'warning',
      title:'Adherencia a revisar',
      detail:'Señal observable de seguimiento.',
      action:'Revisar contexto.',
      source:'adherence',
    }],
  });
  const cockpit=augmentCoachCockpitWithCrm(base,[crm('overdue')]);
  assert.equal(cockpit.riskFocus.kind,'warning');
  assert.equal(cockpit.riskFocus.source,'adherence');
  assert.notEqual(cockpit.riskFocus.source,'crm-renewals');
  assert.equal(cockpit.totalClients,1);
});

test('La proyección de ruta compone evidencia comercial canónica para Hoy sin inferir pagos',()=>{
  const state={
    selectedClientId:'c1',
    collections:{
      clients:[{id:'c1',name:'Ana',status:'active'}],
      clientProfiles:[{id:'p1',clientId:'c1',modality:'hybrid',weeklyFrequency:2}],
      trainingCycles:[],
      domainEvents:[],
      m26Entities:[{
        id:'crm1',
        clientId:'c1',
        entityType:'commercial',
        planName:'Híbrido 2x/sem',
        renewalDate:'2026-09-01T10:00:00Z',
      }],
    },
  };
  const view={
    kind:'hoy',
    clients:[{id:'c1',name:'Ana'}],
    coachCockpit:baseCockpit(),
  };
  const projected=applyCommercialCoachCockpit(view,state,NOW);
  const item=projected.coachCockpit.items.find((entry)=>entry.source==='crm-renewals');
  assert.ok(item);
  assert.equal(item.clientName,'Ana');
  assert.equal(item.renewalStatus,'overdue');
  assert.equal(item.paymentInference,false);
  assert.equal(projected.coachCockpit.riskFocus,null);
});