import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {computeProgressSummary} from '../src/m26/engagement/progress-engine.js';
import {normalizeFirstSessionDraft,buildIriCommandDraftFromFirstSession} from '../src/m26/workflows/iri-first-session.js';
import {renderProgressRoute} from '../src/m26/modules/route-render.js';

const NOW=new Date('2026-09-11T12:00:00Z');

function iriRecord({id,date,chair=14,push=8,weight=67}={}){
  const draft=normalizeFirstSessionDraft({
    assessmentDate:date,
    birthDate:'1988-04-16',
    sexForNorms:'female',
    email:'iri2-progress@example.com',
    phone:'+56 9 1111 2222',
    modality:'hibrido',
    trainingAddress:'Dirección IRI2',
    primaryObjective:'Mejorar fuerza y capacidad física general',
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
  },{id},'c1');
  const body=buildIriCommandDraftFromFirstSession(draft,{id,clientId:'c1'});
  return {id,clientId:'c1',assessmentDate:date,body};
}

function stateWithIri(){
  return {
    collections:{
      appointments:[],
      sessionExecutions:[],
      checkins:[],
      wearableDailySummaries:[],
      iriAssessments:[
        iriRecord({id:'iri-old',date:'2026-06-11',chair:14,push:8,weight:67}),
        iriRecord({id:'iri-new',date:'2026-09-11',chair:18,push:10,weight:65}),
        {id:'iri-draft',clientId:'c1',assessmentDate:'2026-09-10',body:{assessmentDate:'2026-09-10'}},
      ],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };
}

test('Progreso expone IRI 2.0 solo desde evaluaciones confirmadas y comparables',()=>{
  const summary=computeProgressSummary(stateWithIri(),'c1',{now:NOW,days:120});
  assert.ok(summary.iri2);
  assert.equal(summary.iri2.confirmedCount,2);
  assert.equal(summary.iri2.currentAssessmentId,'iri-new');
  assert.equal(summary.iri2.previousAssessmentId,'iri-old');
  assert.ok(summary.iri2.comparableCount>=2);
  const chair=summary.iri2.headline.find((item)=>item.id==='chairStandReps');
  assert.ok(chair);
  assert.equal(chair.delta,4);
  assert.equal(Object.hasOwn(summary.iri2,'score'),false);
});

test('IRI 2.0 reconoce clientId canónico cuando está anidado en body',()=>{
  const state=stateWithIri();
  state.collections.iriAssessments=state.collections.iriAssessments
    .filter((item)=>item.id!=='iri-draft')
    .map((item)=>({id:item.id,assessmentDate:item.assessmentDate,body:{...item.body,clientId:'c1'}}));
  const summary=computeProgressSummary(state,'c1',{now:NOW,days:120});
  assert.equal(summary.iri2.confirmedCount,2);
  assert.equal(summary.iri2.currentAssessmentId,'iri-new');
});

test('IRI 2.0 de Progreso queda aislado por cliente y descarta evaluaciones ajenas',()=>{
  const state=stateWithIri();
  const foreign=iriRecord({id:'iri-other',date:'2026-09-11',chair:30,push:25,weight:90});
  foreign.clientId='c2';
  foreign.body={...foreign.body,clientId:'c2'};
  state.collections.iriAssessments.push(foreign);
  const summary=computeProgressSummary(state,'c1',{now:NOW,days:120});
  assert.equal(summary.iri2.confirmedCount,2);
  assert.equal(summary.iri2.currentAssessmentId,'iri-new');
  assert.equal(summary.iri2.headline.some((item)=>item.current===30),false);
});

test('Progreso conserva línea base sin fabricar evolución cuando solo hay un IRI confirmado',()=>{
  const state=stateWithIri();
  state.collections.iriAssessments=[state.collections.iriAssessments[1]];
  const summary=computeProgressSummary(state,'c1',{now:NOW,days:120});
  assert.equal(summary.iri2.confirmedCount,1);
  assert.equal(summary.iri2.available,false);
  assert.equal(summary.iri2.comparableCount,0);
  assert.match(summary.iri2.detail,/línea de base/u);
});

test('la superficie Progreso presenta cambios descriptivos sin puntuación global ni juicio de valor',()=>{
  const summary=computeProgressSummary(stateWithIri(),'c1',{now:NOW,days:120});
  const html=renderProgressRoute({
    role:'coach',
    summary,
    timeline:[],
    alerts:[],
    signal:{label:'Seguimiento',level:'neutral'},
    longitudinal:null,
    exerciseProgress:[],
  });
  assert.match(html,/data-iri2-progress/u);
  assert.match(html,/Evolución IRI 2\.0/u);
  assert.match(html,/Sin puntuación global/u);
  assert.match(html,/Silla 30 s/u);
  assert.match(html,/\+4 rep/u);
  const iriPanel=html.match(/<section class="m26-panel m26-panel-soft" data-iri2-progress>[\s\S]*?<\/section>/u)?.[0]||'';
  assert.ok(iriPanel,'Panel IRI 2.0 no localizado');
  assert.doesNotMatch(iriPanel,/mejoraste|empeoraste|éxito|fracaso|good|bad/iu);
});

test('la rama mantiene el módulo IRI 2.0 dentro de la PWA instalada',()=>{
  const sw=fs.readFileSync(new URL('../public/m26/sw.js',import.meta.url),'utf8');
  assert.match(sw,/\/src\/m26\/workflows\/iri-2-longitudinal\.js/u);
});
