import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildIriReportHtml} from '../src/m26/workflows/iri-report-document.js';

function patriciaLikeDraft(){
  return {
    assessmentDate:'2026-10-02',
    personProfile:{
      primaryObjective:'Conocer mi punto de partida.',
      secondaryObjectives:['Tener una referencia para el futuro.'],
      modality:'presencial',
      locationType:'Gimnasio',
      equipment:['TRX','cinta de correr','colchoneta'],
    },
    interview:{
      trainingExperience:'Intermedia',
      currentTraining:'Carrera habitual en cinta.',
      availability:'Viernes · 9:00',
      preferences:'Evaluación por la mañana.',
      restrictions:'Hernia discal declarada.',
    },
    bodyComposition:{weightKg:66.9,bodyFatPercent:33.3,muscleMassKg:41.6,bodyWaterPercent:48.9,waistCm:90,visceralFatLevel:9,method:'bioimpedancia-tetrapolar',device:'BODYPRO GO'},
    mobility:{
      ankle:{leftBest:8,rightBest:8,pain:'No'},
      posteriorChain:{leftBest:7,rightBest:8},
      hipRotation:{result:'Bilateral reproducible'},
      assistedSquat:{depth:'Completa',knees:'Buena alineación',trunk:'Ligeramente curvado.'},
    },
    strength:{
      squat60:{repetitions:35,valid:true},
      lowerBody:{skipped:false},
      push:{variant:'knees',repetitions:8,valid:true},
      trxRow:{repetitions:6,handleHeightCm:100,valid:true},
      core:{frontPlankSeconds:34,quality:'Buena calidad técnica'},
    },
    cardio:{
      protocol:'treadmill-3min-field',durationSeconds:180,valid:true,
      speedKmh:8,inclinePercent:2,locomotionMode:'jog',hrMethod:'manual',
      recoveryMode:'standing-passive',finalHr:150,oneMinuteHr:110,twoMinuteHr:100,
      deltaOneMinute:40,deltaTwoMinute:50,rpe:5,
    },
    diagnosis:{
      strengths:['Buena movilidad de tobillo y muy equilibrada entre ambos lados.'],
      priorities:['Mejorar progresivamente la fuerza del tren superior.'],
      coachInterpretation:'Tienes una buena base general y un margen claro para seguir ganando fuerza.',
      trainingImplications:'Conviene centrar el trabajo en fuerza progresiva y mantener la buena movilidad.',
      initialPlan:'Dos sesiones semanales de fuerza de cuerpo completo, progresando poco a poco.',
      recommendedFrequency:'2 sesiones semanales',
      priorityRecords:[],
    },
    protocolRecords:[
      {testId:'back-saver',testName:'Back-Saver Sit-and-Reach',valid:true,variant:'box-standard',configuration:'3 intentos por lado'},
      {testId:'push-test',testName:'Prueba de empuje',valid:true,variant:'knees'},
    ],
  };
}

test('client report uses approved human premium language and visuals',()=>{
  const html=buildIriReportHtml({draft:patriciaLikeDraft(),variant:'client',clientName:'Patricia',coachName:'Carlos',iriOnly:true});
  assert.match(html,/Movimiento y movilidad/);
  assert.match(html,/9,0\/10/);
  assert.match(html,/6,0\/10/);
  assert.match(html,/8,5\/10/);
  assert.match(html,/iri-strength-index/);
  assert.match(html,/comparación bilateral/i);
  assert.match(html,/Rodillas apoyadas/);
  assert.match(html,/Trote suave/);
  assert.match(html,/Medición manual/);
  assert.match(html,/De pie · pasiva/);
  assert.match(html,/Flexión anterior sentado unilateral/);
  assert.match(html,/Caja estándar/);
  assert.match(html,/Rodillas apoyadas/);
  assert.doesNotMatch(html,/box-standard/);
  assert.doesNotMatch(html,/standard-barefoot/);
  assert.doesNotMatch(html,/counterbalance-support/);
  assert.doesNotMatch(html,/iri-strength-icon/);
  assert.doesNotMatch(html,/iri-body-outline/);
  assert.doesNotMatch(html,/>knees</);
  assert.doesNotMatch(html,/>jog</);
  assert.doesNotMatch(html,/standing-passive/);
});

test('photogrammetry markers are visually precise while keeping a generous hit target',()=>{
  const controller=readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/m26/workflows/iri-photogrammetry.css',import.meta.url),'utf8');
  assert.match(controller,/m26-photo-point-hit" r="54"/);
  assert.match(controller,/m26-photo-point-core" r="8"/);
  assert.match(css,/stroke-width:2\.4/);
  assert.match(css,/stroke-width:4\.5/);
});
