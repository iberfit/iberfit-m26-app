import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExerciseLongitudinalProgress,
  buildPlanExecutionSummary,
  computeProgressSummary,
} from '../src/m26/engagement/progress-engine.js';

const CLIENT='c-progress-aliases';
const NOW=new Date('2026-09-10T12:00:00.000Z');

function execution({id,status,completedAt,reps,loadKg}){
  return {
    id,
    clientId:CLIENT,
    sessionId:'s-aliases',
    status,
    syncStatus:'clean',
    completedAt,
    results:[{
      exerciseId:'squat',
      exerciseName:'Sentadilla',
      reps,
      loadKg,
      rpe:7,
    }],
  };
}

function stateFixture(){
  return {
    collections:{
      appointments:[],
      sessions:[{
        id:'s-aliases',
        clientId:CLIENT,
        title:'Fuerza base',
        blocks:[{
          id:'b-squat',
          type:'exercise',
          exerciseId:'squat',
          exerciseName:'Sentadilla',
          sets:1,
        }],
      }],
      sessionExecutions:[
        execution({
          id:'e-completada',
          status:'completada',
          completedAt:'2026-09-01T11:00:00.000Z',
          reps:8,
          loadKg:40,
        }),
        execution({
          id:'e-cerrada-confirmada',
          status:'cerrada_confirmada',
          completedAt:'2026-09-03T11:00:00.000Z',
          reps:10,
          loadKg:45,
        }),
      ],
      iriAssessments:[],
      checkins:[],
      wearableDailySummaries:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };
}

test('Progress summary counts every canonical completed-status alias',()=>{
  const summary=computeProgressSummary(
    stateFixture(),
    CLIENT,
    {now:NOW,days:28},
  );

  assert.equal(summary.completedSessions,2);
  assert.equal(summary.plannedSessions,2);
  assert.equal(summary.adherence,1);
  assert.equal(summary.lastExecutionAt,'2026-09-03T11:00:00.000Z');
});

test('Plan vs execution uses canonical completed truth without stale status filtering',()=>{
  const summary=buildPlanExecutionSummary(
    stateFixture(),
    CLIENT,
    {now:NOW,days:28},
  );

  assert.equal(summary.comparedSessions,2);
  assert.equal(summary.plannedSets,2);
  assert.equal(summary.recordedSets,2);
  assert.equal(summary.unmatchedExecutions,0);
});

test('Exercise longitudinal proof includes canonical completed-status aliases',()=>{
  const progress=buildExerciseLongitudinalProgress(
    stateFixture(),
    CLIENT,
  );

  assert.equal(progress.totalExecutions,2);
  assert.equal(progress.totalExercises,1);
  assert.equal(progress.exercises[0].sessions,2);
  assert.equal(progress.exercises[0].latest.executionId,'e-cerrada-confirmada');
  assert.equal(progress.exercises[0].bestLoadKg,45);
});
