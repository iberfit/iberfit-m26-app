import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandBus,createMemoryOperationRepository} from '../src/m26/command-bus.js';
import {
  createExecution,startExecution,recordSet,advanceExecution,finishExecution,
  buildProgressExecutionCommand,buildExecutionCommand,
} from '../src/m26/workflows/session-execution.js';

const clientId='85555555-5555-4555-8555-555555555555';
const executionId='86666666-6666-4666-8666-666666666666';
const session={id:'88888888-8888-4888-8888-888888888888',clientId,revision:2,
  blocks:[{id:'b1',type:'exercise',exerciseId:'exercise-1',sets:1,reps:'8',restSeconds:60}]};

function fixture(id=executionId){
  const active=createExecution({session,clientId,executionId:id});
  startExecution(active);
  recordSet(active,session,{reps:8,load:'10 kg',rpe:7});
  advanceExecution(active);
  const progress={...buildProgressExecutionCommand(active,active.revision),
    operationId:'89999999-9999-4999-8999-999999999999'};
  const complete=structuredClone(active);
  finishExecution(complete,{sessionRpe:7,comment:'Confirmación sintética',pain:false});
  return {progress,finish:buildExecutionCommand(complete,active.revision)};
}
function deferred(){
  let resolve;
  const promise=new Promise(r=>{resolve=r;});
  return {promise,resolve};
}
function harness({repository=createMemoryOperationRepository(),getToken=async()=> 'synthetic-jwt'}={}){
  const calls=[];
  const bus=createCommandBus({
    repository,getToken,getRole:()=> 'cliente',
    rehydrate:async()=>{},
    transport:{
      preflight:async()=>({kind:'ack'}),
      execute:async(_token,command)=>{
        calls.push(command.type);
        return {kind:'ack',remoteRevision:12,operationId:command.operationId};
      },
    },
  });
  return {bus,calls,repository};
}

test('terminal server ACK fences progress that was waiting on an asynchronous token refresh',async()=>{
  const gate=deferred(),{progress,finish}=fixture();
  let tokenCount=0;
  const h=harness({getToken:async()=>{
    tokenCount++;
    if(tokenCount===1)await gate.promise;
    return 'synthetic-jwt';
  }});
  const stale=h.bus.execute(progress).then(()=>null,error=>error);
  await Promise.resolve();
  const done=await h.bus.execute(finish);
  assert.equal(done.kind,'ack');
  gate.resolve();
  const error=await stale;
  assert.match(error?.message||'',/M26_EXECUTION_ALREADY_COMPLETED/u);
  assert.deepEqual(h.calls,['EJECUCION_COMPLETAR']);
  assert.equal((await h.bus.flushPending()).attempted,0);
});

test('progress persisted after a terminal ACK is rejected locally before transport dispatch',async()=>{
  const {progress,finish}=fixture(),gate=deferred(),entered=deferred();
  const underlying=createMemoryOperationRepository();
  const repo={
    list:()=>underlying.list(),
    remove:id=>underlying.remove(id),
    put:async record=>{
      if(record.operationId===progress.operationId&&record.status==='pending'){
        entered.resolve();
        await gate.promise;
      }
      return underlying.put(record);
    },
  };
  const h=harness({repository:repo});
  const stale=h.bus.execute(progress).then(()=>null,error=>error);
  await entered.promise;
  assert.equal((await h.bus.execute(finish)).kind,'ack');
  gate.resolve();
  const error=await stale;
  assert.match(error?.message||'',/M26_EXECUTION_ALREADY_COMPLETED/u);
  assert.deepEqual(h.calls,['EJECUCION_COMPLETAR']);
  const saved=(await repo.list()).find(x=>x.operationId===progress.operationId);
  assert.equal(saved.status,'rejected');
  assert.equal(saved.retryable,false);
  assert.equal(saved.errorCode,'M26_EXECUTION_SUPERSEDED_BY_COMPLETION');
  assert.equal((await h.bus.flushPending()).attempted,0);
});

test('a restarted command bus recovers exact terminal ACK before direct execute or enqueue',async()=>{
  const {progress,finish}=fixture(),repo=createMemoryOperationRepository();
  const first=harness({repository:repo});
  assert.equal((await first.bus.execute(finish)).kind,'ack');
  const second=harness({repository:repo});
  await assert.rejects(second.bus.execute(progress),/M26_EXECUTION_ALREADY_COMPLETED/u);
  await assert.rejects(second.bus.enqueue(progress),/M26_EXECUTION_ALREADY_COMPLETED/u);
  assert.deepEqual(second.calls,[]);
  assert.equal((await second.bus.flushPending()).attempted,0);
});

test('only the completed execution lineage is fenced, not later sessions',async()=>{
  const {progress,finish}=fixture(),repo=createMemoryOperationRepository();
  const h=harness({repository:repo});
  assert.equal((await h.bus.execute(finish)).kind,'ack');
  const later=fixture('87777777-7777-4777-8777-777777777777').progress;
  assert.equal((await h.bus.execute(later)).kind,'ack');
  assert.deepEqual(h.calls,['EJECUCION_COMPLETAR','EJECUCION_GUARDAR_PROGRESO']);
});
