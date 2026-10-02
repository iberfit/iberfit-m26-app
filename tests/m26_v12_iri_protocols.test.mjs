import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  IRI_PROTOCOL_CATALOG,
  IRI_PROTOCOL_CATALOG_VERSION,
  iriProtocolsForStep,
  protocolComparabilityWarnings,
} from '../src/m26/workflows/iri-protocol-catalog.js';
import {
  normalizeFirstSessionDraft,
  validateFirstSessionDraft,
  buildIriCommandDraftFromFirstSession,
  flattenFirstSessionDraft,
} from '../src/m26/workflows/iri-first-session.js';
import {renderIriRoute} from '../src/m26/modules/route-render.js';
import {buildIriReportHtml} from '../src/m26/workflows/iri-report-document.js';

const reportCss=fs.readFileSync(new URL('../public/m26/iri-report.css',import.meta.url),'utf8');

function validRaw(overrides={}){
  return {
    assessmentDate:'2026-07-30',birthDate:'1992-04-11',sexForNorms:'female',email:'qa@example.com',phone:'+56 9 1111 2222',modality:'hibrido',trainingAddress:'Dirección QA',primaryObjective:'Mejorar fuerza general',trainingExperience:'Intermedia',availability:'Dos tardes',screeningAccepted:'on',
    weightKg:'64.2',heightCm:'166',bodyFatPercent:'27.4',leanMassKg:'46.6',muscleMassKg:'43.9',bodyWaterPercent:'51.8',waistCm:'74',visceralFatLevel:'6',bodyCompositionMethod:'bioimpedancia-segmental',bodyCompositionDevice:'Equipo QA',measurementConditions:'Mañana, antes de entrenar e hidratación habitual.',bodyCompositionValid:'on',bodyCompositionProtocolConfiguration:'Equipo QA · descalza · 08:00',
    ankleLeft1:'8',ankleLeft2:'8.2',ankleLeft3:'8.1',ankleRight1:'7.5',ankleRight2:'7.7',ankleRight3:'7.6',posteriorLeft1:'24',posteriorLeft2:'25',posteriorLeft3:'24.5',posteriorRight1:'22',posteriorRight2:'22.5',posteriorRight3:'22.2',hipRotationResult:'Simétrica',squatDepth:'Paralela',ankleProtocolVariant:'standard-barefoot',ankleConfiguration:'Pared norte · descalza · cinta desde primer dedo',
    chairStand30s:'18',chairHeightCm:'45',chairStandValid:'on',chairStandConfiguration:'Silla 45 cm · brazos cruzados',pushVariant:'standard',pushUps:'12',pushValid:'on',trxRowRepetitions:'15',trxHandleHeightCm:'95',trxHeelDistanceCm:'80',trxPosition:'Cuerpo alineado',trxValid:'on',frontPlankSeconds:'55',coreProtocolConfiguration:'Colchoneta · antebrazos',
    cardioProtocol:'ymca-3min-standard',stepHeightCm:'30.5',cadenceBpm:'96',cardioDurationSeconds:'180',stepFinalHr:'156',stepOneMinuteHr:'127',cardioValid:'on',cardioConfiguration:'Escalón 30,5 cm · 96 bpm · 180 s',
    diagnosisStrengths:'Buena tolerancia',diagnosisPriorities:'Mejorar tracción',coachInterpretation:'Interpretación profesional suficiente y prudente.',trainingImplications:'Priorizar técnica, control y progresión conservadora.',initialPlan:'Plan inicial progresivo de cuatro semanas con seguimiento.',reviewAccepted:'on',
    ...overrides,
  };
}

function validDraft(overrides={}){
  return normalizeFirstSessionDraft(validRaw(overrides),{id:'IRI-V12'},'CLIENT-V12');
}

