import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createExecution} from '../src/m26/workflows/session-execution.js';
import {
  createExecutionRecoveryCoordinator,
  createMemoryExecutionRecoveryStore,
  reconcileExecutionSyncResult,
} from '../src/m26/workflows/session-recovery.js';

function execution(overrides={}){
  return {
    id:'execution-1',
    sessionId:'session-1',
    clientId:'client-1',
    status:'active',
    syncStatus:'pending',
    pendingOperationIds:['op-1','op-2'],
    lastSyncError:'NETWORK_TEMPORARY',
    revision:3,
    ...overrides,
  };
}

function coordinatorHarness({executionValue=execution(),syncResult,onSave,onRemove,onError}={}){
  const context={
    execution:executionValue,
    session:{id:'session-1',clientId:'client-1',revision:7},
    appointmentId:'appointment-1',
    sessionRevision:7,
  };
  const saves=[];
  const removals=[];
  const store={
    async save(value){
      if(onSave)return onSave(value);
      saves.push(structuredClone(value));
      return value;
    },
    async load(){return null;},
    async list(){return [];},
    async remove(id){
      if(onRemove)return onRemove(id);
      removals.push(id);
    },
  };
  const result=syncResult||{
    online:true,
    attempted:1,
    results:[{
      ok:true,
      kind:'ack',
      command:{operationId:'op-1'},
      response:{executionRevision:4},
    }],
  };
  const coordinator=createExecutionRecoveryCoordinator({
    store,
    commandBus:{flushPending:async()=>result},
    isOnline:()=>true,
    getActiveContext:()=>context,
    onReconcileError:onError,
  });
  return {context,coordinator,result,saves,removals};
}

