import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeFirstSessionDraft,validateFirstSessionStep,coreDomainCoverage} from '../src/m26/workflows/iri-first-session.js';
import {buildIriProtocolRecords,iriProtocolById} from '../src/m26/workflows/iri-protocol-catalog.js';

function baseRaw(){
  return {
    assessmentDate:'2026-10-02',birthDate:'1992-04-01',sexForNorms:'female',email:'x@example.com',phone:'+56911111111',modality:'presencial',trainingAddress:'Casa',primaryObjective:'Conocer estado inicial',
    trainingExperience:'Intermedia',availability:'Flexible',screeningAccepted:'on',
    weightKg:'60',
    ankleLeft1:'9',ankleRight1:'10',ankleValid:'on',squatDepth:'Paralela',squatValid:'on',
    pushVariant:'knees',pushUps:'20',pushValid:'on',
    trxRowRepetitions:'18',trxHandleHeightCm:'100',trxHeelDistanceCm:'120',trxValid:'on',
    frontPlankSeconds:'75',coreProtocolVariant:'front-only',coreValid:'on',
    cardioProtocol:'treadmill-3min-field',treadmillMode:'jog',treadmillSpeedKmh:'7.5',treadmillInclinePercent:'0',cardioDurationSeconds:'180',stepFinalHr:'145',stepOneMinuteHr:'110',twoMinuteHr:'95',cardioRpe:'4',cardioValid:'on',
    diagnosisStrengths:'Buena tolerancia',diagnosisPriorities:'Movilidad',coachInterpretation:'Interpretación profesional suficientemente extensa.',initialPlan:'Punto de partida y recomendaciones suficientemente detalladas.',reviewAccepted:'on',
  };
}

test('field mode persists real-world equipment and treadmill load',()=>{
  const raw={...baseRaw(),fieldMode:'field',fieldEquipmentWall:'on',fieldEquipmentMat:'on',fieldEquipmentTrx:'on',fieldEquipmentTreadmill:'on',fieldContextNotes:'Sin banco; trabajo adaptado sobre colchoneta.'};
  const draft=normalizeFirstSessionDraft(raw,{},'client-1');
  assert.equal(draft.fieldContext.mode,'field');
  assert.equal(draft.fieldContext.equipment.mat,true);
  assert.equal(draft.cardio.protocol,'treadmill-3min-field');
  assert.equal(draft.cardio.treadmillSpeedKmh,7.5);
  assert.equal(draft.cardio.deltaOneMinute,35);
});

test('strength is valid with at least two real field tests and does not require chair stand',()=>{
  const draft=normalizeFirstSessionDraft(baseRaw(),{},'client-1');
  const result=validateFirstSessionStep(draft,'fuerza');
  assert.equal(result.ok,true);
  assert.equal(coreDomainCoverage(draft).states.strength,true);
});

test('mobility requires WBLT plus one valid functional observation rather than every legacy test',()=>{
  const draft=normalizeFirstSessionDraft(baseRaw(),{},'client-1');
  const result=validateFirstSessionStep(draft,'movilidad');
  assert.equal(result.ok,true);
  assert.equal(draft.mobility.posteriorChain.leftBest,null);
});

test('treadmill 3 min is a valid field protocol and remains baseline-only',()=>{
  const raw=baseRaw();
  const draft=normalizeFirstSessionDraft(raw,{},'client-1');
  assert.equal(validateFirstSessionStep(draft,'cardio').ok,true);
  const records=buildIriProtocolRecords({raw,assessmentDate:draft.assessmentDate,bodyComposition:draft.bodyComposition,mobility:draft.mobility,strength:draft.strength,cardio:draft.cardio});
  const record=records.find((item)=>item.testId==='treadmill-three-minute-field');
  assert.equal(record.valid,true);
  assert.match(record.configuration,/7.5 km\/h/);
  assert.equal(iriProtocolById('treadmill-three-minute-field').doesNotDiagnose.includes('ergometría'),true);
});

test('catalog exposes mat adaptations and one-minute squat as baseline',()=>{
  assert.ok(iriProtocolById('back-saver').variants.some((x)=>x.id==='floor-mat-observation'));
  assert.ok(iriProtocolById('modified-thomas').variants.some((x)=>x.id==='floor-mat-observation'));
  assert.equal(iriProtocolById('one-minute-bodyweight-squat').interpretation.some((x)=>/Baseline individual/.test(x)),true);
});

test('route and controller expose field equipment and treadmill controls',()=>{
  const route=fs.readFileSync('src/m26/modules/route-render.js','utf8');
  const controller=fs.readFileSync('src/m26/app/workflow-controller.js','utf8');
  assert.match(route,/Modo terreno/);
  assert.match(route,/treadmill-3min-field/);
  assert.match(route,/oneMinuteSquatRepetitions/);
  assert.match(controller,/isTreadmill/);
  assert.match(controller,/treadmillSpeedKmh/);
});