test('catálogo IRI V12 cubre todas las pruebas con protocolo técnico completo y versionado',()=>{
  const protocols=Object.values(IRI_PROTOCOL_CATALOG);
  assert.equal(protocols.length,16);
  assert.equal(iriProtocolsForStep('movilidad').length,5);
  assert.equal(iriProtocolsForStep('fuerza').length,6);
  assert.equal(iriProtocolsForStep('cardio').length,4);
  assert.ok(IRI_PROTOCOL_CATALOG['one-minute-sit-to-stand']);
  assert.ok(IRI_PROTOCOL_CATALOG['ymca-three-minute-step']);
  assert.ok(IRI_PROTOCOL_CATALOG['bodyweight-squat-60s']);
  assert.ok(IRI_PROTOCOL_CATALOG['treadmill-three-minute-field']);
  assert.ok(IRI_PROTOCOL_CATALOG['legacy-iberfit-three-minute-step-adapted']);
  for(const protocol of protocols){
    assert.match(protocol.id,/^[a-z0-9-]+$/);
    assert.equal(protocol.version,IRI_PROTOCOL_CATALOG_VERSION);
    assert.ok(protocol.name);
    assert.ok(protocol.evaluates);
    assert.ok(protocol.doesNotDiagnose);
    for(const key of ['material','startPosition','steps','observe','valid','invalid','stop','record','interpretation']){
      assert.ok(Array.isArray(protocol[key])&&protocol[key].length>0,`${protocol.id}:${key}`);
    }
    assert.ok(protocol.visual?.kind);
    assert.ok(protocol.visual?.start);
    assert.ok(protocol.visual?.finish);
    assert.ok(protocol.form?.configuration);
    assert.ok(protocol.form?.valid);
    assert.ok(protocol.form?.adaptation);
    assert.ok(protocol.form?.stop);
    assert.ok(protocol.form?.target);
  }
});

