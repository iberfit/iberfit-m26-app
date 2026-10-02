import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {normalizeFirstSessionDraft,validateFirstSessionStep} from '../src/m26/workflows/iri-first-session.js';
import {scoreIriPerformance} from '../src/m26/norms/iri-scoring.js';
import {renderIriRoute} from '../src/m26/modules/route-render.js';
import {buildIriReportHtml} from '../src/m26/workflows/iri-report-document.js';
import {buildCoach360Rows} from '../src/m26/admin/view-model.js';
import {deriveAdminCommandCenter} from '../src/m26/admin/command-center.js';

function realWorldDraft(){
  return normalizeFirstSessionDraft({
    assessmentDate:'2026-10-02',
    birthDate:'1992-04-12',
    sexForNorms:'female',
    email:'iri@example.com',
    phone:'+56911111111',
    modality:'presencial',
    trainingAddress:'Santiago',
    primaryObjective:'Conocer su estado actual',
    screeningAccepted:true,
    trainingExperience:'Intermedia',
    availability:'Flexible',
    bodyCompositionSkipped:true,
    bodyCompositionSkipReason:'fixture',
    ankleLeft1:7,
    ankleRight1:9,
    posteriorLeft1:10,
    posteriorRight1:10,
    hipRotationResult:'sin limitación relevante',
    squatDepth:'paralelo',
    airSquat60sRepetitions:31,
    airSquatDurationSeconds:60,
    airSquatDepthCriterion:'muslo paralelo',
    airSquatRpe:7,
    airSquatValid:true,
    airSquatTechniqueQuality:4,
    pushVariant:'knees',
    pushUps:18,
    pushValid:true,
    pushTechniqueQuality:4,
    trxRowRepetitions:14,
    trxHandleHeightCm:100,
    trxHeelDistanceCm:90,
    trxPosition:'talones a 90 cm',
    trxValid:true,
    trxTechniqueQuality:3,
    frontPlankSeconds:62,
    coreValid:true,
    coreTechniqueQuality:4,
    cardioProtocol:'treadmill-3min-submax',
    cardioDurationSeconds:180,
    treadmillSpeedKph:8,
    treadmillInclinePercent:0,
    cardioRecoveryMode:'standing',
    stepFinalHr:160,
    stepOneMinuteHr:125,
    twoMinuteHr:105,
    cardioRpe:5,
    cardioValid:true,
    diagnosisStrengths:'Buena disposición',
    diagnosisPriorities:'Movilidad de tobillo',
    coachInterpretation:'Interpretación profesional de fixture suficientemente extensa.',
    initialPlan:'Informe de diagnóstico inicial sin contratación de entrenamiento.',
    reviewAccepted:true,
  });
}

test('real field strength accepts air squat 60 s instead of forcing Chair Stand',()=>{
  const draft=realWorldDraft();
  const result=validateFirstSessionStep(draft,'fuerza');
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(draft.strength.chairStand.repetitions,null);
  assert.equal(draft.strength.airSquat60s.repetitions,31);
});

test('treadmill 3 min baseline requires reproducible external load and HR +60/+120',()=>{
  const draft=realWorldDraft();
  const result=validateFirstSessionStep(draft,'cardio');
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(draft.cardio.deltaOneMinute,35);
  assert.equal(draft.cardio.deltaTwoMinute,55);
  assert.equal(draft.cardio.treadmillSpeedKph,8);
  assert.equal(draft.cardio.recoveryMode,'standing');
});

test('mixed IRI note is transparent: normative mobility + criterial strength + treadmill baseline',()=>{
  const draft=realWorldDraft();
  const scoring=scoreIriPerformance(draft);
  assert.equal(scoring.domainScores.mobility.scoreType,'normative');
  assert.equal(scoring.domainScores.mobility.scored,true);
  assert.equal(scoring.domainScores.strength.scoreType,'criterial');
  assert.equal(scoring.domainScores.strength.score10,7.5);
  assert.equal(scoring.domainScores.cardio.scored,false);
  assert.match(scoring.domainScores.cardio.note,/baseline individual/i);
  assert.equal(scoring.global.available,true);
  assert.equal(scoring.global.coverage.scoredDomains,2);
  assert.equal(scoring.global.coverage.criterialDomains,1);
  assert.equal(scoring.global.confidence,'contextual');
  assert.equal(scoring.global.basis,'mixed_normative_criterial');
});

test('knee push-ups never inherit standard push-up population norms',()=>{
  const scoring=scoreIriPerformance(realWorldDraft());
  assert.equal(scoring.results.some((row)=>row.testId==='push_up_standard'),false);
});

test('IRI UI exposes fast real-world fields and explains score provenance',()=>{
  const html=renderIriRoute({current:{id:'iri-1'},currentSummary:null,profile:{},sourceProfile:{},canEdit:true});
  assert.match(html,/Sentadilla libre · repeticiones en 60 s/);
  assert.match(html,/Calidad técnica IBERFIT/);
  assert.match(html,/Cinta · carrera suave 3 min/);
  assert.match(html,/Velocidad \(km\/h\)/);
  assert.match(html,/FC a los 2 minutos/);
  assert.match(html,/normativa.*técnica IBERFIT.*baseline/is);
});

test('client PDF labels technical score and treadmill result without fake clinical norms',()=>{
  const draft=realWorldDraft();
  const html=buildIriReportHtml({draft,variant:'client',clientName:'Persona IRI',coachName:'Coach'});
  assert.match(html,/Nota IRI/);
  assert.match(html,/Nota técnica IBERFIT/i);
  assert.match(html,/Cinta · recuperación individual/i);
  assert.match(html,/ΔFC60/);
  assert.match(html,/ΔFC120/);
  assert.match(html,/no se etiqueta como normal o anormal/i);
});

test('Coach 360 preserves IRI authorization assignment but excludes IRI-only from active training load',()=>{
  const rows=buildCoach360Rows({
    coaches:[{userId:'coach-1',name:'Coach'}],
    clients:[
      {id:'active-1',name:'Activa',lifecycle:{status:'active'}},
      {id:'iri-1',name:'Solo IRI',lifecycle:{status:'inactive',serviceKind:'iri_only'}},
    ],
    assignments:[
      {coachUserId:'coach-1',clientId:'active-1',status:'active'},
      {coachUserId:'coach-1',clientId:'iri-1',status:'active'},
    ],
  });
  assert.equal(rows[0].assignmentCount,2);
  assert.equal(rows[0].clientCount,1);
  assert.deepEqual(rows[0].clients.map((x)=>x.id),['active-1']);
});

test('Admin Command Center separates people, active clients and IRI-only',()=>{
  const cc=deriveAdminCommandCenter({clients:[
    {id:'active-1',name:'Activa',lifecycle:{status:'active'},experience:{stage:'active'},assignments:[{id:'a'}]},
    {id:'iri-1',name:'Solo IRI',lifecycle:{status:'inactive',serviceKind:'iri_only'},experience:{stage:'evaluation'},assignments:[{id:'b'}]},
  ]});
  assert.equal(cc.summary.totalPeople,2);
  assert.equal(cc.summary.activeClients,1);
  assert.equal(cc.summary.iriOnlyPeople,1);
  assert.equal(cc.priorities.some((x)=>x.clientId==='iri-1'),false);
});

test('lifecycle migration explicitly supports iri_only without removing assignment semantics',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261002164000_client_lifecycle_iri_only_v1.sql','utf8');
  assert.match(sql,/iri_only/);
  assert.match(sql,/service_kind/);
  assert.match(sql,/generated always/);
  assert.doesNotMatch(sql,/drop constraint|drop column|delete from/is);
});
