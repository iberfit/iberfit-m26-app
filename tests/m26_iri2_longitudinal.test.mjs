import test from 'node:test';
import assert from 'node:assert/strict';

import {normalizeFirstSessionDraft} from '../src/m26/workflows/iri-first-session.js';
import {
  IRI2_SNAPSHOT_SCHEMA,
  buildIri2DecisionLog,
  buildIri2LongitudinalProfile,
  iri2ComparisonSummary,
  iri2SnapshotFromDraft,
} from '../src/m26/workflows/iri-2-longitudinal.js';
import {buildIriReportHtml} from '../src/m26/workflows/iri-report-document.js';

function makeDraft({
  id,
  date,
  chair=14,
  push=8,
  weight=66,
  clientId='CLIENT-IRI2',
  priorities='Aumentar fuerza funcional',
  plan='Plan inicial de ocho semanas con seguimiento estructurado.',
  implications='Progresar fuerza manteniendo protocolos comparables.',
  frequency='2 sesiones por semana',
  reevaluationDate='',
  accepted=true,
}={}){
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
    diagnosisPriorities:priorities,
    coachInterpretation:'Perfil apto para iniciar una progresión individualizada.',
    trainingImplications:implications,
    initialPlan:plan,
    recommendedFrequency:frequency,
    reevaluationDate,
    reviewAccepted:accepted?'on':'',
  },{id},clientId);
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
  assert.match(html,/Sin puntuación global/u);
});

test('first IRI 2.0 assessment establishes a baseline instead of fabricating progression',()=>{
  const current=makeDraft({id:'22222222-2222-4222-8222-222222222222',date:'2026-09-11'});
  const profile=buildIri2LongitudinalProfile({current,history:[]});
  const summary=iri2ComparisonSummary(profile);
  assert.equal(summary.available,false);
  assert.equal(summary.label,'Primera evaluación');
  assert.match(summary.detail,/línea de base/u);
});


test('IRI 2.0 decision log includes only confirmed reviewed decisions and records factual strategy changes',()=>{
  const first=makeDraft({
    id:'33333333-3333-4333-8333-333333333333',
    date:'2026-01-11',
    priorities:'Fuerza tren inferior, Movilidad tobillo',
    plan:'Bloque inicial de ocho semanas centrado en técnica y fuerza.',
    frequency:'2 sesiones por semana',
    reevaluationDate:'2026-03-11',
  });
  const second=makeDraft({
    id:'44444444-4444-4444-8444-444444444444',
    date:'2026-03-11',
    priorities:'Fuerza tren inferior, Capacidad cardiorrespiratoria',
    plan:'Segundo bloque con fuerza mantenida y progresión cardiorrespiratoria.',
    implications:'Mantener fuerza y añadir trabajo cardiorrespiratorio progresivo.',
    frequency:'3 sesiones por semana',
    reevaluationDate:'2026-05-11',
  });
  const unreviewed=makeDraft({
    id:'55555555-5555-4555-8555-555555555555',
    date:'2026-05-11',
    priorities:'No debe aparecer',
    accepted:false,
  });

  const log=buildIri2DecisionLog({assessments:[second,unreviewed,first]});
  assert.equal(log.count,2);
  assert.equal(log.entries[0].label,'Decisión inicial');
  assert.equal(log.entries[1].label,'Prioridades actualizadas');
  assert.deepEqual(log.entries[1].changes.prioritiesAdded,['Capacidad cardiorrespiratoria']);
  assert.deepEqual(log.entries[1].changes.prioritiesRemoved,['Movilidad tobillo']);
  assert.equal(log.entries[1].changes.planChanged,true);
  assert.equal(log.entries[1].changes.implicationsChanged,true);
  assert.equal(log.entries[1].changes.frequencyChanged,true);
  assert.equal(log.entries[1].changes.reevaluationChanged,true);
  assert.equal(log.latest.initialPlan,'Segundo bloque con fuerza mantenida y progresión cardiorrespiratoria.');
  assert.equal('compositeScore' in log,false);
});

test('IRI 2.0 decision log never mixes decisions from a different client',()=>{
  const first=makeDraft({
    id:'66666666-6666-4666-8666-666666666666',
    date:'2026-02-01',
    clientId:'CLIENT-A',
    priorities:'Fuerza',
  });
  const otherClient=makeDraft({
    id:'77777777-7777-4777-8777-777777777777',
    date:'2026-03-01',
    clientId:'CLIENT-B',
    priorities:'Cardio',
  });

  const log=buildIri2DecisionLog({assessments:[first,otherClient]});
  assert.equal(log.clientId,'CLIENT-A');
  assert.equal(log.count,1);
  assert.equal(log.entries[0].assessmentId,'66666666-6666-4666-8666-666666666666');
  assert.deepEqual(log.entries[0].priorities,['Fuerza']);
});


test('IRI 2.0 structured priorities remain backward compatible and detect factual detail changes',()=>{
  const raw={
    assessmentDate:'2026-09-11',
    diagnosisStrengths:'Buena adherencia',
    diagnosisPriorities:'Fuerza tren inferior\nMovilidad tobillo',
    priority1Domain:'strength',
    priority1Rationale:'Mejorar la capacidad funcional observada.',
    priority1Target:'20 repeticiones comparables.',
    priority1Strategy:'Dos sesiones semanales de fuerza.',
    priority1ReviewDate:'2026-10-15',
    priority1Status:'active',
    priority2Domain:'mobility',
    coachInterpretation:'Interpretación profesional suficiente para una planificación prudente.',
    trainingImplications:'Mantener técnica y progresar únicamente con respuesta favorable.',
    initialPlan:'Plan inicial de ocho semanas con seguimiento estructurado.',
    recommendedFrequency:'2 sesiones por semana',
    reevaluationDate:'2026-10-15',
    reviewAccepted:'on',
  };
  const first=normalizeFirstSessionDraft(raw,{id:'88888888-8888-4888-8888-888888888888'},'CLIENT-STRUCTURED');
  const second=normalizeFirstSessionDraft({...raw,assessmentDate:'2026-10-15',priority1Target:'22 repeticiones comparables.'},{id:'99999999-9999-4999-8999-999999999999'},'CLIENT-STRUCTURED');

  assert.deepEqual(first.diagnosis.priorities,['Fuerza tren inferior','Movilidad tobillo']);
  assert.equal(first.diagnosis.priorityRecords[0].domain,'strength');
  assert.equal(first.diagnosis.priorityRecords[0].status,'active');
  assert.equal(first.diagnosis.priorityRecords[1].domain,'mobility');
  assert.equal(first.diagnosis.priorityRecords[1].reviewDate,'2026-10-15');

  const snapshot=iri2SnapshotFromDraft(second);
  assert.equal(snapshot.decision.priorityRecords[0].target,'22 repeticiones comparables.');
  assert.equal('compositeScore' in snapshot,false);

  const log=buildIri2DecisionLog({assessments:[first,second]});
  assert.equal(log.entries[1].changes.prioritiesChanged,false);
  assert.equal(log.entries[1].changes.priorityDetailsChanged,true);
  assert.equal(log.entries[1].label,'Plan revisado');
  assert.equal(log.entries[1].priorityRecords[0].target,'22 repeticiones comparables.');
});
