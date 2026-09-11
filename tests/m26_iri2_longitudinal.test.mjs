import test from 'node:test';
import assert from 'node:assert/strict';

import {normalizeFirstSessionDraft} from '../src/m26/workflows/iri-first-session.js';
import {
  IRI2_SNAPSHOT_SCHEMA,
  buildIri2LongitudinalProfile,
  iri2ComparisonSummary,
  iri2SnapshotFromDraft,
} from '../src/m26/workflows/iri-2-longitudinal.js';
import {buildIriReportHtml} from '../src/m26/workflows/iri-report-document.js';

function makeDraft({id,date,chair=14,push=8,weight=66}={}){
  return normalizeFirstSessionDraft({
    assessmentDate:date,
    birthDate:'1988-04-16',
    sexForNorms:'female',
    email:'iri2@example.com',
    phone:'+56 9 1111 2222',
    modality:'hibrido',
    trainingAddress:'Dirección IRI2',
    primaryObjective:'Mejorar fuerza, salud y capacidad física general',
    trainingExperience:'Intermedia',
    availability:'Dos tardes',
    screeningAccepted:'on',
    weightKg:String(weight),
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
    pushUps:String(push),
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
  },{id},'CLIENT-IRI2');
}

test('IRI 2.0 snapshots preserve decisions and objective metrics without inventing a global score',()=>{
  const current=makeDraft({id:'22222222-2222-4222-8222-222222222222',date:'2026-09-11',chair:18,push:10,weight:65});
  const snapshot=iri2SnapshotFromDraft(current);
  assert.equal(snapshot.schema,IRI2_SNAPSHOT_SCHEMA);
  assert.equal(snapshot.metrics.chairStandReps.value,18);
  assert.equal(snapshot.metrics.weightKg.value,65);
  assert.match(snapshot.decision.initialPlan,/ocho semanas/u);
  assert.equal('compositeScore' in snapshot,false);
});

test('IRI 2.0 compares only compatible protocol measurements and keeps descriptive change separate from judgement',()=>{
  const previous=makeDraft({id:'11111111-1111-4111-8111-111111111111',date:'2026-06-11',chair:14,push:8,weight:67});
  const current=makeDraft({id:'22222222-2222-4222-8222-222222222222',date:'2026-09-11',chair:18,push:10,weight:65});
  const profile=buildIri2LongitudinalProfile({current,history:[previous]});
  assert.equal(profile.comparison.available,true);
  const chair=profile.comparison.metrics.find((item)=>item.id==='chairStandReps');
  assert.equal(chair.comparable,true);
  assert.equal(chair.delta,4);
  const weight=profile.comparison.metrics.find((item)=>item.id==='weightKg');
  assert.equal(weight.comparable,true);
  assert.equal(weight.delta,-2);
  assert.ok(profile.comparison.comparableCount>=2);
});

test('IRI 2.0 refuses direct strength comparison when the exercise protocol changes',()=>{
  const previous=makeDraft({id:'11111111-1111-4111-8111-111111111111',date:'2026-06-11',push:8});
  const current=makeDraft({id:'22222222-2222-4222-8222-222222222222',date:'2026-09-11',push:12});
  current.strength.push.variant='incline';
  current.strength.push.supportHeightCm=80;
  const profile=buildIri2LongitudinalProfile({current,history:[previous]});
  const push=profile.comparison.metrics.find((item)=>item.id==='pushReps');
  assert.equal(push.comparable,false);
});

test('premium client report remains exactly 7 pages and becomes longitudinal when history exists',()=>{
  const previous=makeDraft({id:'11111111-1111-4111-8111-111111111111',date:'2026-06-11',chair:14,push:8,weight:67});
  const current=makeDraft({id:'22222222-2222-4222-8222-222222222222',date:'2026-09-11',chair:18,push:10,weight:65});
  const html=buildIriReportHtml({
    draft:current,
    variant:'client',
    clientName:'Cliente IRI2',
    coachName:'Coach IBERFIT',
    longitudinalHistory:[previous],
  });
  assert.equal((html.match(/class="pdf-page/g)||[]).length,7);
  assert.match(html,/Evolución IRI 2\.0/u);
  assert.match(html,/indicadores comparables/u);
  assert.match(html,/Cambios comparables desde la evaluación anterior/u);
  assert.match(html,/Silla 30 s \+4 rep/u);
});

test('first IRI 2.0 assessment establishes a baseline instead of fabricating progression',()=>{
  const current=makeDraft({id:'22222222-2222-4222-8222-222222222222',date:'2026-09-11'});
  const profile=buildIri2LongitudinalProfile({current,history:[]});
  const summary=iri2ComparisonSummary(profile);
  assert.equal(summary.available,false);
  assert.equal(summary.label,'Primera evaluación');
  assert.match(summary.detail,/línea de base/u);
});
