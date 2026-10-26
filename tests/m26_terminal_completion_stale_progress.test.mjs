import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandBus,createMemoryOperationRepository} from '../src/m26/command-bus.js';
import {
  createExecution,startExecution,recordSet,advanceExecution,finishExecution,
  buildProgressExecutionCommand,buildExecutionCommand,
} from '../src/m26/workflows/session-execution.js';

const clientId='85555555-5555-4555-8555-555555555555';
const executionId='86666666-6666-4666-8666-666666666666';
const secondExecutionId='87777777-7777-4777-8777-777777777777';
const session={id:'88888888-8888-4888-8888-888888888888',clientId,revision:2,
  blocks:[{id:'b1',type:'exercise',exerciseId:'exercise-1',sets:1,reps:'8',restSeconds:60}]};

function fixture(id=executionId){
  const active=createExecution({session,clientId,executionId:id});
  startExecution(active);
  recordSet(active,session,{reps:8,load:'10 kg',rpe:7});
  advanceExecution(active);
  assert.equal(active.status,'awaiting_feedback');
  const progress={...buildProgressExecutionCommand(active,active.revision),
    operationId:'89999999-9999-4999-8999-999999999999'};
  const complete=structuredClone(active);
  finishExecution(complete,{sessionRpe:7,comment:'Completada con server ACK',pain:false});
  const finish=buildExecutionCommand(complete,active.revision);
  return {active,progress,finish};
}
function harness(repository,calls){
  return createCommandBus({
    repository,
    getToken:async()=> 'synthetic-jwt',
    getRole:()=> 'cliente',
    rehydrate:async()=>{},
    transport:{
      preflight:async()=>({kind:'ack'}),
      execute:async(_token,command)=>{
        calls.push({type:command.type,operationId:command.operationId});
        return {kind:'ack',remoteRevision:12,operationId:command.operationId};
      },
    },
  });
}

test('server ACK completion supersedes queued same-execution progress without sending it on flush or reload',async()=>{
  const repository=createMemoryOperationRepository(),calls=[];
  const bus=harness(repository,calls),{progress,finish}=fixture();
  await bus.enqueue(progress);
  assert.equal((await repository.list()).find(x=>x.operationId===progress.operationId).status,'pending');
  const confirmed=await bus.execute(finish);
  assert.equal(confirmed.kind,'ack');
  assert.deepEqual(calls.map(x=>x.type),['EJECUCION_COMPLETAR']);
  const remaining=(await repository.list()).find(x=>x.operationId===progress.operationId);
  assert.equal(remaining.status,'rejected','preserve evidence without claiming ACK');
  assert.equal(remaining.retryable,false);
  assert.equal(remaining.errorCode,'M26_EXECUTION_SUPERSEDED_BY_COMPLETION');
  assert.equal((await bus.flushPending()).attempted,0);
  await assert.rejects(bus.execute(progress),/M26_EXECUTION_ALREADY_COMPLETED/);
  await assert.rejects(bus.enqueue(progress),/M26_EXECUTION_ALREADY_COMPLETED/);
  await assert.rejects(bus.retry(progress.operationId),/M26_EXECUTION_ALREADY_COMPLETED/);
  const restarted=harness(repository,calls);
  assert.equal((await restarted.flushPending()).attempted,0);
  assert.deepEqual(calls.map(x=>x.type),['EJECUCION_COMPLETAR']);
});

test('durable terminal ACK blocks queued late progress after a crash/restart',async()=>{
  const repository=createMemoryOperationRepository(),calls=[];
  const original=harness(repository,calls),{finish,progress}=fixture();
  assert.equal((await original.execute(finish)).kind,'ack');
  const persisted=(await repository.list()).find(x=>x.operationId===executionId);
  assert.equal(persisted.status,'ack');
  // Simulate a stale tab that queued progress while the first context closed.
  await repository.put({
    ...progress,status:'pending',retryable:true,queuedOffline:true,
    createdAt:'2026-10-23T00:00:00.000Z',
    updatedAt:'2026-10-23T00:00:00.000Z',
    attempts:0,nextRetryAt:null,
  });
  const afterReload=harness(repository,calls);
  assert.equal((await afterReload.flushPending()).attempted,0);
  assert.equal((await repository.list()).find(x=>x.operationId===progress.operationId).retryable,false);
  assert.deepEqual(calls.map(x=>x.type),['EJECUCION_COMPLETAR']);
});

test('confirmed completion is scoped: other execution can save independently',async()=>{
  const repository=createMemoryOperationRepository(),calls=[];
  const bus=harness(repository,calls);
  const first=fixture();
  assert.equal((await bus.execute(first.finish)).kind,'ack');
  const other=fixture(secondExecutionId).progress;
  assert.equal((await bus.execute(other)).kind,'ack');
  assert.deepEqual(calls.map(x=>x.type),[
    'EJECUCION_COMPLETAR','EJECUCION_GUARDAR_PROGRESO',
  ]);
});
