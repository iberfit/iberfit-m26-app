import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addExecutionSet,
  createExecution,
  currentStep,
  startExecution,
  substituteExercise,
} from '../src/m26/workflows/session-execution.js';
import {buildPlanExecutionSummary} from '../src/m26/engagement/progress-engine.js';

const CLIENT='c-historical-plan';
const EXECUTION_ID='44444444-4444-4444-8444-444444444444';

function publishedSession(){
  return {
    id:'session-historical-plan',
    clientId:CLIENT,
    revision:7,
    title:'Fuerza base publicada',
    blocks:[{
      id:'block-squat',
      type:'exercise',
      exerciseId:'squat',
      sets:3,
      reps:'8',
      plannedLoad:'40 kg',
      restSeconds:90,
      targetRpe:7,
      targetRir:3,
    }],
  };
}

function completedExecution(session){
  const execution=createExecution({session,clientId:CLIENT,executionId:EXECUTION_ID});
  execution.status='completed';
  execution.completedAt='2026-09-26T11:00:00.000Z';
  execution.results={
    'squat:1':{exerciseId:'squat',setNumber:1,reps:8,rpe:7},
    'squat:2':{exerciseId:'squat',setNumber:2,reps:8,rpe:8},
    'squat:3':{exerciseId:'squat',setNumber:3,reps:8,rpe:8},
  };
  return execution;
}

test('createExecution preserves an immutable planned snapshot while the live queue changes',()=>{
  const session=publishedSession();
  const execution=createExecution({session,clientId:CLIENT,executionId:EXECUTION_ID});

  assert.equal(execution.planSnapshot.schemaVersion,1);
  assert.equal(execution.planSnapshot.sessionId,session.id);
  assert.equal(execution.planSnapshot.sessionRevision,7);
  assert.equal(execution.planSnapshot.title,'Fuerza base publicada');
  assert.equal(execution.planSnapshot.blocks[0].sets,3);
  assert.equal(execution.planSnapshot.queue[0].sets,3);

  session.title='Plan reescrito después';
  session.blocks[0].sets=9;
  startExecution(execution);
  addExecutionSet(execution,{actor:{role:'coach'}});

  assert.equal(execution.queue[0].sets,4);
  assert.equal(execution.planSnapshot.title,'Fuerza base publicada');
  assert.equal(execution.planSnapshot.blocks[0].sets,3);
  assert.equal(execution.planSnapshot.queue[0].sets,3);
});

test('currentStep keeps immutable planned exercise context after the published session changes or disappears',()=>{
  const session=publishedSession();
  session.blocks[0].coachCue='Tempo original 3-1-1';
  const execution=createExecution({session,clientId:CLIENT,executionId:EXECUTION_ID});

  session.blocks[0]={
    ...session.blocks[0],
    sets:9,
    reps:'3',
    plannedLoad:'100 kg',
    coachCue:'Cue reescrito',
  };

  const afterEdit=currentStep(execution,session);
  assert.equal(afterEdit.exercise.coachCue,'Tempo original 3-1-1');
  assert.equal(afterEdit.exercise.sets,3);
  assert.equal(afterEdit.exercise.reps,'8');
  assert.equal(afterEdit.exercise.plannedLoad,'40 kg');
  assert.equal(afterEdit.prescription.reps,'8');
  assert.equal(afterEdit.prescription.plannedLoad,'40 kg');

  session.blocks=[];
  const afterDelete=currentStep(execution,session);
  assert.equal(afterDelete.exercise.coachCue,'Tempo original 3-1-1');
  assert.equal(afterDelete.exercise.sets,3);
  assert.equal(afterDelete.exercise.reps,'8');
});

test('currentStep keeps legacy and live-substitution fallbacks outside a matching snapshot block',()=>{
  const legacySession=publishedSession();
  const legacy=createExecution({session:legacySession,clientId:CLIENT,executionId:EXECUTION_ID});
  delete legacy.planSnapshot;
  legacySession.blocks[0].coachCue='Contexto legacy actual';
  assert.equal(currentStep(legacy,legacySession).exercise.coachCue,'Contexto legacy actual');

  const mismatchedSession=publishedSession();
  const mismatched=createExecution({session:mismatchedSession,clientId:CLIENT,executionId:EXECUTION_ID});
  mismatched.planSnapshot.sessionId='another-session';
  mismatchedSession.blocks[0].coachCue='Fallback seguro actual';
  assert.equal(currentStep(mismatched,mismatchedSession).exercise.coachCue,'Fallback seguro actual');

  const liveSession=publishedSession();
  const live=createExecution({session:liveSession,clientId:CLIENT,executionId:EXECUTION_ID});
  liveSession.blocks.push({
    id:'block-deadlift-live',
    type:'exercise',
    exerciseId:'deadlift',
    sets:2,
    reps:'6',
    plannedLoad:'60 kg',
    restSeconds:120,
    targetRpe:7,
    targetRir:3,
    coachCue:'Alternativa en vivo',
  });
  substituteExercise(live,liveSession,{
    fromExerciseId:'squat',
    toExerciseId:'deadlift',
    catalog:new Set(['squat','deadlift']),
    reason:'Ajuste en sesión',
  });
  assert.equal(currentStep(live,liveSession).exercise.coachCue,'Alternativa en vivo');
});

test('Planificación vs ejecución uses the execution plan snapshot after the published session changes or disappears',()=>{
  const original=publishedSession();
  const execution=completedExecution(original);
  const edited=structuredClone(original);
  edited.title='Plan actual editado';
  edited.blocks[0].sets=9;

  const state={
    collections:{
      sessions:[edited],
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

  const first=buildPlanExecutionSummary(state,CLIENT,{now:new Date('2026-09-27T12:00:00.000Z'),days:28});
  assert.equal(first.comparedSessions,1);
  assert.equal(first.unmatchedExecutions,0);
  assert.equal(first.plannedExercises,1);
  assert.equal(first.plannedSets,3);
  assert.equal(first.recordedSets,3);
  assert.equal(first.latest.sessionTitle,'Fuerza base publicada');
  assert.equal(first.latest.asPlanned,true);

  state.collections.sessions=[];
  const withoutCurrentSession=buildPlanExecutionSummary(state,CLIENT,{now:new Date('2026-09-27T12:00:00.000Z'),days:28});
  assert.equal(withoutCurrentSession.comparedSessions,1);
  assert.equal(withoutCurrentSession.unmatchedExecutions,0);
  assert.equal(withoutCurrentSession.plannedSets,3);
  assert.equal(withoutCurrentSession.latest.sessionTitle,'Fuerza base publicada');
});
