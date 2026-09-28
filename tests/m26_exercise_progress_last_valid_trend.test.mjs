import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExerciseLongitudinalProgress,
} from '../src/m26/engagement/progress-engine.js';

const CLIENT='c-progress-last-valid';
const SESSION='session-progress-last-valid';
const EXERCISE='squat';

function execution(id,completedAt,row){
  return {
    id,
    clientId:CLIENT,
    sessionId:SESSION,
    status:'completed',
    syncStatus:'clean',
    completedAt,
    results:{
      [`${EXERCISE}:1`]:{
        exerciseId:EXERCISE,
        exerciseName:'Sentadilla',
        ...row,
      },
    },
    planSnapshot:{
      schemaVersion:1,
      sessionId:SESSION,
      title:'Plan histórico',
      blocks:[{
        id:'block-squat',
        type:'exercise',
        exerciseId:EXERCISE,
        exerciseName:'Sentadilla',
        sets:1,
      }],
    },
  };
}

function exerciseProgress(executions){
  const state={
    collections:{
      sessions:[],
      sessionExecutions:executions,
      appointments:[],
      checkins:[],
      iriAssessments:[],
      wearableDailySummaries:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };

  const progress=buildExerciseLongitudinalProgress(
    state,
    CLIENT
  );

  assert.equal(progress.totalExercises,1);
  return progress.exercises[0];
}

test('A — trend skips one intermediate session without that metric',()=>{
  const item=exerciseProgress([
    execution('a-1','2026-09-20T10:00:00.000Z',{
      reps:8,
      load:'80 kg',
    }),
    execution('a-2','2026-09-21T10:00:00.000Z',{
      reps:9,
    }),
    execution('a-3','2026-09-22T10:00:00.000Z',{
      reps:8,
      load:'85 kg',
    }),
  ]);

  assert.equal(item.loadTrend.direction,'up');
  assert.equal(item.loadTrend.delta,5);

  // Volume also has an intermediate gap: 680 vs 640.
  assert.equal(item.volumeTrend.direction,'up');
  assert.equal(item.volumeTrend.delta,6.3);
});

test('B — trend skips several consecutive sessions without the metric',()=>{
  const item=exerciseProgress([
    execution('b-1','2026-09-20T10:00:00.000Z',{rpe:6}),
    execution('b-2','2026-09-21T10:00:00.000Z',{reps:8}),
    execution('b-3','2026-09-22T10:00:00.000Z',{rir:3}),
    execution('b-4','2026-09-23T10:00:00.000Z',{rpe:8}),
  ]);

  assert.equal(item.rpeTrend.direction,'up');
  assert.equal(item.rpeTrend.delta,2);
});

test('C — trend stays indeterminate when no previous valid metric exists',()=>{
  const item=exerciseProgress([
    execution('c-1','2026-09-20T10:00:00.000Z',{reps:8}),
    execution('c-2','2026-09-21T10:00:00.000Z',{load:'40 kg'}),
    execution('c-3','2026-09-22T10:00:00.000Z',{rpe:7}),
  ]);

  assert.equal(item.rpeTrend.direction,'indeterminate');
  assert.equal(item.rpeTrend.delta,null);
});

test('D — numeric zero remains a valid comparable value',()=>{
  const item=exerciseProgress([
    execution('d-1','2026-09-20T10:00:00.000Z',{
      reps:8,
      load:'0 kg',
    }),
    execution('d-2','2026-09-21T10:00:00.000Z',{
      reps:8,
    }),
    execution('d-3','2026-09-22T10:00:00.000Z',{
      reps:8,
      load:'5 kg',
    }),
  ]);

  assert.equal(item.loadTrend.direction,'up');
  assert.equal(item.loadTrend.delta,5);
});

test('E — sparse metrics resolve their own independent previous valid point',()=>{
  const item=exerciseProgress([
    execution('e-1','2026-09-20T10:00:00.000Z',{
      reps:8,
      load:'80 kg',
    }),
    execution('e-2','2026-09-21T10:00:00.000Z',{
      reps:10,
    }),
    execution('e-3','2026-09-22T10:00:00.000Z',{
      load:'85 kg',
    }),
  ]);

  // Load: e-3 vs e-1.
  assert.equal(item.loadTrend.direction,'up');
  assert.equal(item.loadTrend.delta,5);

  // Reps: e-2 vs e-1, even though the globally latest point e-3 has no reps.
  assert.equal(item.repsTrend.direction,'up');
  assert.equal(item.repsTrend.delta,2);
});

test('F — consecutive valid measurements preserve existing trend semantics',()=>{
  const item=exerciseProgress([
    execution('f-1','2026-09-20T10:00:00.000Z',{
      reps:8,
      load:'80 kg',
      rpe:6,
      rir:3,
    }),
    execution('f-2','2026-09-21T10:00:00.000Z',{
      reps:9,
      load:'85 kg',
      rpe:7,
      rir:2,
    }),
  ]);

  assert.deepEqual(
    {
      direction:item.loadTrend.direction,
      delta:item.loadTrend.delta,
    },
    {
      direction:'up',
      delta:5,
    }
  );

  assert.equal(item.repsTrend.direction,'up');
  assert.equal(item.repsTrend.delta,1);

  assert.equal(item.rpeTrend.direction,'up');
  assert.equal(item.rpeTrend.delta,1);

  assert.equal(item.rirTrend.direction,'down');
  assert.equal(item.rirTrend.delta,-1);

  assert.equal(item.volumeTrend.direction,'up');
});

test('historical point metadata and latest aggregate metadata stay unchanged',()=>{
  const item=exerciseProgress([
    {
      ...execution('meta-1','2026-09-20T10:00:00.000Z',{
        reps:8,
        load:'80 kg',
      }),
      planSnapshot:{
        schemaVersion:1,
        sessionId:SESSION,
        blocks:[{
          id:'block-squat',
          type:'exercise',
          exerciseId:EXERCISE,
          exerciseName:'Sentadilla histórica',
          sets:1,
        }],
      },
    },
    {
      ...execution('meta-2','2026-09-21T10:00:00.000Z',{
        reps:8,
        load:'85 kg',
      }),
      planSnapshot:{
        schemaVersion:1,
        sessionId:SESSION,
        blocks:[{
          id:'block-squat',
          type:'exercise',
          exerciseId:EXERCISE,
          exerciseName:'Sentadilla actual',
          sets:1,
        }],
      },
    },
  ]);

  assert.equal(item.exerciseName,'Sentadilla actual');
  assert.equal(item.latest.exerciseName,'Sentadilla actual');
  assert.deepEqual(
    item.history.map((point)=>point.exerciseName),
    ['Sentadilla histórica','Sentadilla actual']
  );
});