test('pantalla Coach integra tarjetas, demostración, validez y registro sin abandonar el IRI',()=>{
  const html=renderIriRoute({
    current:{id:'IRI-V12'},
    currentSummary:{coverageCount:0,coverageLabel:'0 de 3 dominios de resultado registrados',processLabel:'Evaluación en preparación',confirmed:false,domains:{cardiovascular:false,bodyComposition:false,strength:false}},
    profile:{birthDate:'1992-04-11',sexForNorms:'female',sexForNormsLabel:'Mujer',email:'qa@example.com',phone:'+56 9 1111 2222',modality:'hibrido',modalityLabel:'Híbrida',trainingAddress:'Dirección QA'},
    canEdit:true,history:[],sourceProfile:{},
  });
  assert.match(html,/data-iri-protocol="weight-bearing-lunge"/);
  assert.match(html,/Rodilla a pared · ver protocolo/);
  assert.match(html,/Silla 30 segundos · ver protocolo/);
  assert.match(html,/Ver demostración/);
  assert.match(html,/Posición inicial/);
  assert.match(html,/Cómo realizarla/);
  assert.match(html,/Qué debe observar el Coach/);
  assert.match(html,/Resultado válido/);
  assert.match(html,/Errores que invalidan/);
  assert.match(html,/Cuándo detenerla/);
  assert.match(html,/Qué debe registrarse/);
  assert.match(html,/Cómo se interpreta/);
  assert.match(html,/Registrar resultado/);
  assert.match(html,/data-iri-register-target=/);
  assert.match(html,/m26-protocol-frame/);
  assert.match(html,/m26-protocol-motion/);
  assert.match(html,/Secuencia técnica animada/);
  assert.match(html,/aria-label="Pie próximo a la pared/);
  assert.match(html,/Trazabilidad del registro/);
  assert.match(html,/data-iri-protocol="one-minute-sit-to-stand"/);
  assert.match(html,/data-iri-protocol="ymca-three-minute-step"/);
  assert.match(html,/data-iri-protocol="bodyweight-squat-60s"/);
  assert.match(html,/data-iri-protocol="treadmill-three-minute-field"/);
  assert.doesNotMatch(html,/data-iri-protocol="legacy-iberfit-three-minute-step-adapted"/);
  assert.match(html,new RegExp(IRI_PROTOCOL_CATALOG_VERSION.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('cada resultado guarda prueba, variante, configuración, lado, fecha, versión, validez y motivos',()=>{
  const draft=validDraft({ankleAdaptationReason:'Apoyo ligero por equilibrio',ankleStopReason:'Finalización técnica'});
  assert.ok(Array.isArray(draft.protocolRecords));
  const left=draft.protocolRecords.find((item)=>item.testId==='weight-bearing-lunge'&&item.side==='left');
  const right=draft.protocolRecords.find((item)=>item.testId==='weight-bearing-lunge'&&item.side==='right');
  for(const record of [left,right]){
    assert.equal(record.testName,'Rodilla a pared');
    assert.equal(record.variant,'standard-barefoot');
    assert.equal(record.configuration,'Pared norte · descalza · cinta desde primer dedo');
    assert.equal(record.date,'2026-07-30');
    assert.equal(record.protocolVersion,IRI_PROTOCOL_CATALOG_VERSION);
    assert.equal(record.valid,true);
    assert.equal(record.adaptationReason,'Apoyo ligero por equilibrio');
    assert.equal(record.stopReason,'Finalización técnica');
    assert.ok(Array.isArray(record.result.trials));
  }
  assert.equal(left.result.bestCm,8.2);
  assert.equal(right.result.bestCm,7.7);
  const flattened=flattenFirstSessionDraft(draft);
  assert.equal(flattened.ankleConfiguration,'Pared norte · descalza · cinta desde primer dedo');
  const command=buildIriCommandDraftFromFirstSession(draft,{id:'IRI-V12',body:{}});
  assert.equal(command.protocolRecords.length,draft.protocolRecords.length);
  assert.notEqual(command.protocolRecords,draft.protocolRecords);
  assert.ok(draft.protocolRecords.some((item)=>item.testId==='ymca-three-minute-step'));
  assert.equal(draft.protocolRecords.some((item)=>item.testId==='one-minute-sit-to-stand'),false);
});

test('reevaluación advierte cuando cambian versión, variante o configuración',()=>{
  const previous=validDraft().protocolRecords;
  const versionChanged=structuredClone(previous);
  versionChanged.find((item)=>item.testId==='weight-bearing-lunge'&&item.side==='left').protocolVersion='iri-protocols-2027.01-v2';
  const versionWarnings=protocolComparabilityWarnings(previous,versionChanged);
  assert.ok(versionWarnings.some((item)=>/no son directamente comparables/.test(item)));

  const variantChanged=structuredClone(previous);
  variantChanged.find((item)=>item.testId==='push-test').variant='incline';
  const variantWarnings=protocolComparabilityWarnings(previous,variantChanged);
  assert.ok(variantWarnings.some((item)=>/misma variante|no comparable/.test(item)));

  const configurationChanged=structuredClone(previous);
  configurationChanged.find((item)=>item.testId==='chair-stand-30s').configuration='Silla 48 cm';
  const configWarnings=protocolComparabilityWarnings(previous,configurationChanged);
  assert.ok(configWarnings.some((item)=>/configuración diferente/.test(item)));

  const oneMinute=validDraft({
    cardioProtocol:'1msts-standard',
    cardioChairHeightCm:'45',
    oneMinuteSitToStandRepetitions:'34',
    cardioDurationSeconds:'60',
    stepHeightCm:'',cadenceBpm:'',stepFinalHr:'',stepOneMinuteHr:'',
  }).protocolRecords;
  const cardioWarnings=protocolComparabilityWarnings(previous,oneMinute);
  assert.ok(cardioWarnings.some((item)=>/protocolos distintos/.test(item)));
  assert.ok(cardioWarnings.some((item)=>/no son directamente comparables/.test(item)));
});

test('informe Cliente explica qué se observó, por qué importa, resultado y decisión',()=>{
  const html=buildIriReportHtml({draft:validDraft(),variant:'client',clientName:'Cliente QA',coachName:'Coach QA'});
  assert.match(html,/Qué observamos/);
  assert.match(html,/Por qué importa/);
  assert.match(html,/Resultado/);
  assert.match(html,/Decisión/);
  assert.match(html,/Rodilla a pared/);
  assert.match(html,/YMCA Step Test · 3 minutos/);
  assert.doesNotMatch(html,/Trazabilidad de protocolos/);
});

test('1MSTS es independiente: 60 s y repeticiones obligatorios, FC opcional',()=>{
  const draft=validDraft({
    cardioProtocol:'1msts-standard',
    cardioChairHeightCm:'45',
    oneMinuteSitToStandRepetitions:'34',
    cardioDurationSeconds:'60',
    stepHeightCm:'',cadenceBpm:'',stepFinalHr:'',stepOneMinuteHr:'',
    cardioConfiguration:'Silla 45 cm · brazos cruzados · 60 s',
  });
  const check=validateFirstSessionDraft(draft);
  assert.equal(check.ok,true,check.errors.join(','));
  assert.equal(draft.cardio.protocol,'1msts-standard');
  assert.equal(draft.cardio.repetitions,34);
  assert.equal(draft.cardio.finalHr,null);
  assert.equal(draft.cardio.oneMinuteHr,null);
  assert.ok(draft.protocolRecords.some((item)=>item.testId==='one-minute-sit-to-stand'));
  assert.equal(draft.protocolRecords.some((item)=>item.testId==='ymca-three-minute-step'),false);
  const html=buildIriReportHtml({draft,variant:'client',clientName:'Cliente QA',coachName:'Coach QA'});
  assert.match(html,/1MSTS · 60 segundos/);
  assert.match(html,/34 repeticiones en 60 s/);
  assert.match(html,/Frecuencia cardiaca no registrada/);
  assert.doesNotMatch(html,/YMCA · 3 minutos/);
});

test('modo terreno registra sentadilla 60 s y cinta 3 min sin apropiarse de baremos ajenos',()=>{
  const draft=validDraft({
    chairStand30s:'',chairStandValid:'',
    squat60Repetitions:'32',squat60DepthCriterion:'Paralelo visual',squat60Stance:'Base cómoda',squat60Valid:'on',
    cardioProtocol:'treadmill-3min-field',cardioDurationSeconds:'180',
    treadmillSpeedKmh:'7.2',treadmillInclinePercent:'0',treadmillLocomotionMode:'jog',cardioHrMethod:'chest-strap',cardioRecoveryMode:'standing-passive',
    stepHeightCm:'',cadenceBpm:'',stepFinalHr:'158',stepOneMinuteHr:'126',twoMinuteHr:'108',
    cardioConfiguration:'Cinta 7,2 km/h · 0% · recuperación pasiva de pie',
  });
  const check=validateFirstSessionDraft(draft);
  assert.equal(check.ok,true,check.errors.join(','));
  assert.equal(draft.strength.squat60.repetitions,32);
  assert.equal(draft.cardio.protocol,'treadmill-3min-field');
  assert.equal(draft.cardio.deltaOneMinute,32);
  assert.equal(draft.cardio.deltaTwoMinute,50);
  const squat=draft.protocolRecords.find((item)=>item.testId==='bodyweight-squat-60s');
  const treadmill=draft.protocolRecords.find((item)=>item.testId==='treadmill-three-minute-field');
  assert.equal(squat.valid,true);
  assert.equal(squat.normEligible,false);
  assert.equal(squat.measurementClass,'standard_baseline');
  assert.equal(treadmill.valid,true);
  assert.equal(treadmill.normEligible,false);
  assert.equal(treadmill.trackingComparable,true);
  const html=buildIriReportHtml({draft,variant:'client',clientName:'Cliente QA',coachName:'Coach QA'});
  assert.match(html,/Cinta · 3 minutos/);
  assert.match(html,/HRR1/);
  assert.match(html,/HRR2/);
  assert.match(html,/Sentadilla libre 60 s/);
});

test('adaptación de campo puede ser válida y comparable sin convertirse en baremo',()=>{
  const draft=validDraft({
    ankleProtocolVariant:'supported-adaptation',
    ankleAdaptationReason:'Apoyo estable por equilibrio',
    ankleConfiguration:'Pared norte · apoyo de mano · misma cinta',
  });
  const left=draft.protocolRecords.find((item)=>item.testId==='weight-bearing-lunge'&&item.side==='left');
  assert.equal(left.valid,true);
  assert.equal(left.normEligible,false);
  assert.equal(left.trackingComparable,true);
  assert.equal(left.measurementClass,'adapted_baseline');
  assert.ok(IRI_PROTOCOL_CATALOG['back-saver'].variants.some((item)=>item.id==='floor-mat-adapted'));
  assert.ok(IRI_PROTOCOL_CATALOG['modified-thomas'].variants.some((item)=>item.id==='floor-mat-observation'));
});

test('YMCA estándar exige su configuración y no comparte contrato con 1MSTS',()=>{
  const draft=validDraft();
  const check=validateFirstSessionDraft(draft);
  assert.equal(check.ok,true,check.errors.join(','));
  assert.equal(draft.cardio.protocol,'ymca-3min-standard');
  assert.equal(draft.cardio.stepHeightCm,30.5);
  assert.equal(draft.cardio.cadenceBpm,96);
  assert.equal(draft.cardio.durationSeconds,180);
  assert.ok(draft.protocolRecords.some((item)=>item.testId==='ymca-three-minute-step'));
  assert.equal(draft.protocolRecords.some((item)=>item.testId==='one-minute-sit-to-stand'),false);
});

test('informe IRI permanece baseline-only aunque reciba historia longitudinal',()=>{
  const draft=validDraft();
  const html=buildIriReportHtml({
    draft,variant:'client',clientName:'Cliente QA',coachName:'Coach QA',
    longitudinalHistory:[validDraft({assessmentDate:'2026-06-30'})],
  });
  assert.match(html,/Baseline inicial/);
  assert.match(html,/seguimiento longitudinal se mantiene fuera del Diagnóstico IRI/);
  assert.doesNotMatch(html,/Cambios comparables desde la evaluación anterior/);
});

test('formulario IRI no duplica nombres de campos al integrar protocolos',()=>{
  const html=renderIriRoute({current:{id:'IRI-V12'},currentSummary:{coverageCount:0,coverageLabel:'0',processLabel:'En preparación',confirmed:false,domains:{}},profile:{},canEdit:true,history:[],sourceProfile:{}});
  const names=[...html.matchAll(/\bname="([^"]+)"/g)].map((match)=>match[1]);
  const duplicates=names.filter((name,index)=>names.indexOf(name)!==index);
  assert.deepEqual([...new Set(duplicates)],[]);
});

test('CSS de impresión elimina rellenos externos y mantiene una página A4 por sección',()=>{
  const html=buildIriReportHtml({draft:validDraft(),variant:'client',clientName:'Cliente QA',coachName:'Coach QA'});
  assert.match(html,/rel="stylesheet"[^>]+data-iri-report-stylesheet/u);
  assert.doesNotMatch(html,/<style\b/iu);
  assert.match(reportCss,/@media print\{[\s\S]*html,body\{margin:0!important;padding:0!important/u);
  assert.match(reportCss,/width:210mm;height:297mm;margin:0!important/u);
  assert.match(reportCss,/last-child\{break-after:auto;page-break-after:auto\}/u);
});

test('informe Coach incorpora trazabilidad completa y criterio de comparabilidad',()=>{
  const html=buildIriReportHtml({draft:validDraft(),variant:'coach',clientName:'Cliente QA',coachName:'Coach QA'});
  assert.match(html,/Trazabilidad de protocolos/);
  assert.match(html,/VERSIONES Y COMPARABILIDAD/);
  assert.match(html,/Rodilla a pared/);
  assert.match(html,/Pared norte · descalza · cinta desde primer dedo/);
  assert.match(html,new RegExp(IRI_PROTOCOL_CATALOG_VERSION.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(html,/directamente comparable/);
});
