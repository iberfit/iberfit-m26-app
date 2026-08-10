import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSessionHistory} from '../src/m26/intelligence/adaptive-context.js';
import {generateSessionProposal} from '../src/m26/intelligence/session-engine.js';

test('historial canónico interpreta results como objeto y cargas con unidad',()=>{
  const history=extractSessionHistory([
    {completedAt:'2026-08-09T10:00:00Z',results:{
      'sq:1':{exerciseId:'sq',setNumber:1,reps:8,load:'22,5 kg',rpe:7,rir:3},
      'sq:2':{exerciseId:'sq',setNumber:2,reps:8,load:'22.5 kg',rpe:7.5,rir:2},
    }},
    {completedAt:'2026-08-05T10:00:00Z',results:{
      'sq:1':{exerciseId:'sq',setNumber:1,reps:8,load:'22.5 kg',rpe:7,rir:3},
    }},
  ]);
  assert.equal(history.previousLoads.sq,22.5);
  assert.equal(history.performanceHistory.sq.length,2);
  assert.equal(history.performanceHistory.sq[0].setCount,2);
  assert.equal(history.performanceHistory.sq[0].totalReps,16);
});

const catalogItems=[
  {id:'sq',name_es:'Sentadilla goblet',pattern:'sentadilla',intent:'fuerza',equipment:'mancuerna',difficulty:'intermedio',review_status:'validado_nucleo',media_status:'validado',cues:['Control técnico']},
  {id:'sq2',name_es:'Sentadilla a caja',pattern:'sentadilla',intent:'fuerza',equipment:'mancuerna',difficulty:'intermedio',cues:[]},
  {id:'hinge',name_es:'Peso muerto rumano',pattern:'bisagra',intent:'fuerza',equipment:'mancuerna',difficulty:'intermedio',cues:[]},
  {id:'hinge2',name_es:'Puente de glúteo',pattern:'bisagra',intent:'fuerza',equipment:'peso corporal',difficulty:'intermedio',cues:[]},
  {id:'push',name_es:'Press',pattern:'empuje',intent:'fuerza',equipment:'mancuerna',difficulty:'intermedio',cues:[]},
  {id:'push2',name_es:'Flexión',pattern:'empuje',intent:'fuerza',equipment:'peso corporal',difficulty:'intermedio',cues:[]},
  {id:'pull',name_es:'Remo',pattern:'tracción',intent:'fuerza',equipment:'mancuerna',difficulty:'intermedio',cues:[]},
  {id:'pull2',name_es:'Remo alternativo',pattern:'tracción',intent:'fuerza',equipment:'mancuerna',difficulty:'intermedio',cues:[]},
  {id:'core',name_es:'Dead bug',pattern:'core',intent:'fuerza',equipment:'peso corporal',difficulty:'intermedio',cues:[]},
  {id:'core2',name_es:'Plancha',pattern:'core',intent:'fuerza',equipment:'peso corporal',difficulty:'intermedio',cues:[]},
  {id:'loc',name_es:'Farmer walk',pattern:'locomoción',intent:'fuerza',equipment:'mancuerna',difficulty:'intermedio',cues:[]},
  {id:'loc2',name_es:'Marcha',pattern:'locomoción',intent:'fuerza',equipment:'peso corporal',difficulty:'intermedio',cues:[]},
];
const byId=new Map(catalogItems.map((x)=>[x.id,x]));
const catalog={count:367,list:()=>catalogItems,get:(id)=>byId.get(id)||null};

function input(overrides={}){
  return {
    clientId:'C1',goal:'fuerza',durationMinutes:60,experience:'intermedio',modality:'presencial',
    equipment:['mancuerna'],restrictions:[],painAreas:[],contraindications:[],
    recentExerciseIds:['sq'],previousLoads:{sq:22.5},
    performanceHistory:{sq:[
      {exerciseId:'sq',loadKg:22.5,averageRpe:7,averageRir:3,completedAt:'2026-08-09'},
      {exerciseId:'sq',loadKg:22.5,averageRpe:7.5,averageRir:2,completedAt:'2026-08-05'},
    ]},
    adaptiveContext:{decision:{level:'normal',reason:'stable_progression',progressionAllowed:true,patternLimit:6},evidence:{adherence:.9,historyExerciseCount:1,historyExposureCount:2,iriAvailable:true}},
    ...overrides,
  };
}

test('Copilot usa continuidad y evidencia por ejercicio sin progresión automática',()=>{
  const proposal=generateSessionProposal(input(),catalog);
  const squat=proposal.exercises.find((x)=>x.exerciseId==='sq');
  assert.ok(squat);
  assert.equal(squat.previousLoad,22.5);
  assert.equal(squat.historyCount,2);
  assert.match(squat.loadInstruction,/Valorar/);
  assert.match(squat.loadInstruction,/el entrenador decide/i);
  assert.equal(proposal.qualityChecks.historyAware,true);
  assert.equal(proposal.qualityChecks.automaticProgression,false);
  assert.equal(proposal.rationale.contextEvidence.iriAvailable,true);
});

test('si falta evidencia suficiente mantiene carga aunque el contexto global sea bueno',()=>{
  const proposal=generateSessionProposal(input({performanceHistory:{sq:[{exerciseId:'sq',loadKg:22.5,averageRpe:7,averageRir:3}]}}),catalog);
  const squat=proposal.exercises.find((x)=>x.exerciseId==='sq');
  assert.match(squat.loadInstruction,/Mantener como referencia 22.5 kg/);
  assert.doesNotMatch(squat.loadInstruction,/Valorar/);
  assert.match(squat.loadInstruction,/el entrenador decide/i);
});

test('si recuperación no permite progresar, la carga se mantiene',()=>{
  const proposal=generateSessionProposal(input({adaptiveContext:{decision:{level:'reduced',reason:'recovery_context',progressionAllowed:false,patternLimit:5},evidence:{historyExerciseCount:1}}}),catalog);
  const squat=proposal.exercises.find((x)=>x.exerciseId==='sq');
  assert.match(squat.loadInstruction,/no autoriza proponer progresión/);
  assert.match(squat.loadInstruction,/el entrenador decide/i);
  assert.equal(proposal.requiresManualReview,true);
});
