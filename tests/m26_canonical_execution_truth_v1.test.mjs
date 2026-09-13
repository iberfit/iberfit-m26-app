import test from 'node:test';
import assert from 'node:assert/strict';

import {
  confirmedSessionExecutionsForClient,
  sessionExecutionIsConfirmed,
  unconfirmedSessionExecutionIds,
} from '../src/m26/domain/session-execution-truth.js';
import {
  buildExerciseLongitudinalProgress,
  computeProgressSummary,
} from '../src/m26/engagement/progress-engine.js';
import {
  buildPremiumReportPortfolio,
} from '../src/m26/workflows/report-workflow.js';

const CLIENT='c-truth-v1';
const NOW=new Date('2026-09-06T12:00:00.000Z');

function stateFixture(){
  return {
    collections:{
      appointments:[],
      sessions:[{
        id:'s1',
        clientId:CLIENT,
        blocks:[{
          exerciseId:'squat',
          exerciseName:'Sentadilla',
        }],
      }],
      sessionExecutions:[
        {
          id:'e-ambiguous',
          clientId:CLIENT,
          sessionId:'s1',
          status:'completed',
          syncStatus:'clean',
          completedAt:'2026-09-01T11:00:00.000Z',
          title:'Carga ambigua',
          results:[{
            exerciseId:'squat',
            reps:10,
            load:'50',
            rpe:7,
          }],
        },
        {
          id:'e-confirmed',
          clientId:CLIENT,
          sessionId:'s1',
          status:'completed',
          syncStatus:'clean',
          completedAt:'2026-09-03T11:00:00.000Z',
          title:'Carga confirmada',
          results:[{
            exerciseId:'squat',
            reps:10,
            loadKg:20,
            rpe:8,
          }],
        },
        {
          id:'e-pending',
          clientId:CLIENT,
          sessionId:'s1',
          status:'completed',
          syncStatus:'pending',
          completedAt:'2026-09-05T11:00:00.000Z',
          title:'No debe entrar',
          results:[{
            exerciseId:'squat',
            reps:10,
            loadKg:100,
            rpe:10,
          }],
        },
      ],
      iriAssessments:[{
        id:'iri-1',
        clientId:CLIENT,
        revision:1,
        status:'confirmed',
        assessmentDate:'2026-09-01T10:00:00.000Z',
        firstSessionCompletedAt:'2026-09-01T12:00:00.000Z',
        stepFinalHr:150,
        stepOneMinuteHr:115,
        bodyComposition:{weightKg:70},
        strengthPatterns:{squat:1},
      }],
      checkins:[],
      wearableDailySummaries:[],
      reports:[],
    },
    pendingOperations:[{
      operationId:'op-pending',
      type:'EJECUCION_COMPLETAR',
      entityType:'session_execution',
      entityId:'e-pending',
      clientId:CLIENT,
      status:'pending',
    }],
    conflicts:[],
    rejectedOperations:[],
  };
}

test('Canonical Execution Truth excludes pending completion from every consumer',()=>{
  const state=stateFixture();
  const blocked=unconfirmedSessionExecutionIds(state);

  assert.equal(blocked.has('e-pending'),true);
  assert.equal(
    sessionExecutionIsConfirmed(
      state.collections.sessionExecutions[2],
      blocked,
    ),
    false,
  );

  const confirmed=confirmedSessionExecutionsForClient(
    state,
    CLIENT,
    {
      requireCompleted:true,
      requireDate:true,
    },
  );

  assert.deepEqual(
    confirmed.map((item)=>item.id),
    ['e-ambiguous','e-confirmed'],
  );
});

test('Progress volume only uses explicit kg and never fabricates kg from a bare number',()=>{
  const summary=computeProgressSummary(
    stateFixture(),
    CLIENT,
    {
      now:NOW,
      days:28,
    },
  );

  assert.equal(summary.completedSessions,2);
  assert.equal(summary.unconfirmedExecutions,1);
  assert.equal(summary.volume,200);
  assert.equal(summary.volumeDelta,null);
  assert.equal(summary.lastExecutionAt,'2026-09-03T11:00:00.000Z');
  assert.equal(summary.lastExecutionRpe,8);
});

test('Exercise longitudinal progress excludes pending execution and preserves ambiguous load as non-kg',()=>{
  const progress=buildExerciseLongitudinalProgress(
    stateFixture(),
    CLIENT,
  );

  assert.equal(progress.totalExecutions,2);
  assert.equal(progress.exercises.length,1);

  const exercise=progress.exercises[0];

  assert.equal(exercise.sessions,2);
  assert.equal(exercise.latest.executionId,'e-confirmed');
  assert.equal(exercise.latest.maxLoadKg,20);
  assert.equal(exercise.bestLoadKg,20);
  assert.equal(exercise.latest.volumeKgReps,200);
  assert.equal(exercise.history[0].maxLoadKg,null);
  assert.deepEqual(exercise.history[0].loadLabels,['50']);
  assert.equal(exercise.history[0].volumeKgReps,null);
});

test('Premium reports use the same confirmed execution truth as Progress',()=>{
  const reports=buildPremiumReportPortfolio(
    stateFixture(),
    CLIENT,
    {
      now:NOW,
    },
  );

  const post=reports.find((item)=>item.id==='post-session');

  assert.ok(post?.ready);
  assert.equal(post.periodEnd,'2026-09-03');
  assert.match(post.summary,/Carga confirmada/u);
  assert.doesNotMatch(
    JSON.stringify(reports),
    /No debe entrar/u,
  );
});

test('Canonical truth also rejects conflict and rejected completion operations',()=>{
  const state=stateFixture();
  state.collections.sessionExecutions.push(
    {
      id:'e-conflict',
      clientId:CLIENT,
      status:'completed',
      syncStatus:'clean',
      completedAt:'2026-09-04T11:00:00.000Z',
      results:[],
    },
    {
      id:'e-rejected',
      clientId:CLIENT,
      status:'completed',
      syncStatus:'clean',
      completedAt:'2026-09-04T12:00:00.000Z',
      results:[],
    },
  );
  state.conflicts.push({
    type:'EJECUCION_COMPLETAR',
    entityId:'e-conflict',
  });
  state.rejectedOperations.push({
    type:'EJECUCION_COMPLETAR',
    entityId:'e-rejected',
  });

  const confirmed=confirmedSessionExecutionsForClient(
    state,
    CLIENT,
  );

  assert.equal(
    confirmed.some((item)=>item.id==='e-conflict'),
    false,
  );
  assert.equal(
    confirmed.some((item)=>item.id==='e-rejected'),
    false,
  );
});
