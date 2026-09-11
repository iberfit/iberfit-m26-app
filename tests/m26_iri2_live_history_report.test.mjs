import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildIriCommandDraftFromFirstSession,
  normalizeFirstSessionDraft,
} from '../src/m26/workflows/iri-first-session.js';
import {confirmedIriHistoryForReport} from '../src/m26/app/workflow-controller.js';

function draft({id,date,clientId='CLIENT-IRI2-LIVE',chair=14}={}){
  return normalizeFirstSessionDraft({
    assessmentDate:date,
    birthDate:'1988-04-16',
    sexForNorms:'female',
    email:'live-history@example.com',
    phone:'+56 9 1111 2222',
    modality:'hibrido',
    trainingAddress:'Dirección IRI2',
    primaryObjective:'Mejorar fuerza, salud y capacidad física general',
    trainingExperience:'Intermedia',
    availability:'Dos tardes',
    screeningAccepted:'on',
    weightKg:'66',
    heightCm:'165',
    waistCm:'76',
    ankleLeft1:'8',
    ankleRight1:'8',
    posteriorLeft1:'24',
    posteriorRight1:'24',
    hipRotationResult:'Simétrica',
    squatDepth:'Paralela',
    chairStand30s:String(chair),
    chairStandValid:'on',
    pushVariant:'standard',
    pushUps:'8',
    pushValid:'on',
    trxRowRepetitions:'12',
    trxValid:'on',
    frontPlankSeconds:'40',
    cardioSkipped:'on',
    cardioSkipReason:'No se realizó en esta sesión.',
    diagnosisStrengths:'Buena adherencia y control técnico',
    diagnosisPriorities:'Aumentar fuerza funcional',
    coachInterpretation:'Perfil apto para iniciar una progresión individualizada.',
    trainingImplications:'Progresar fuerza manteniendo protocolos comparables.',
    initialPlan:'Plan inicial de ocho semanas con seguimiento estructurado.',
    recommendedFrequency:'2 sesiones por semana',
    reviewAccepted:'on',
  },{id},clientId);
}

function confirmedRecord({id,date,clientId='CLIENT-IRI2-LIVE',chair=14}={}){
  const normalized=draft({id,date,clientId,chair});
  return buildIriCommandDraftFromFirstSession(normalized,{id});
}

test('live IRI report history is client-scoped, confirmed, valid, deduplicated and never includes a future assessment',()=>{
  const previous=confirmedRecord({id:'11111111-1111-4111-8111-111111111111',date:'2026-06-11',chair:14});
  const current=confirmedRecord({id:'22222222-2222-4222-8222-222222222222',date:'2026-09-11',chair:18});
  const future=confirmedRecord({id:'33333333-3333-4333-8333-333333333333',date:'2026-12-11',chair:20});
  const otherClient=confirmedRecord({id:'44444444-4444-4444-8444-444444444444',date:'2026-05-11',clientId:'OTHER-CLIENT'});
  const incomplete={...confirmedRecord({id:'55555555-5555-4555-8555-555555555555',date:'2026-07-11'}),firstSessionCompletedAt:null};
  const invalid={...confirmedRecord({id:'66666666-6666-4666-8666-666666666666',date:'2026-08-11'})};
  invalid.diagnosis={...invalid.diagnosis,reviewAccepted:false};

  const state={collections:{iriAssessments:[future,current,invalid,previous,otherClient,incomplete,previous]}};
  const history=confirmedIriHistoryForReport(state,'CLIENT-IRI2-LIVE',current.id,current.assessmentDate);

  assert.equal(history.length,1);
  assert.equal(history[0].assessmentId,previous.id);
  assert.equal(history[0].assessmentDate,'2026-06-11');
});

test('live IRI report history is chronological and contains only validated historical drafts',()=>{
  const first=confirmedRecord({id:'11111111-1111-4111-8111-111111111111',date:'2026-03-11',chair:12});
  const second=confirmedRecord({id:'22222222-2222-4222-8222-222222222222',date:'2026-06-11',chair:14});
  const current=confirmedRecord({id:'33333333-3333-4333-8333-333333333333',date:'2026-09-11',chair:18});
  const state={collections:{iriAssessments:[second,current,first]}};

  const history=confirmedIriHistoryForReport(state,'CLIENT-IRI2-LIVE',current.id,current.assessmentDate);
  assert.deepEqual(history.map((item)=>item.assessmentId),[first.id,second.id]);
  assert.ok(history.every((item)=>item.diagnosis.reviewAccepted===true));
});

test('workflow report generation injects validated longitudinal history into both premium report variants',()=>{
  const source=fs.readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  assert.match(source,/confirmedIriHistoryForReport\(state,clientId,draft\.assessmentId,draft\.assessmentDate\)/u);
  assert.match(source,/openIriReportPrint\(\{\.\.\.reportContext\(draft\),variant,externalReport,longitudinalHistory,printTarget\}\)/u);
});
