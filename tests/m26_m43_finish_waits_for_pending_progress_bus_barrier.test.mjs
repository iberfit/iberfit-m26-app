import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandBus,createMemoryOperationRepository} from '../src/m26/command-bus.js';
import {dispatchSessionAction} from '../src/m26/workflows/session-controller.js';
import {readFileSync} from 'node:fs';
import {
  createExecution,startExecution,recordSet,advanceExecution,
  buildProgressExecutionCommand,
} from '../src/m26/workflows/session-execution.js';
const clientId='85555555-5555-4555-8555-555555555555';
const executionId='86666666-6666-4666-8666-666666666666';
const session={id:'88888888-8888-4888-8888-888888888888',clientId,
  blocks:[{id:'b1',type:'exercise',exerciseId:'exercise-1',sets:1,reps:'8',restSeconds:0}]};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function makeExecution(){
  const execution=createExecution({session,clientId,executionId});
  startExecution(execution);
  recordSet(execution,session,{reps:8,load:'10 kg',rpe:7});
  advanceExecution(execution);
  return execution;
}
test('finish waits for late same-lineage progress ACK and sends exact CAS 7, not stale 6',async()=>{
  const gate=deferred(),entered=deferred(),calls=[];
  const repo=createMemoryOperationRepository();
  const bus=createCommandBus({
    repository:repo,getToken:async()=> 'synthetic-jwt',getRole:()=> 'client',
    transport:{preflight:async()=>({kind:'ack'}),execute:async(_token,command)=>{
      calls.push({type:command.type,revision:command.baseRevision});
      if(command.type==='EJECUCION_GUARDAR_PROGRESO'){
        entered.resolve();await gate.promise;
        return {kind:'ack',operationId:command.operationId,remoteRevision:7};
      }
      return {kind:'ack',operationId:command.operationId,remoteRevision:8};
    }},rehydrate:async()=>{},
  });
  const execution=makeExecution();execution.revision=6;
  const progress={...buildProgressExecutionCommand(execution,6),
    operationId:'89999999-9999-4999-8999-999999999999'};
  const pending=bus.execute(progress);
  await entered.promise;
  const waiting=bus.awaitExecutionWriteBarrier(execution);
  let settled=false;void waiting.then(()=>{settled=true;});
  await Promise.resolve();
  assert.equal(settled,false,'cannot invent ACK before transport answers');
  gate.resolve();await pending;
  const revision=await waiting;
  assert.equal(revision,7);
  execution.revision=revision;
  const result=dispatchSessionAction({action:'finish',execution,session,commandBus:bus,
    payload:{sessionRpe:7,comment:'QA synthetic',pain:false},online:true});
  const ack=await result.value;
  assert.equal(ack.ok,true);
  assert.deepEqual(calls,[
    {type:'EJECUCION_GUARDAR_PROGRESO',revision:6},
    {type:'EJECUCION_COMPLETAR',revision:7},
  ]);
});
test('barrier is scoped to exact client and execution, not another workout',async()=>{
  const gate=deferred(),entered=deferred(),repo=createMemoryOperationRepository();
  const bus=createCommandBus({repository:repo,getToken:async()=> 'synthetic-jwt',getRole:()=> 'client',
    transport:{preflight:async()=>({kind:'ack'}),execute:async(_token,cmd)=>{
      entered.resolve();await gate.promise;
      return {kind:'ack',operationId:cmd.operationId,remoteRevision:3};
    }}});
  const other=makeExecution();other.id='87777777-7777-4777-8777-777777777777';
  const running=bus.execute({...buildProgressExecutionCommand(other,1),operationId:'89999999-9999-4999-8999-999999999999'});
  await entered.promise;
  assert.equal(await bus.awaitExecutionWriteBarrier(makeExecution()),0);
  gate.resolve();await running;
});
test('offline pending progress blocks terminal submission without silent data loss',async()=>{
  const repo=createMemoryOperationRepository();
  const bus=createCommandBus({repository:repo,getToken:async()=> 'synthetic-jwt',getRole:()=> 'client',
    transport:{preflight:async()=>({kind:'ack'}),execute:async()=>({kind:'ack',remoteRevision:10})}});
  const execution=makeExecution();
  await bus.enqueue({...buildProgressExecutionCommand(execution,3),
    operationId:'89999999-9999-4999-8999-999999999999'});
  await assert.rejects(bus.awaitExecutionWriteBarrier(execution),/M26_EXECUTION_WRITE_BARRIER_PENDING/);
  const records=await repo.list();
  assert.equal(records[0].status,'pending');
  assert.equal(records[0].retryable,true);
});
test('controller uses bus-level barrier before immutable finish CAS construction',()=>{
  // Static guard protects against a future refactor that drops the barrier.
  const source=readFileSync(
    new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(source,/await context\.commandBus\.awaitExecutionWriteBarrier\?\.\(context\.execution\)/u);
  assert.match(source,/context\.execution\.revision=serverRevision/u);
});
