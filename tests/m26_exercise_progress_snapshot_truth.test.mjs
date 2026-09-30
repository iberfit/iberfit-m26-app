import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExerciseLongitudinalProgress,
} from '../src/m26/engagement/progress-engine.js';

const CLIENT='c-progress-snapshot';
const SESSION='session-progress-snapshot';

function stateFor({execution,sessions=[]}){
  return {
    collections:{
      sessions,
      sessionExecutions:[execution],
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

function completedExecution(overrides={}){
  return {
    id:'execution-progress-snapshot',
    clientId:CLIENT,
    sessionId:SESSION,
    status:'completed',
    syncStatus:'clean',
    completedAt:'2026-09-26T11:00:00.000Z',
    results:{
      'squat:1':{
        exerciseId:'squat',
        exerciseName:'Sentadilla registrada',
        reps:8,
        load:'40 kg',
        rpe:7,
      },
    },
    planSnapshot:{
      schemaVersion:1,
      sessionId:SESSION,
      title:'Plan histórico',
      blocks:[{
        id:'block-squat',
        type:'exercise',
        exerciseId:'squat',
        exerciseName:'Sentadilla original',
        sets:3,
      }],
    },
    ...overrides,
  };
}

test('exercise progress keeps historical exercise metadata after the published session is edited or deleted',()=>{
  const execution=completedExecution();

  const editedSession={
    id:SESSION,
    clientId:CLIENT,
    blocks:[{
      id:'block-squat',
      type:'exercise',
      exerciseId:'squat',
      exerciseName:'Sentadilla hack actual',
      sets:9,
    }],
  };

  const withEditedSession=buildExerciseLongitudinalProgress(
    stateFor({
      execution,
      sessions:[editedSession],
    }),
    CLIENT
  );

  assert.equal(withEditedSession.totalExercises,1);
  assert.equal(
    withEditedSession.exercises[0].exerciseName,
    'Sentadilla original'
  );
  assert.equal(
    withEditedSession.exercises[0].latest.exerciseName,
    'Sentadilla original'
  );

  const withoutCurrentSession=buildExerciseLongitudinalProgress(
    stateFor({
      execution,
      sessions:[],
    }),
    CLIENT
  );

  assert.equal(
    withoutCurrentSession.exercises[0].exerciseName,
    'Sentadilla original'
  );
});

test('exercise progress preserves legacy and mismatched-snapshot fallbacks',()=>{
  const currentSession={
    id:SESSION,
    clientId:CLIENT,
    blocks:[{
      id:'block-squat',
      type:'exercise',
      exerciseId:'squat',
      exerciseName:'Sentadilla actual legacy',
    }],
  };

  const legacy=completedExecution();
  delete legacy.planSnapshot;

  const legacyProgress=buildExerciseLongitudinalProgress(
    stateFor({
      execution:legacy,
      sessions:[currentSession],
    }),
    CLIENT
  );

  assert.equal(
    legacyProgress.exercises[0].exerciseName,
    'Sentadilla actual legacy'
  );

  const mismatched=completedExecution({
    planSnapshot:{
      sessionId:'another-session',
      blocks:[{
        id:'block-squat',
        type:'exercise',
        exerciseId:'squat',
        exerciseName:'No debe usarse',
      }],
    },
  });

  const mismatchedProgress=buildExerciseLongitudinalProgress(
    stateFor({
      execution:mismatched,
      sessions:[currentSession],
    }),
    CLIENT
  );

  assert.equal(
    mismatchedProgress.exercises[0].exerciseName,
    'Sentadilla actual legacy'
  );
});

test('live substitutions never inherit stale metadata from a matching historical snapshot exercise',()=>{
  const execution=completedExecution({
    results:{
      'deadlift:1':{
        exerciseId:'deadlift',
        exerciseName:'Peso muerto registrado live',
        reps:6,
        load:'60 kg',
        rpe:7,
      },
    },
    events:[{
      type:'EXERCISE_SUBSTITUTED',
      payload:{
        fromExerciseId:'squat',
        toExerciseId:'deadlift',
        reason:'Ajuste en sesión',
      },
    }],
    planSnapshot:{
      schemaVersion:1,
      sessionId:SESSION,
      blocks:[
        {
          id:'block-squat',
          type:'exercise',
          exerciseId:'squat',
          exerciseName:'Sentadilla original',
        },
        {
          id:'block-deadlift-other',
          type:'exercise',
          exerciseId:'deadlift',
          exerciseName:'Peso muerto planificado distinto',
        },
      ],
    },
  });

  const liveSession={
    id:SESSION,
    clientId:CLIENT,
    blocks:[{
      id:'block-deadlift-live',
      type:'exercise',
      exerciseId:'deadlift',
      exerciseName:'Peso muerto live',
    }],
  };

  const withCurrentContext=buildExerciseLongitudinalProgress(
    stateFor({
      execution,
      sessions:[liveSession],
    }),
    CLIENT
  );

  assert.equal(
    withCurrentContext.exercises[0].exerciseName,
    'Peso muerto live'
  );

  const withoutCurrentContext=buildExerciseLongitudinalProgress(
    stateFor({
      execution,
      sessions:[],
    }),
    CLIENT
  );

  assert.equal(
    withoutCurrentContext.exercises[0].exerciseName,
    'Peso muerto registrado live'
  );
});

test('exercise progress uses the latest confirmed historical label regardless of execution input order',()=>{
  const older=completedExecution({
    id:'execution-progress-older',
    completedAt:'2026-09-20T11:00:00.000Z',
    planSnapshot:{
      schemaVersion:1,
      sessionId:SESSION,
      title:'Plan histórico antiguo',
      blocks:[{
        id:'block-squat',
        type:'exercise',
        exerciseId:'squat',
        exerciseName:'Sentadilla clásica',
        sets:3,
      }],
    },
  });

  const newer=completedExecution({
    id:'execution-progress-newer',
    completedAt:'2026-09-26T11:00:00.000Z',
    planSnapshot:{
      schemaVersion:1,
      sessionId:SESSION,
      title:'Plan histórico nuevo',
      blocks:[{
        id:'block-squat',
        type:'exercise',
        exerciseId:'squat',
        exerciseName:'Sentadilla trasera actual',
        sets:3,
      }],
    },
  });

  const state=stateFor({execution:older});
  state.collections.sessionExecutions=[older,newer];

  const progress=buildExerciseLongitudinalProgress(
    state,
    CLIENT
  );

  assert.equal(progress.totalExercises,1);
  assert.equal(
    progress.exercises[0].exerciseName,
    'Sentadilla trasera actual'
  );
  assert.equal(
    progress.exercises[0].latest.exerciseName,
    'Sentadilla trasera actual'
  );
  assert.deepEqual(
    progress.exercises[0].history.map((point)=>point.exerciseName),
    ['Sentadilla clásica','Sentadilla trasera actual']
  );
});
