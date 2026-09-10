import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {hasRetryablePendingOperations} from '../src/m26/app/application.js';
import {reconcileExecutionSyncResult} from '../src/m26/workflows/session-recovery.js';

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

test('login sync is requested only when retryable pending operations exist',()=>{
  assert.equal(hasRetryablePendingOperations([]),false);
  assert.equal(hasRetryablePendingOperations([{status:'conflict',retryable:false}]),false);
  assert.equal(hasRetryablePendingOperations([{status:'pending',retryable:false}]),false);
  assert.equal(hasRetryablePendingOperations([{status:'pending',retryable:true}]),true);
  assert.equal(hasRetryablePendingOperations([{status:'pending'}]),true);
});

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

test('sync results outside this execution lineage cannot mutate its recovery state',()=>{
  const value=execution();
  const before=structuredClone(value);
  const result=reconcileExecutionSyncResult(value,{
    results:[{ok:true,kind:'ack',command:{operationId:'another-op'},response:{executionRevision:99}}],
  });
  assert.equal(result.changed,false);
  assert.deepEqual(value,before);
});

test('authenticated setup inspects pending queue, starts listener and performs one conditional initial sync',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  const start=source.indexOf("qaStage('rc64-post-login-local-reconciliation-start');");
  const end=source.indexOf('function guardSessionNavigation',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.ok(block.includes('hasRetryablePendingOperations(await commandBus?.pending?.())'));
  assert.ok(block.includes('reconcileExecutionSyncResult(sessionUi.execution,result)'));
  assert.ok(block.includes('await recoveryCoordinator.persist({'));
  assert.ok(block.includes('await recoveryCoordinator.settle(sessionUi.execution)'));
  assert.ok(block.includes('connectivityStop=sync.start({emitInitial:false});'));
  assert.ok(block.includes('if(pendingSyncAtLogin&&navigator.onLine!==false)'));
  assert.ok(block.includes('await sync.sync();'));
});

test('initial pending inspection and connectivity sync remain fail-soft',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  assert.ok(source.includes("catch(error){reportDiagnostic('pending-operation-inspection',error);}"));
  assert.ok(source.includes("onError:(error)=>reportDiagnostic('connectivity-sync',error)"));
});
