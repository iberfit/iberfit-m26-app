import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommercialPortfolio,
  commercialRenewalLabel,
  normalizeCommercialRenewalFilter,
  commercialRenewalFilterMatches,
} from '../src/m26/communication/view-model.js';

const NOW=new Date('2026-09-06T18:00:00Z');

function stateWithCommercialEvidence(){
  return {
    identity:{role:'coach'},
    collections:{
      clients:[
        {id:'c1',name:'Ana',status:'active'},
        {id:'c2',name:'Luis',status:'active'},
        {id:'c3',name:'Eva',status:'active'},
      ],
      clientProfiles:[
        {id:'p1',clientId:'c1',modality:'hybrid',weeklyFrequency:2},
        {id:'p2',clientId:'c2',modality:'online',weeklyFrequency:3},
        {id:'p3',clientId:'c3',modality:'presencial',weeklyFrequency:1},
      ],
      trainingCycles:[],
      domainEvents:[],
      m26Entities:[
        {
          id:'crm1',
          clientId:'c1',
          entityType:'commercial',
          planName:'Híbrido 2x/sem',
          renewalDate:'2026-09-01T10:00:00Z',
        },
        {
          id:'crm2',
          clientId:'c2',
          entityType:'commercial',
          planName:'Online 3x/sem',
          renewalDate:'2026-09-15T10:00:00Z',
        },
      ],
    },
  };
}

function portfolioVm(role='coach'){
  return {
    kind:'clientes',
    role,
    clients:[
      {id:'c1',name:'Ana'},
      {id:'c2',name:'Luis'},
      {id:'c3',name:'Eva'},
    ],
    selectedClientId:'c1',
  };
}

test('Cartera comercial distingue vencida, próxima y ausencia de evidencia sin inferir pagos',()=>{
  const projected=applyCommercialPortfolio(portfolioVm(),stateWithCommercialEvidence(),NOW);
  assert.equal(projected.commercialPortfolio.total,3);
  assert.deepEqual(projected.commercialPortfolio.counts,{
    overdue:1,
    upcoming:1,
    current:0,
    completed:0,
    insufficient:1,
  });

  const ana=projected.clients.find((client)=>client.id==='c1');
  const luis=projected.clients.find((client)=>client.id==='c2');
  const eva=projected.clients.find((client)=>client.id==='c3');

  assert.equal(ana.commercial.renewal.status,'overdue');
  assert.equal(ana.commercial.renewal.label,'Renovación por revisar');
  assert.equal(ana.commercial.renewal.requiresHumanDecision,true);
  assert.equal(ana.commercial.payment.status,'insufficient');
  assert.equal(ana.commercial.payment.available,false);

  assert.equal(luis.commercial.renewal.status,'upcoming');
  assert.equal(luis.commercial.renewal.requiresHumanDecision,true);
  assert.equal(luis.commercial.payment.available,false);

  assert.equal(eva.commercial.renewal.status,'insufficient');
  assert.equal(eva.commercial.renewal.label,'Renovación sin evidencia');
  assert.equal(eva.commercial.renewal.requiresHumanDecision,false);
  assert.equal(eva.commercial.payment.available,false);
});

test('La proyección comercial conserva aislamiento por clientId',()=>{
  const projected=applyCommercialPortfolio(
    {kind:'clientes',role:'coach',clients:[{id:'c1',name:'Ana'}]},
    stateWithCommercialEvidence(),
    NOW,
  );
  assert.equal(projected.commercialPortfolio.total,1);
  assert.equal(projected.clients.length,1);
  assert.equal(projected.clients[0].commercial.plan,'Híbrido 2x/sem');
  assert.equal(projected.clients[0].commercial.renewal.status,'overdue');
  assert.equal(projected.commercialPortfolio.counts.upcoming,0);
});

test('La vista cliente no recibe metadatos CRM de cartera Coach/Admin',()=>{
  const vm=portfolioVm('client');
  const state=stateWithCommercialEvidence();
  state.identity.role='client';
  const projected=applyCommercialPortfolio(vm,state,NOW);
  assert.equal(projected,vm);
  assert.equal('commercialPortfolio' in projected,false);
  assert.equal('commercial' in projected.clients[0],false);
});

test('Etiquetas de renovación fallan cerrado ante estados desconocidos',()=>{
  assert.equal(commercialRenewalLabel('overdue'),'Renovación por revisar');
  assert.equal(commercialRenewalLabel('upcoming'),'Renovación próxima');
  assert.equal(commercialRenewalLabel('unexpected'),'Renovación sin evidencia');
  assert.equal(commercialRenewalLabel(null),'Renovación sin evidencia');
});

test('Filtro comercial sólo acepta estados canónicos y no convierte valores desconocidos en una categoría',()=>{
  assert.equal(normalizeCommercialRenewalFilter(' overdue '),'overdue');
  assert.equal(normalizeCommercialRenewalFilter('UPCOMING'),'upcoming');
  assert.equal(normalizeCommercialRenewalFilter('unexpected'),'');
  assert.equal(normalizeCommercialRenewalFilter(null),'');
});

test('Filtro de renovación combina de forma determinista con el estado comercial sin inventar evidencia',()=>{
  assert.equal(commercialRenewalFilterMatches('overdue','overdue'),true);
  assert.equal(commercialRenewalFilterMatches('upcoming','overdue'),false);
  assert.equal(commercialRenewalFilterMatches('unknown','insufficient'),true);
  assert.equal(commercialRenewalFilterMatches('overdue',''),true);
  assert.equal(commercialRenewalFilterMatches('overdue','unexpected'),true);
});
