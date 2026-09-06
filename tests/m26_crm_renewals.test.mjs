import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCrmRenewalSummary} from '../src/m26/engagement/crm-renewals.js';

const NOW=new Date('2026-09-06T18:00:00Z');

function baseState(){
  return {
    collections:{
      clients:[{id:'c1',status:'active',createdAt:'2026-07-01T10:00:00Z'}],
      clientProfiles:[{id:'p1',clientId:'c1',modality:'hybrid',weeklyFrequency:2,updatedAt:'2026-08-30T10:00:00Z'}],
      trainingCycles:[{id:'tc1',clientId:'c1',name:'Fuerza base',status:'active',startDate:'2026-08-01',endDate:'2026-09-08',goal:'Consolidar técnica'}],
      m26Entities:[],
      domainEvents:[],
    },
  };
}

test('CRM Renewal exposes explicit canonical commercial evidence without inventing payment state',()=>{
  const state=baseState();
  state.collections.m26Entities.push({
    id:'crm1',clientId:'c1',entityType:'crm',updatedAt:'2026-09-01T10:00:00Z',
    planName:'Híbrido 2x/sem',commercialStatus:'active',commercialCycleStart:'2026-09-01',commercialCycleEnd:'2026-09-30',
    renewalDate:'2026-09-15T10:00:00Z',renewalStatus:'pending',
  });
  state.collections.domainEvents.push({
    id:'ev1',clientId:'c1',eventName:'RENOVACION_CONTACTO_REGISTRADO',actorRole:'coach',actorId:'coach-1',createdAt:'2026-09-05T12:00:00Z',reason:'Confirmar continuidad',
  });

  const crm=buildCrmRenewalSummary(state,'c1',{now:NOW});
  assert.equal(crm.client.status,'active');
  assert.equal(crm.client.modality,'hibrido');
  assert.equal(crm.client.weeklyFrequency,2);
  assert.equal(crm.client.plan,'Híbrido 2x/sem');
  assert.equal(crm.renewal.status,'upcoming');
  assert.equal(crm.renewal.date,'2026-09-15T10:00:00.000Z');
  assert.equal(crm.renewal.daysToRenewal,9);
  assert.equal(crm.payment.status,'insufficient');
  assert.equal(crm.payment.available,false);
  assert.match(crm.payment.evidence,/no se infiere pago, impago ni deuda/iu);
  assert.equal(crm.actions.length,1);
  assert.equal(crm.actions[0].actorRole,'coach');
  assert.equal(crm.guardrails.requiresHumanDecision,true);
  assert.equal(crm.guardrails.autoCharge,false);
  assert.equal(Object.isFrozen(crm),true);
});

test('Training cycle end is context only and never becomes a commercial renewal date',()=>{
  const crm=buildCrmRenewalSummary(baseState(),'c1',{now:NOW});
  assert.equal(crm.trainingCycle.endDate,'2026-09-08T00:00:00.000Z');
  assert.equal(crm.trainingCycle.commercialRenewalSource,false);
  assert.equal(crm.renewal.status,'insufficient');
  assert.equal(crm.renewal.date,null);
  assert.equal(crm.payment.status,'insufficient');
});

test('Explicit past renewal date is overdue but does not infer impago or abandonment',()=>{
  const state=baseState();
  state.collections.m26Entities.push({
    id:'crm2',clientId:'c1',entityType:'commercial',updatedAt:'2026-09-01T10:00:00Z',
    renewalDate:'2026-09-01T10:00:00Z',
  });
  const crm=buildCrmRenewalSummary(state,'c1',{now:NOW});
  assert.equal(crm.renewal.status,'overdue');
  assert.equal(crm.renewal.daysToRenewal,-5);
  assert.match(crm.renewal.evidence,/no implica impago ni abandono/iu);
  assert.equal(crm.payment.status,'insufficient');
});

test('CRM Renewal is isolated by clientId',()=>{
  const state=baseState();
  state.collections.clients.push({id:'c2',status:'active'});
  state.collections.m26Entities.push({id:'crm-c2',clientId:'c2',entityType:'crm',renewalDate:'2026-08-01T10:00:00Z'});
  state.collections.domainEvents.push({id:'ev-c2',clientId:'c2',eventName:'RENOVACION_VENCIDA',actorRole:'admin',createdAt:'2026-09-01T10:00:00Z'});
  const crm=buildCrmRenewalSummary(state,'c1',{now:NOW});
  assert.equal(crm.renewal.status,'insufficient');
  assert.equal(crm.renewalHistory.length,0);
  assert.equal(crm.actions.length,0);
});

test('CRM Renewal fails closed on missing client id and invalid time window',()=>{
  assert.equal(buildCrmRenewalSummary(baseState(),null,{now:NOW}),null);
  assert.throws(()=>buildCrmRenewalSummary(baseState(),'c1',{now:'not-a-date'}),/M26_CRM_NOW_INVALID/u);
  assert.throws(()=>buildCrmRenewalSummary(baseState(),'c1',{now:NOW,upcomingDays:0}),/M26_CRM_UPCOMING_DAYS_INVALID/u);
});
