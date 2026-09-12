import test from 'node:test';
import assert from 'node:assert/strict';

import {buildPlanExecutionSummary} from '../src/m26/engagement/progress-engine.js';
import {renderProgressRoute} from '../src/m26/modules/route-render.js';

const NOW=new Date('2026-09-12T12:00:00Z');

function results(count){
  const out={};
  for(let index=1;index<=count;index+=1){
    out[`set-${index}`]={exerciseId:index<=3?'squat':'row',setNumber:index,reps:10,rpe:7};
  }
  return out;
}

function sampleState(){
  return {
    collections:{
      sessions:[{
        id:'s1',
        clientId:'c1',
        title:'Fuerza base',
        blocks:[
          {id:'b1',type:'exercise',exerciseId:'squat',sets:3,reps:'10'},
          {id:'b2',type:'circuit',exerciseIds:['row','press'],rounds:2},
        ],
      }],
      sessionExecutions:[
        {
          id:'e1',clientId:'c1',sessionId:'s1',status:'completed',syncStatus:'clean',
          completedAt:'2026-09-10T11:00:00Z',results:results(7),skippedSets:{},events:[],
        },
        {
          id:'e2',clientId:'c1',sessionId:'s1',status:'completed',syncStatus:'clean',
          completedAt:'2026-09-11T11:00:00Z',results:results(5),
          skippedSets:{
            a:{exerciseId:'press',setNumber:1,reason:'Ajuste contextual'},
            b:{exerciseId:'press',setNumber:2,reason:'Ajuste contextual'},
          },
          events:[{type:'EXERCISE_SUBSTITUTED',at:'2026-09-11T10:15:00Z'}],
        },
        {
          id:'e-unmatched',clientId:'c1',sessionId:'missing-session',status:'completed',syncStatus:'clean',
          completedAt:'2026-09-11T12:00:00Z',results:results(2),events:[],
        },
      ],
      appointments:[],
      checkins:[],
      iriAssessments:[],
      wearableDailySummaries:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };
}

test('Evolución compara planificación publicada y ejecución confirmada sin score',()=>{
  const summary=buildPlanExecutionSummary(sampleState(),'c1',{now:NOW,days:28});
  assert.equal(summary.comparedSessions,2);
  assert.equal(summary.unmatchedExecutions,1);
  assert.equal(summary.plannedExercises,6);
  assert.equal(summary.plannedSets,14);
  assert.equal(summary.recordedSets,12);
  assert.equal(summary.skippedSets,2);
  assert.equal(summary.substitutions,1);
  assert.equal(summary.explicitAdjustments,1);
  assert.equal(summary.asPlannedSessions,1);
  assert.equal(summary.adjustedSessions,1);
  assert.equal(summary.quality,'media');
  assert.equal(Object.hasOwn(summary,'score'),false);
  assert.match(summary.semantics.neutral,/no las clasifica como mejores o peores/u);
  assert.match(summary.semantics.skipped,/nunca se cuenta como registrada/u);
});

test('Evolución excluye ejecuciones pendientes de confirmación',()=>{
  const state=sampleState();
  state.pendingOperations=[{
    operationId:'op-e2',
    type:'EJECUCION_COMPLETAR',
    entityType:'session_execution',
    entityId:'e2',
    clientId:'c1',
    status:'pending',
  }];
  const summary=buildPlanExecutionSummary(state,'c1',{now:NOW,days:28});
  assert.equal(summary.comparedSessions,1);
  assert.equal(summary.plannedSets,7);
  assert.equal(summary.recordedSets,7);
  assert.equal(summary.skippedSets,0);
  assert.equal(summary.asPlannedSessions,1);
});

test('superficie Seguimiento separa Plan vs ejecución de los hitos IRI',()=>{
  const planExecution=buildPlanExecutionSummary(sampleState(),'c1',{now:NOW,days:28});
  const summary={
    clientId:'c1',days:28,dataQuality:'media',
    plannedSessions:2,completedSessions:2,adherence:1,
    averageRpe:7,volume:null,volumeDelta:null,
    iriCurrent:null,iriPrevious:null,iriDelta:null,iriAssessmentCount:0,
    iriMilestones:null,iri2:null,
    checkins:0,checkinAverage:{energy:null,sleep:null,stress:null,pain:null,fatigue:null,motivation:null},
    lastExecutionAt:null,lastExecutionRpe:null,latestCheckinAt:null,
    unconfirmedExecutions:0,
    wearable:{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'},
  };
  const html=renderProgressRoute({
    role:'coach',
    summary,
    planExecution,
    timeline:[],
    alerts:[],
    signal:{label:'Seguimiento',level:'neutral'},
    longitudinal:null,
    exerciseProgress:[],
  });
  assert.match(html,/data-evolution-plan-execution/u);
  assert.match(html,/Evolución · plan vs ejecución/u);
  assert.match(html,/De la planificación a lo realmente realizado/u);
  assert.match(html,/Series previstas/u);
  assert.match(html,/Series registradas/u);
  assert.match(html,/Series omitidas/u);
  assert.match(html,/Lectura descriptiva/u);
  assert.doesNotMatch(html,/Evolución IRI 2\.0/u);
});

test('sin plan comparable Evolución mantiene la ausencia explícita',()=>{
  const state=sampleState();
  state.collections.sessions=[];
  const summary=buildPlanExecutionSummary(state,'c1',{now:NOW,days:28});
  assert.equal(summary.comparedSessions,0);
  assert.equal(summary.unmatchedExecutions,3);
  assert.equal(summary.quality,'insuficiente');
  assert.match(summary.summary,/Sin sesiones con una planificación publicada comparable/u);
});
