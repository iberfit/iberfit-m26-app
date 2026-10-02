import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeFirstSessionDraft,validateFirstSessionStep,coreDomainCoverage} from '../src/m26/workflows/iri-first-session.js';
import {scoreIriPerformance} from '../src/m26/norms/iri-scoring.js';
import {buildIriReportHtml} from '../src/m26/workflows/iri-report-document.js';

function fieldCase(){
  return normalizeFirstSessionDraft({
    assessmentDate:'2026-10-02',
    birthDate:'1990-05-20',
    sexForNorms:'female',
    email:'field@example.test',
    phone:'+56911111111',
    modality:'online',
    primaryObjective:'Conocer su punto de partida y recibir informe IRI.',
    screeningAccepted:'on',
    trainingExperience:'Corredora recreativa',
    availability:'Evaluación puntual',
    bodyCompositionMethod:'Bioimpedancia',
    bodyCompositionDevice:'Equipo de bioimpedancia',
    weightKg:'62.5',
    bodyFatPercent:'28',
    assessmentLocation:'Gimnasio / terreno real',
    assessmentSurface:'Suelo y colchoneta',
    assessmentEquipmentAvailable:'pared, cinta métrica, colchoneta, TRX, cinta de correr',
    assessmentEquipmentMissing:'banco, cajón',
    assessmentSubstitutions:'No había banco; se utilizó colchoneta cuando la prueba lo permitía y se omitieron protocolos que exigían banco.',
    mobilityBenchAvailability:'not_available',
    mobilitySurface:'Suelo firme y colchoneta',
    mobilitySupportUsed:'Pared y colchoneta',
    mobilitySubstitutionNotes:'Sin banco compatible; no se fuerza Thomas/back-saver estándar.',
    ankleLeft1:'8.0',ankleLeft2:'8.5',ankleLeft3:'8.4',
    ankleRight1:'9.0',ankleRight2:'9.2',ankleRight3:'9.1',
    ankleValid:'on',
    squatDepth:'profundidad controlada',
    squatHeels:'apoyados',
    squatKnees:'controladas',
    squatTrunk:'estable',
    squatAssistanceResponse:'sin asistencia necesaria',
    squatValid:'on',

    squat60sRepetitions:'34',
    squat60sDurationSeconds:'60',
    squat60sDepthCriterion:'Profundidad visual reproducible',
    squat60sValid:'on',
    pushVariant:'knees',
    pushUps:'16',
    pushTestMode:'technical-failure-max-reps',
    pushStopCriterion:'Fallo técnico',
    pushValid:'on',
    trxRowRepetitions:'18',
    trxHandleHeightCm:'100',
    trxPosition:'de pie · geometría documentada',
    trxTestMode:'technical-failure-max-reps',
    trxStopCriterion:'Fallo técnico',
    trxValid:'on',
    coreProtocolVariant:'front-standard',
    frontPlankSeconds:'55',
    coreQuality:'técnica válida',

    cardioProtocol:'treadmill-3min-field',
    cardioDurationSeconds:'180',
    treadmillMode:'self-selected-easy',
    treadmillSpeedKmh:'7.2',
    treadmillInclinePercent:'0',
    treadmillEffortDescription:'Ritmo cómodo habitual; conversación posible.',
    stepFinalHr:'148',
    stepOneMinuteHr:'120',
    twoMinuteHr:'105',
    cardioRpe:'4',
    cardioValid:'on',

    diagnosisStrengths:'Buena tolerancia general',
    diagnosisPriorities:'Mantener comparabilidad de las pruebas',
    coachInterpretation:'Evaluación de terreno válida, reproducible y sin incidencias relevantes registradas.',
    initialPlan:'Entregar informe del punto de partida y conservar los datos para una eventual reevaluación futura.',
    reviewAccepted:'on',
  },{},'client-field');
}

test('real field IRI validates without inventing unavailable bench protocols',()=>{
  const draft=fieldCase();
  assert.equal(validateFirstSessionStep(draft,'movilidad').ok,true);
  assert.equal(validateFirstSessionStep(draft,'fuerza').ok,true);
  assert.equal(validateFirstSessionStep(draft,'cardio').ok,true);
  assert.equal(draft.fieldContext.equipmentMissing.includes('banco'),true);
  assert.equal(draft.mobility.setup.benchAvailability,'not_available');
  assert.equal(draft.strength.chairStand.repetitions,null);
  assert.equal(draft.strength.squat60s.repetitions,34);
  assert.equal(draft.strength.push.variant,'knees');
  assert.equal(draft.strength.trxRow.handleHeightCm,100);
  assert.equal(draft.cardio.protocol,'treadmill-3min-field');
  assert.equal(draft.cardio.deltaOneMinute,28);
  assert.equal(draft.cardio.deltaTwoMinute,43);
  assert.equal(coreDomainCoverage(draft).complete,true);
});

test('field treadmill and squat remain individual baselines, never false norms',()=>{
  const draft=fieldCase();
  const scoring=scoreIriPerformance(draft);
  assert.equal(scoring.domainScores.cardio.scored,false);
  assert.match(scoring.domainScores.cardio.note,/baseline individual/i);
  assert.equal(scoring.domainScores.strength.scored,false);
  assert.match(scoring.domainScores.strength.note,/sentadilla libre de 1 minuto/i);
  assert.equal(scoring.global.coverage.scoredDomains,1);
});

test('protocol trace preserves exact field configuration',()=>{
  const draft=fieldCase();
  const treadmill=draft.protocolRecords.find((row)=>row.testId==='treadmill-three-minute-field');
  const squat=draft.protocolRecords.find((row)=>row.testId==='bodyweight-squat-60s-field');
  const trx=draft.protocolRecords.find((row)=>row.testId==='trx-row');
  assert.equal(treadmill.valid,true);
  assert.match(treadmill.configuration,/7.2 km\/h/);
  assert.match(treadmill.configuration,/180 s/);
  assert.equal(squat.valid,true);
  assert.match(squat.configuration,/60 s/);
  assert.match(trx.configuration,/asas 100 cm/);
});

test('client report explains field reality and two-minute HR recovery',()=>{
  const draft=fieldCase();
  const html=buildIriReportHtml({draft,variant:'client',clientName:'Persona IRI',coachName:'Coach'});
  assert.match(html,/Condiciones reales de evaluación/);
  assert.match(html,/colchoneta/i);
  assert.match(html,/Sentadilla libre 1 min/);
  assert.match(html,/Cinta · 3 minutos/);
  assert.match(html,/ΔFC 2 min/);
  assert.match(html,/no utiliza baremo automático/i);
  assert.equal((html.match(/class="pdf-page(?:\s|")/gu)||[]).length,7);
});

test('route exposes field controls without pretending treadmill is YMCA',()=>{
  const route=fs.readFileSync('src/m26/modules/route-render.js','utf8');
  assert.match(route,/Realidad de terreno/);
  assert.match(route,/treadmill-3min-field/);
  assert.match(route,/baseline individual/);
  assert.match(route,/squat60sRepetitions/);
  assert.match(route,/mobilityBenchAvailability/);
});
