import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createExecution,startExecution,recordSet,advanceExecution,retreatExecution,
  updateActiveSetDraft,getActiveSetDraft,
} from '../src/m26/workflows/session-execution.js';

const actor={role:'coach',id:'coach-draft-nav'};
const session={id:'session-draft-nav',clientId:'client-draft-nav',blocks:[{
  id:'exercise-a-block',type:'exercise',exerciseId:'exercise-a',sets:3,reps:'10',restSeconds:60,targetRpe:7,targetRir:3,
}]};

function executionOnSecondSet(){
  const execution=createExecution({session,clientId:'client-draft-nav',executionId:'execution-draft-nav'});
  startExecution(execution,{actor});
  recordSet(execution,session,{reps:10,load:'20 kg',rpe:7,actor});
  advanceExecution(execution,{actor});
  assert.equal(execution.setIndex,1);
  return execution;
}

test('Anterior no mezcla el borrador pendiente con una serie histórica',()=>{
  const execution=executionOnSecondSet();
  updateActiveSetDraft(execution,session,{reps:'9',load:'22 kg',rpe:'8',rir:'2'});
  assert.equal(getActiveSetDraft(execution,session).values.load,'22 kg');

  retreatExecution(execution,{actor});
  assert.equal(execution.setIndex,0);
  assert.equal(execution.reviewingHistory,true);
  assert.equal(getActiveSetDraft(execution,session),null);
  assert.equal(execution.activeSetDraft.values.load,'22 kg');
  assert.equal(execution.activeSetDraft.setNumber,2);
});

test('volver desde historial restaura exactamente el borrador de la serie pendiente',()=>{
  const execution=executionOnSecondSet();
  updateActiveSetDraft(execution,session,{reps:'9',seconds:'',load:'22 kg',rpe:'8',rir:'2',notes:'Ajuste técnico pendiente'});
  retreatExecution(execution,{actor});
  advanceExecution(execution,{actor});

  assert.equal(execution.setIndex,1);
  assert.equal(execution.reviewingHistory,undefined);
  assert.deepEqual(getActiveSetDraft(execution,session).values,{
    reps:'9',seconds:'',load:'22 kg',rpe:'8',rir:'2',notes:'Ajuste técnico pendiente',
  });
});