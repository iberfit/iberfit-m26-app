import test from 'node:test';
import assert from 'node:assert/strict';

import {createCommandBus,createMemoryOperationRepository} from '../src/m26/command-bus.js';
import {
  createExecution,
  startExecution,
  recordSet,
  advanceExecution,
  finishExecution,
  buildExecutionCommand,
  buildProgressExecutionCommand,
} from '../src/m26/workflows/session-execution.js';
import {
  createExecutionRecoveryCoordinator,
  createMemoryExecutionRecoveryStore,
} from '../src/m26/workflows/session-recovery.js';

const executionId='71111111-1111-4111-8111-111111111111';
const clientId='72222222-2222-4222-8222-222222222222';
const ownerId='73333333-3333-4333-8333-333333333333';
const session={
  id:'session-finish-crash-recovery',
  clientId,
  revision:4,
  blocks:[{
    id:'block-1',
    type:'exercise',
    exerciseId:'exercise-1',
    sets:1,
    reps:'8',
    restSeconds:60,
    targetRpe:7,
    targetRir:3,
  }],
};

function awaitingFeedbackExecution(){
  const execution=createExecution({session,clientId,executionId});
  startExecution(execution);
  recordSet(execution,session,{reps:8,load:'40 kg',rpe:8,rir:2,notes:'OK'});
  advanceExecution(execution);
  assert.equal(execution.status,'awaiting_feedback');
  return execution;
}

function completedFrom(execution,{sessionRpe=8,comment='Sesión completada sin dolor'}={}){
  const completed=structuredClone(execution);
  finishExecution(completed,{sessionRpe,comment,pain:false});
  return completed;
}

function busHarness({transportExecute=async()=>({kind:'duplicate',remoteRevision:9})}={}){
  const repository=createMemoryOperationRepository();
  const bus=createCommandBus({
    transport:{preflight:async()=>({kind:'ack'}),execute:transportExecute},
    repository,
    getToken:async()=> 'jwt',
    rehydrate:async()=>{},
    getRole:()=> 'cliente',
  });
  return {repository,bus};
}

test('recovery restores the exact durable completed snapshot after a crash before local completion persistence',async()=>{
  const stale=awaitingFeedbackExecution();
  const store=createMemoryExecutionRecoveryStore({ownerId});
  await store.save({execution:stale,session,sessionRevision:session.revision,appointmentId:'appointment-1'});

  const completed=completedFrom(stale);
  const completionEvent=completed.events.find((event)=>event.type==='SESSION_COMPLETED');
  const command=buildExecutionCommand(completed,stale.revision);
  const {bus}=busHarness();
  await bus.enqueue(command);

  const before=await store.load(executionId);
  assert.equal(before.execution.status,'awaiting_feedback');

  let activeContext=null;
  const errors=[];
  const coordinator=createExecutionRecoveryCoordinator({
    store,
    commandBus:bus,
    isOnline:()=>true,
    getActiveContext:()=>activeContext,
    onReconcileError:(error)=>errors.push(error.message),
  });

  const recovered=await coordinator.latest({clientId});
  assert.ok(recovered);
  assert.equal(recovered.execution.status,'completed');
  assert.equal(recovered.execution.syncStatus,'pending');
  assert.deepEqual(recovered.execution.pendingOperationIds,[executionId]);
  assert.equal(recovered.execution.completedAt,completed.completedAt);
  assert.deepEqual(recovered.execution.feedback,completed.feedback);
  assert.deepEqual(
    recovered.execution.events.find((event)=>event.type==='SESSION_COMPLETED'),
    completionEvent,
  );
  assert.deepEqual(errors,[]);

  activeContext={
    execution:recovered.execution,
    session:recovered.session,
    appointmentId:recovered.appointmentId,
    sessionRevision:recovered.sessionRevision,
  };
  const sync=await coordinator.synchronize();
  assert.equal(sync.attempted,1);
  assert.equal(sync.results[0].kind,'duplicate');
  assert.equal(activeContext.execution.status,'completed');
  assert.equal(activeContext.execution.syncStatus,'clean');
  assert.deepEqual(activeContext.execution.pendingOperationIds,[]);
  assert.equal(activeContext.execution.completedAt,completed.completedAt);
  assert.deepEqual(activeContext.execution.feedback,completed.feedback);
  assert.deepEqual(
    activeContext.execution.events.find((event)=>event.type==='SESSION_COMPLETED'),
    completionEvent,
  );
  assert.equal(await store.load(executionId),null);
  assert.equal(await bus.recoverExecutionCompletion(executionId),null);
});

test('remote ACK remains durable until stale recovery is repaired, then cannot reopen Finalizar',async()=>{
  const stale=awaitingFeedbackExecution();
  const store=createMemoryExecutionRecoveryStore({ownerId});
  await store.save({execution:stale,session,sessionRevision:session.revision,appointmentId:'appointment-ack'});

  const completed=completedFrom(stale,{sessionRpe:9,comment:'Cierre confirmado en remoto'});
  const completionEvent=completed.events.find((event)=>event.type==='SESSION_COMPLETED');
  const {bus}=busHarness({transportExecute:async()=>({kind:'ack',remoteRevision:10})});
  const result=await bus.execute(buildExecutionCommand(completed,stale.revision));
  assert.equal(result.kind,'ack');
  assert.equal((await bus.pending()).length,0);

  const durableAck=await bus.recoverExecutionCompletion(executionId);
  assert.equal(durableAck.operation.status,'ack');
  assert.equal(durableAck.patch.completedAt,completed.completedAt);
  assert.deepEqual(durableAck.patch.feedback,completed.feedback);

  const coordinator=createExecutionRecoveryCoordinator({store,commandBus:bus,isOnline:()=>true});
  const latest=await coordinator.latest({clientId});
  assert.equal(latest,null);
  assert.equal(await store.load(executionId),null);
  assert.equal(await bus.recoverExecutionCompletion(executionId),null);

  const exactEvent=durableAck.patch.events.find((event)=>event.type==='SESSION_COMPLETED');
  assert.deepEqual(exactEvent,completionEvent);
});

test('durable completion lookup never exposes a non-completion operation payload',async()=>{
  const stale=awaitingFeedbackExecution();
  const {bus}=busHarness();
  const progress={...buildProgressExecutionCommand(stale,stale.revision),operationId:executionId};
  await bus.enqueue(progress);
  assert.equal(await bus.recoverExecutionCompletion(executionId),null);
});

test('a durable completion conflict restores completed state but never reopens Finalizar',async()=>{
  const stale=awaitingFeedbackExecution();
  const store=createMemoryExecutionRecoveryStore({ownerId});
  await store.save({execution:stale,session,sessionRevision:session.revision,appointmentId:'appointment-1'});

  const completed=completedFrom(stale,{sessionRpe:9,comment:'Cierre que requiere reconciliación'});
  const {bus}=busHarness({transportExecute:async()=>({kind:'conflict',reason:'REVISION_CONFLICT'})});
  await bus.enqueue(buildExecutionCommand(completed,stale.revision));
  const flush=await bus.flushPending();
  assert.equal(flush.results[0].kind,'conflict');

  const coordinator=createExecutionRecoveryCoordinator({store,commandBus:bus,isOnline:()=>true});
  const recovered=await coordinator.latest({clientId});
  assert.equal(recovered.execution.status,'completed');
  assert.equal(recovered.execution.syncStatus,'conflict');
  assert.deepEqual(recovered.execution.pendingOperationIds,[]);
  assert.equal(recovered.execution.completedAt,completed.completedAt);
  assert.equal(recovered.execution.lastSyncError,'REVISION_CONFLICT');
});