function durableCompletionFixture(){
  const session={
    id:'session-1',
    clientId:'client-1',
    revision:7,
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
  const value=createExecution({session,clientId:'client-1',executionId:'execution-1'});
  Object.assign(value,{
    status:'awaiting_feedback',
    syncStatus:'pending',
    pendingOperationIds:['execution-1'],
    lastSyncError:'M26_AUTH_REQUIRED',
    revision:3,
    index:value.queue.length,
    setIndex:0,
    startedAt:'2026-09-30T10:00:00.000Z',
    activeSince:null,
    accumulatedActiveMs:120000,
    restUntil:null,
  });
  const patch=structuredClone(value);
  delete patch.syncStatus;
  delete patch.pendingOperationIds;
  delete patch.lastSyncError;
  patch.status='completed';
  patch.completedAt='2026-09-30T10:08:00.000Z';
  patch.feedback={sessionRpe:8,comment:'Sesión completada',pain:false,painNotes:''};
  return {session,value,patch};
}

test('one ACK clears only its operation and keeps execution pending while more work remains',()=>{
  const value=execution();
  const result=reconcileExecutionSyncResult(value,{
    results:[{
      ok:true,
      kind:'ack',
      command:{operationId:'op-1'},
      response:{executionRevision:4},
    }],
  });
  assert.deepEqual(result,{changed:true,matched:1,acked:1,conflicts:0,rejected:0,pending:1});
  assert.deepEqual(value.pendingOperationIds,['op-2']);
  assert.equal(value.syncStatus,'pending');
  assert.equal(value.lastSyncError,null);
  assert.equal(value.revision,4);
});

test('all ACKs make recovered execution clean and advance to highest confirmed revision',()=>{
  const value=execution();
  const result=reconcileExecutionSyncResult(value,{
    results:[
      {ok:true,kind:'ack',command:{operationId:'op-1'},response:{executionRevision:4}},
      {ok:true,kind:'duplicate',command:{operationId:'op-2'},response:{remoteRevision:5}},
    ],
  });
  assert.equal(result.pending,0);
  assert.equal(result.acked,2);
  assert.deepEqual(value.pendingOperationIds,[]);
  assert.equal(value.syncStatus,'clean');
  assert.equal(value.lastSyncError,null);
  assert.equal(value.revision,5);
});

test('conflict remains explicit and does not erase unrelated pending work',()=>{
  const value=execution();
  const result=reconcileExecutionSyncResult(value,{
    results:[{
      ok:false,
      kind:'conflict',
      command:{operationId:'op-1'},
      response:{reason:'REVISION_CONFLICT'},
    }],
  });
  assert.equal(result.conflicts,1);
  assert.deepEqual(value.pendingOperationIds,['op-2']);
  assert.equal(value.syncStatus,'conflict');
  assert.equal(value.lastSyncError,'REVISION_CONFLICT');
});

test('network error leaves recovered execution untouched for a later retry',()=>{
  const value=execution();
  const before=structuredClone(value);
  const result=reconcileExecutionSyncResult(value,{
    results:[{ok:false,kind:'network_error',operationId:'op-1',error:'NETWORK'}],
  });
  assert.deepEqual(result,{changed:false,matched:0,acked:0,conflicts:0,rejected:0,pending:2});
  assert.deepEqual(value,before);
});

test('sync results outside this execution cannot mutate its recovery state',()=>{
  const value=execution();
  const before=structuredClone(value);
  const result=reconcileExecutionSyncResult(value,{
    results:[{ok:true,kind:'ack',command:{operationId:'another-op'},response:{executionRevision:99}}],
  });
  assert.equal(result.changed,false);
  assert.deepEqual(value,before);
});

test('future connectivity sync reconciles and persists active recovered execution before mutating memory',async()=>{
  const harness=coordinatorHarness();
  const returned=await harness.coordinator.synchronize();

  assert.strictEqual(returned,harness.result);
  assert.equal(harness.saves.length,1);
  assert.deepEqual(harness.saves[0].execution.pendingOperationIds,['op-2']);
  assert.equal(harness.saves[0].execution.syncStatus,'pending');
  assert.equal(harness.saves[0].execution.revision,4);
  assert.deepEqual(harness.context.execution.pendingOperationIds,['op-2']);
  assert.equal(harness.context.execution.revision,4);
});

test('failed local persistence keeps in-memory recovered execution conservative',async()=>{
  const value=execution();
  const before=structuredClone(value);
  const errors=[];
  const harness=coordinatorHarness({
    executionValue:value,
    onSave:async()=>{throw new Error('LOCAL_SAVE_FAILED');},
    onError:(error)=>errors.push(error.message),
  });

  const returned=await harness.coordinator.synchronize();
  assert.strictEqual(returned,harness.result);
  assert.deepEqual(value,before);
  assert.deepEqual(errors,['LOCAL_SAVE_FAILED']);
});

test('clean settled execution is removed from recovery after acknowledged queued completion',async()=>{
  const value=execution({
    status:'completed',
    pendingOperationIds:['op-1'],
  });
  const harness=coordinatorHarness({
    executionValue:value,
    syncResult:{
      online:true,
      attempted:1,
      results:[{
        ok:true,
        kind:'ack',
        command:{operationId:'op-1'},
        response:{executionRevision:8},
      }],
    },
  });

  await harness.coordinator.synchronize();
  assert.deepEqual(harness.removals,['execution-1']);
  assert.equal(harness.saves.length,0);
  assert.equal(value.syncStatus,'clean');
  assert.deepEqual(value.pendingOperationIds,[]);
  assert.equal(value.revision,8);
});

test('persist promotes a durable pending completion so the live UI cannot reopen feedback after transport uncertainty',async()=>{
  const {session,value,patch}=durableCompletionFixture();
  const store=createMemoryExecutionRecoveryStore({
    ownerId:'coach-a',
    now:()=>new Date('2026-09-30T10:10:00.000Z'),
  });
  const coordinator=createExecutionRecoveryCoordinator({
    store,
    commandBus:{
      async recoverExecutionCompletion(id){
        assert.equal(id,'execution-1');
        return {
          operation:{operationId:id,status:'pending',errorCode:'M26_AUTH_REQUIRED'},
          patch,
        };
      },
    },
    getActiveContext:()=>({execution:value,session,sessionRevision:7}),
  });

  const saved=await coordinator.persist({execution:value,session,sessionRevision:7});

  assert.equal(value.status,'completed');
  assert.equal(value.syncStatus,'pending');
  assert.deepEqual(value.pendingOperationIds,['execution-1']);
  assert.equal(value.feedback.comment,'Sesión completada');
  assert.equal(saved.execution.status,'completed');
  assert.equal(saved.execution.syncStatus,'pending');
});

test('late completion ACK promotes the durable completed snapshot into the active execution and settles it exactly once',async()=>{
  const {session,value,patch}=durableCompletionFixture();
  const store=createMemoryExecutionRecoveryStore({
    ownerId:'coach-a',
    now:()=>new Date('2026-09-30T10:10:00.000Z'),
  });
  const settled=[];
  const syncResult={
    online:true,
    attempted:1,
    remaining:0,
    deferred:0,
    results:[{
      ok:true,
      kind:'ack',
      command:{operationId:'execution-1'},
      response:{executionRevision:9},
    }],
  };
  const context={execution:value,session,sessionRevision:7};
  const coordinator=createExecutionRecoveryCoordinator({
    store,
    commandBus:{
      flushPending:async()=>syncResult,
      recoverExecutionCompletion:async(id)=>({operation:{operationId:id,status:'ack',errorCode:null},patch}),
      settleExecutionCompletion:async(id)=>{settled.push(id);return true;},
    },
    isOnline:()=>true,
    getActiveContext:()=>context,
  });

  const returned=await coordinator.synchronize();

  assert.strictEqual(returned,syncResult);
  assert.equal(value.status,'completed');
  assert.equal(value.syncStatus,'clean');
  assert.deepEqual(value.pendingOperationIds,[]);
  assert.equal(value.revision,9);
  assert.equal(value.feedback.sessionRpe,8);
  assert.deepEqual(settled,['execution-1']);
  assert.deepEqual(await store.list({includeSettled:true}),[]);
});

test('recovery list repairs a crash window with a clean completed snapshot plus an uncollected durable ACK',async()=>{
  const {session,value,patch}=durableCompletionFixture();
  Object.assign(value,patch,{syncStatus:'clean',pendingOperationIds:[],lastSyncError:null});
  const store=createMemoryExecutionRecoveryStore({
    ownerId:'coach-a',
    now:()=>new Date('2026-09-30T10:10:00.000Z'),
  });
  await store.save({execution:value,session,sessionRevision:7,dirty:false});
  const settled=[];
  const coordinator=createExecutionRecoveryCoordinator({
    store,
    commandBus:{
      recoverExecutionCompletion:async(id)=>({operation:{operationId:id,status:'ack',errorCode:null},patch}),
      settleExecutionCompletion:async(id)=>{settled.push(id);return true;},
    },
  });

  const visible=await coordinator.list();

  assert.deepEqual(visible,[]);
  assert.deepEqual(settled,['execution-1']);
  assert.deepEqual(await store.list({includeSettled:true}),[]);
});

test('offline synchronize preserves prior coordinator contract and performs no reconciliation',async()=>{
  const value=execution();
  const before=structuredClone(value);
  let flushCalls=0;
  const coordinator=createExecutionRecoveryCoordinator({
    store:{save:async()=>{},load:async()=>null,list:async()=>[],remove:async()=>{}},
    commandBus:{flushPending:async()=>{flushCalls+=1;return {online:true,attempted:1,results:[]};}},
    isOnline:()=>false,
    getActiveContext:()=>({execution:value,session:{id:'session-1',clientId:'client-1'}}),
  });
  const result=await coordinator.synchronize();
  assert.deepEqual(result,{online:false,attempted:0,results:[]});
  assert.equal(flushCalls,0);
  assert.deepEqual(value,before);
});

test('application performs explicit silent post-login recovery reconciliation and preserves future connectivity wiring',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  const start=source.indexOf('async function setupAuthenticated()');
  const end=source.indexOf('function guardSessionNavigation',start);
  assert.ok(start>=0&&end>start);
  const setup=source.slice(start,end);

  assert.ok(setup.includes('getActiveContext:()=>sessionUi'));
  assert.ok(setup.includes("onReconcileError:(error)=>reportDiagnostic('session-recovery-reconcile',error)"));
  assert.ok(setup.includes('connectivityStop=sync.start({emitInitial:false,reconcileInitial:true});'));
  assert.doesNotMatch(setup,/await sync\.sync\(\)/u);
  assert.doesNotMatch(setup,/commandBus\?\.pending/u);
  assert.match(
    setup,
    /onResult:async\(\)=>\{\s*await refreshVerificationState\(\{repository:operationRepository,store\}\);\s*render\(\);\s*\},/u,
  );
});
