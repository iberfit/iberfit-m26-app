import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAdaptiveSessionContext,
} from '../src/m26/intelligence/adaptive-context.js';

const CLIENT='c-adaptive-truth-v1';
const NOW=new Date('2026-09-06T12:00:00.000Z');

function execution({
  id,
  clientId=CLIENT,
  status='completed',
  syncStatus='clean',
  completedAt,
  createdAt,
  exerciseId='squat',
  loadKg,
}){
  return {
    id,
    clientId,
    status,
    syncStatus,
    ...(completedAt?{completedAt}:{}),
    ...(createdAt?{createdAt}:{}),
    results:[{
      exerciseId,
      reps:8,
      loadKg,
      rpe:7,
      rir:3,
    }],
  };
}

function stateFixture(){
  return {
    collections:{
      appointments:[],
      sessions:[],
      sessionExecutions:[
        execution({
          id:'e-confirmed',
          completedAt:'2026-09-01T10:00:00.000Z',
          loadKg:20,
        }),
        execution({
          id:'e-active',
          status:'active',
          createdAt:'2026-09-05T10:00:00.000Z',
          exerciseId:'bench',
          loadKg:90,
        }),
        execution({
          id:'e-sync-pending',
          syncStatus:'pending',
          completedAt:'2026-09-04T10:00:00.000Z',
          loadKg:100,
        }),
        execution({
          id:'e-command-pending',
          completedAt:'2026-09-03T10:00:00.000Z',
          loadKg:120,
        }),
        execution({
          id:'e-conflict',
          completedAt:'2026-09-02T12:00:00.000Z',
          loadKg:130,
        }),
        execution({
          id:'e-rejected',
          completedAt:'2026-09-02T11:00:00.000Z',
          loadKg:140,
        }),
        execution({
          id:'e-other-client',
          clientId:'c-other',
          completedAt:'2026-09-05T11:00:00.000Z',
          loadKg:200,
        }),
      ],
      iriAssessments:[],
      checkins:[],
      wearableDailySummaries:[],
      clientProfiles:[],
      reports:[],
    },
    pendingOperations:[{
      type:'EJECUCION_COMPLETAR',
      entityId:'e-command-pending',
    }],
    conflicts:[{
      type:'EJECUCION_COMPLETAR',
      entityId:'e-conflict',
    }],
    rejectedOperations:[{
      type:'EJECUCION_COMPLETAR',
      entityId:'e-rejected',
    }],
  };
}

test('Adaptive Session Context derives history only from canonical confirmed completed executions',()=>{
  const context=buildAdaptiveSessionContext(
    stateFixture(),
    CLIENT,
    {now:NOW},
  );

  assert.deepEqual(context.previousLoads,{squat:20});
  assert.deepEqual(context.recentExerciseIds,['squat']);
  assert.deepEqual(
    Object.keys(context.performanceHistory),
    ['squat'],
  );
  assert.equal(context.performanceHistory.squat.length,1);
  assert.equal(context.performanceHistory.squat[0].loadKg,20);
  assert.equal(
    context.performanceHistory.bench,
    undefined,
    'an active execution must never become adaptive history',
  );
  assert.equal(context.evidence.historyExerciseCount,1);
  assert.equal(context.evidence.historyExposureCount,1);
});


test('adaptive history rejects ACK-only, future and ambiguous load data without inventing poor recovery',()=>{
  const state=stateFixture();
  state.collections.sessionExecutions.push(
    execution({id:'future',completedAt:'2026-09-07T12:00:00Z',loadKg:200}),
    {...execution({id:'ack-only',loadKg:250}),remoteConfirmedAt:'2026-09-05T12:00:00Z'},
    {id:'ambiguous',clientId:CLIENT,status:'completed',syncStatus:'clean',completedAt:'2026-09-05T10:00:00Z',results:[{exerciseId:'bench',load:'20-30 kg',reps:false,rpe:null,rir:[]},{exerciseId:'bench',load:'50 lb'}]},
  );
  const context=buildAdaptiveSessionContext(state,CLIENT,{now:NOW});
  assert.equal(context.previousLoads.squat,20);
  assert.equal(context.previousLoads.bench,undefined);
  assert.equal(context.performanceHistory.bench[0].totalReps,null);
  assert.equal(context.performanceHistory.bench[0].averageRpe,null);
  assert.equal(context.performanceHistory.bench[0].averageRir,null);
  assert.equal(context.decision.reason,'insufficient_or_neutral_data');
  assert.equal(context.decision.progressionAllowed,false);
});
