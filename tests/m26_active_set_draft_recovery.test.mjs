import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {
  createExecution,
  startExecution,
  recordSet,
  advanceExecution,
  finishExecution,
  getActiveSetDraft,
  updateActiveSetDraft,
  buildProgressExecutionCommand,
} from '../src/m26/workflows/session-execution.js';

const session={
  id:'session-draft-recovery',
  blocks:[{
    id:'block-1',
    type:'exercise',
    exerciseId:'exercise-1',
    sets:2,
    reps:'8-10',
    restSeconds:60,
    targetRpe:7,
    targetRir:3,
  }],
};

function activeExecution(){
  const execution=createExecution({session,clientId:'client-1',executionId:'execution-1'});
  startExecution(execution);
  return execution;
}

const values={reps:'9',seconds:'',load:'42.5 kg',rpe:'8',rir:'2',notes:'Última repetición lenta'};

test('active-set draft survives recoverable execution rehydration for the exact same step',()=>{
  const execution=activeExecution();
  updateActiveSetDraft(execution,session,values);
  const recovered=structuredClone(execution);
  assert.deepEqual(getActiveSetDraft(recovered,session)?.values,values);
});

test('active-set draft is ignored when the recovered execution points to another set',()=>{
  const execution=activeExecution();
  updateActiveSetDraft(execution,session,values);
  execution.setIndex=1;
  assert.equal(getActiveSetDraft(execution,session),null);
});

test('active-set draft clears when a set is confirmed, execution advances, or session finishes',()=>{
  const execution=activeExecution();
  updateActiveSetDraft(execution,session,values);
  recordSet(execution,session,{reps:9,load:'42.5 kg',rpe:8,rir:2,notes:'Última repetición lenta'});
  assert.equal(execution.activeSetDraft,undefined);

  execution.activeSetDraft={executionId:execution.id,blockId:'block-1',exerciseId:'exercise-1',setNumber:1,values};
  advanceExecution(execution);
  assert.equal(execution.activeSetDraft,undefined);

  recordSet(execution,session,{reps:8,load:'42.5 kg',rpe:8,rir:2,notes:'OK'});
  advanceExecution(execution);
  assert.equal(execution.status,'awaiting_feedback');
  execution.activeSetDraft={executionId:execution.id,blockId:'block-1',exerciseId:'exercise-1',setNumber:2,values};
  finishExecution(execution,{sessionRpe:8,comment:'Sesión completada',pain:false});
  assert.equal(execution.activeSetDraft,undefined);
});

test('active-set draft is excluded from every progress remote snapshot',()=>{
  const execution=activeExecution();
  updateActiveSetDraft(execution,session,values);
  const command=buildProgressExecutionCommand(execution,0);
  assert.equal(command.payload.progressSnapshot.activeSetDraft,undefined);
  assert.equal(execution.activeSetDraft.values.load,'42.5 kg');
});

test('session controller rehydrates set fields after telemetry-driven renders',()=>{
  const source=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(source,/getActiveSetDraft/);
  assert.match(source,/updateActiveSetDraft/);
  assert.match(source,/onUpdate:\(\)=>render\?\.\(\)/);
  assert.match(source,/render=\(\)=>\{baseRender\?\.\(\);hydrateActiveSetDraft\(getContext\(\)\);\}/);
  assert.match(source,/querySelectorAll\?\.\('\[data-set-field\]'\)/);
  assert.match(source,/hydrateActiveSetDraft\(getContext\(\)\)/);
});
