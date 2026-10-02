import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {computeProgressSummary,progressSummaryHasEvolutionEvidence} from '../src/m26/engagement/progress-engine.js';
import {normalizeFirstSessionDraft,buildIriCommandDraftFromFirstSession} from '../src/m26/workflows/iri-first-session.js';
import {renderProgressRoute} from '../src/m26/modules/route-render.js';

const NOW=new Date('2026-09-11T12:00:00Z');

function iriRecord({id,date,chair=14,push=8,weight=67,assessmentType='inicial',clientId='c1'}={}){
  const draft=normalizeFirstSessionDraft({
    assessmentDate:date,birthDate:'1988-04-16',sexForNorms:'female',
    email:'iri-progress@example.com',phone:'+56 9 1111 2222',modality:'hibrido',
    trainingAddress:'Dirección IRI',primaryObjective:'Mejorar fuerza y capacidad física general',
    trainingExperience:'Intermedia',availability:'Dos tardes',screeningAccepted:'on',
    weightKg:String(weight),heightCm:'165',waistCm:'76',
    ankleLeft1:'8',ankleRight1:'8',posteriorLeft1:'24',posteriorRight1:'24',
    hipRotationResult:'Simétrica',squatDepth:'Paralela',chairStand30s:String(chair),
    chairStandValid:'on',pushVariant:'standard',pushUps:String(push),pushValid:'on',
    trxRowRepetitions:'12',trxValid:'on',frontPlankSeconds:'40',
    cardioSkipped:'on',cardioSkipReason:'No se realizó en esta sesión.',
    diagnosisStrengths:'Buena adherencia y control técnico',
    diagnosisPriorities:'Aumentar fuerza funcional',
    coachInterpretation:'Perfil apto para iniciar una progresión individualizada.',
    trainingImplications:'Progresar fuerza con seguimiento separado del diagnóstico.',
    initialPlan:'Plan inicial de ocho semanas con seguimiento estructurado.',
    recommendedFrequency:'2 sesiones por semana',reviewAccepted:'on',
  },{id},clientId);
  const body=buildIriCommandDraftFromFirstSession(draft,{id,clientId});
  return {id,clientId,assessmentDate:date,assessmentType,body:{...body,assessmentType}};
}

function stateWithLegacyReevaluation(){
  return {
    collections:{
      appointments:[],sessionExecutions:[],checkins:[],wearableDailySummaries:[],
      iriAssessments:[
        iriRecord({id:'iri-baseline',date:'2026-06-11',chair:14,push:8,weight:67}),
        iriRecord({id:'iri-old-reevaluation',date:'2026-09-11',chair:18,push:10,weight:65,assessmentType:'reevaluacion'}),
      ],
    },
    pendingOperations:[],conflicts:[],rejectedOperations:[],
  };
}

test('Progreso usa el IRI únicamente como baseline y descarta reevaluaciones IRI legacy',()=>{
  const summary=computeProgressSummary(stateWithLegacyReevaluation(),'c1',{now:NOW,days:120});
  assert.equal(summary.iriAssessmentCount,1);
  assert.equal(summary.iriPrevious,null);
  assert.equal(summary.iriDelta,null);
  assert.ok(summary.iriBaseline);
  assert.equal(summary.iriBaseline.kind,'iri-initial-diagnostic');
  assert.equal(summary.iriBaseline.baselineAssessmentId,'iri-baseline');
  assert.equal(summary.iriBaseline.previousAssessmentId,null);
  assert.equal(summary.iriBaseline.available,false);
  assert.equal(summary.iriBaseline.comparableCount,0);
  assert.equal(summary.iriBaseline.headline.length,0);
  assert.equal(Object.hasOwn(summary.iriBaseline,'score'),false);
});

test('baseline IRI reconoce clientId canónico anidado y nunca mezcla otro cliente',()=>{
  const state=stateWithLegacyReevaluation();
  const baseline=state.collections.iriAssessments[0];
  state.collections.iriAssessments[0]={id:baseline.id,assessmentDate:baseline.assessmentDate,assessmentType:'inicial',body:{...baseline.body,clientId:'c1'}};
  state.collections.iriAssessments.push(iriRecord({id:'iri-other',date:'2026-05-01',clientId:'c2'}));
  const summary=computeProgressSummary(state,'c1',{now:NOW,days:120});
  assert.equal(summary.iriAssessmentCount,1);
  assert.equal(summary.iriBaseline.baselineAssessmentId,'iri-baseline');
});

test('dos filas IRI por sí solas no convierten Progreso en evidencia longitudinal',()=>{
  const summary=computeProgressSummary(stateWithLegacyReevaluation(),'c1',{now:NOW,days:120});
  assert.equal(progressSummaryHasEvolutionEvidence(summary),false);
});

test('la superficie Progreso presenta el IRI como punto de partida, nunca como serie de reevaluaciones',()=>{
  const summary=computeProgressSummary(stateWithLegacyReevaluation(),'c1',{now:NOW,days:120});
  const html=renderProgressRoute({
    role:'coach',summary,timeline:[],alerts:[],signal:{label:'Seguimiento',level:'neutral'},
    longitudinal:null,exerciseProgress:[],planExecution:null,
  });
  assert.match(html,/data-iri-baseline/u);
  assert.match(html,/Diagnóstico IRI inicial/u);
  assert.match(html,/Punto de partida/u);
  assert.match(html,/seguimiento longitudinal se construyen fuera del IRI/u);
  assert.doesNotMatch(html,/data-iri-milestones|data-iri2-progress|Diagnóstico y reevaluación IRI|Hitos IRI comparables|reevaluación IRI anterior/iu);
});

test('el motor de Progreso ya no conecta iriAssessments con el comparador longitudinal legacy',()=>{
  const source=fs.readFileSync(new URL('../src/m26/engagement/progress-engine.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/buildEvolutionProfile|evolutionComparisonSummary|EVOLUTION_FOLLOWUP_KIND/u);
  assert.match(source,/iriBaselineRecord/u);
  assert.match(source,/type&&type!=='inicial'/u);
});
