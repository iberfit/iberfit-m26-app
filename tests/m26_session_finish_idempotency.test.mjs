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
} from '../src/m26/workflows/session-execution.js';

const executionId='11111111-1111-4111-8111-111111111111';
const clientId='22222222-2222-4222-8222-222222222222';
const session={
  id:'session-finish-idempotency',
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

function completedExecution(){
  const execution=createExecution({session,clientId,executionId});
  startExecution(execution);
  recordSet(execution,session,{reps:8,load:'40 kg',rpe:8,rir:2,notes:'OK'});
  advanceExecution(execution);
  finishExecution(execution,{sessionRpe:8,comment:'Sesión completada',pain:false});
  return execution;
}

test('EJECUCION_COMPLETAR usa una operationId estable y UUID-compatible por ejecución',()=>{
  const execution=completedExecution();
  const first=buildExecutionCommand(execution,3);
  const second=buildExecutionCommand(structuredClone(execution),3);
  assert.equal(first.operationId,executionId);
  assert.equal(second.operationId,executionId);
  assert.deepEqual(second,first);
});

test('dos ejecuciones distintas no comparten la operationId de finalización',()=>{
  const first=completedExecution();
  const second=structuredClone(first);
  second.id='33333333-3333-4333-8333-333333333333';
  assert.notEqual(buildExecutionCommand(first,3).operationId,buildExecutionCommand(second,3).operationId);
});

test('Command Bus single-flight evita dos envíos concurrentes de la misma finalización',async()=>{
  const repository=createMemoryOperationRepository();
  let executeCalls=0;
  let release;
  const gate=new Promise((resolve)=>{release=resolve;});
  const bus=createCommandBus({
    transport:{
      preflight:async()=>({kind:'ack',remoteRevision:3}),
      execute:async()=>{executeCalls+=1;await gate;return {kind:'ack',remoteRevision:4};},
    },
    repository,
    getToken:async()=> 'jwt',
    rehydrate:async()=>{},
    getRole:()=> 'cliente',
  });
  const command=buildExecutionCommand(completedExecution(),3);
  const first=bus.execute(command);
  const second=bus.execute(structuredClone(command));
  await Promise.resolve();
  release();
  const [a,b]=await Promise.all([first,second]);
  assert.equal(executeCalls,1);
  assert.equal(a.ok,true);
  assert.equal(b.ok,true);
  assert.equal(a.command.operationId,executionId);
  assert.equal(b.command.operationId,executionId);
});

test('replay remoto de la misma finalización acepta duplicate como éxito',async()=>{
  const repository=createMemoryOperationRepository();
  let executeCalls=0;
  const bus=createCommandBus({
    transport:{
      preflight:async()=>({kind:'ack',remoteRevision:3}),
      execute:async(_token,command)=>{
        executeCalls+=1;
        assert.equal(command.operationId,executionId);
        return executeCalls===1
          ?{kind:'ack',remoteRevision:4}
          :{kind:'duplicate',remoteRevision:4};
      },
    },
    repository,
    getToken:async()=> 'jwt',
    rehydrate:async()=>{},
    getRole:()=> 'cliente',
  });
  const command=buildExecutionCommand(completedExecution(),3);
  const first=await bus.execute(command);
  const replay=await bus.execute(structuredClone(command));
  assert.equal(first.kind,'ack');
  assert.equal(replay.kind,'duplicate');
  assert.equal(replay.ok,true);
  assert.equal((await bus.pending()).length,0);
});

test('doble enqueue offline de la misma finalización converge en una sola operación pendiente',async()=>{
  const repository=createMemoryOperationRepository();
  const bus=createCommandBus({
    transport:{preflight:async()=>({}),execute:async()=>({kind:'ack',remoteRevision:4})},
    repository,
    getToken:async()=> 'jwt',
    rehydrate:async()=>{},
    getRole:()=> 'cliente',
  });
  const command=buildExecutionCommand(completedExecution(),3);
  await bus.enqueue(command);
  await bus.enqueue(structuredClone(command));
  const pending=await bus.pending();
  assert.equal(pending.length,1);
  assert.equal(pending[0].operationId,executionId);
  assert.equal(pending[0].type,'EJECUCION_COMPLETAR');
});
