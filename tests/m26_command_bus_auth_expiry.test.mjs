import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCommandBus,
  createMemoryKeyValueStore,
  createKeyValueOperationRepository,
} from '../src/m26/index.js';

const baseCommand={
  type:'EJECUCION_GUARDAR_PROGRESO',
  entityType:'session_execution',
  entityId:'execution-401',
  clientId:'client-401',
  baseRevision:0,
  conflictSensitive:true,
  payload:{progressSnapshot:{id:'execution-401'}},
};

function httpError(status,message=`HTTP_${status}`){
  const error=new Error(message);
  error.status=status;
  return error;
}

test('401 during flush preserves the exact queued operation without consuming retry budget and stops the batch',async()=>{
  const storage=createMemoryKeyValueStore();
  const repository=createKeyValueOperationRepository({storage,ownerId:'coach-a'});
  const calls=[];
  const bus=createCommandBus({
    repository,
    getToken:async()=> 'expired-token',
    transport:{
      preflight:async()=>({}),
      execute:async(_token,command)=>{
        calls.push(command.operationId);
        throw httpError(401);
      },
    },
  });

  await bus.enqueue({...baseCommand,operationId:'op-auth-1'});
  await bus.enqueue({...baseCommand,operationId:'op-auth-2',entityId:'execution-402',payload:{progressSnapshot:{id:'execution-402'}}});

  const result=await bus.flushPending();
  const records=await repository.list();
  const first=records.find((item)=>item.operationId==='op-auth-1');
  const second=records.find((item)=>item.operationId==='op-auth-2');

  assert.equal(result.attempted,1,'auth expiry must stop the current flush batch');
  assert.deepEqual(calls,['op-auth-1']);
  assert.equal(first.status,'pending');
  assert.equal(first.retryable,true);
  assert.equal(first.attempts,0,'401 must not consume retry budget');
  assert.equal(first.nextRetryAt,null,'reauth retry must be immediately eligible');
  assert.equal(first.errorCode,'M26_AUTH_REQUIRED');
  assert.equal(first.operationId,'op-auth-1');
  assert.equal(first.entityId,'execution-401');
  assert.deepEqual(first.payload,baseCommand.payload,'payload must survive auth expiry unchanged');
  assert.equal(second.status,'pending','later queued work must remain untouched');
  assert.equal(second.attempts,0);
});

test('post-login flush replays the same operation id exactly once and clears it on ack',async()=>{
  const storage=createMemoryKeyValueStore();
  const repository=createKeyValueOperationRepository({storage,ownerId:'coach-a'});
  let token='expired-token';
  const calls=[];
  const bus=createCommandBus({
    repository,
    getToken:async()=> token,
    transport:{
      preflight:async()=>({}),
      execute:async(currentToken,command)=>{
        calls.push({token:currentToken,operationId:command.operationId});
        if(currentToken==='expired-token')throw httpError(401);
        return {kind:'ack',operationId:command.operationId,remoteRevision:1};
      },
    },
  });

  await bus.enqueue({...baseCommand,operationId:'op-auth-replay'});
  await bus.flushPending();
  token='fresh-token';
  const recovered=await bus.flushPending();

  assert.equal(recovered.attempted,1);
  assert.deepEqual(calls.map((item)=>item.operationId),['op-auth-replay','op-auth-replay']);
  assert.equal(calls[1].token,'fresh-token');
  assert.equal((await repository.list()).length,0,'acknowledged replay must leave no duplicate outbox record');
});

test('401 from direct execute remains durable and retryable with zero attempts',async()=>{
  const storage=createMemoryKeyValueStore();
  const repository=createKeyValueOperationRepository({storage,ownerId:'coach-a'});
  const bus=createCommandBus({
    repository,
    getToken:async()=> 'expired-token',
    transport:{preflight:async()=>({}),execute:async()=>{throw httpError(401);}},
  });

  await assert.rejects(()=>bus.execute({...baseCommand,operationId:'op-direct-401'}),(error)=>{
    assert.equal(error.authRequired,true);
    assert.equal(error.operation.status,'pending');
    assert.equal(error.operation.attempts,0);
    assert.equal(error.operation.errorCode,'M26_AUTH_REQUIRED');
    return true;
  });
  const [record]=await repository.list();
  assert.equal(record.operationId,'op-direct-401');
  assert.equal(record.retryable,true);
});

test('403 remains terminal and consumes one attempt',async()=>{
  const storage=createMemoryKeyValueStore();
  const repository=createKeyValueOperationRepository({storage,ownerId:'coach-a'});
  const bus=createCommandBus({
    repository,
    getToken:async()=> 'valid-token',
    transport:{preflight:async()=>({}),execute:async()=>{throw httpError(403,'FORBIDDEN');}},
  });

  await assert.rejects(()=>bus.execute({...baseCommand,operationId:'op-403'}));
  const [record]=await repository.list();
  assert.equal(record.status,'rejected');
  assert.equal(record.retryable,false);
  assert.equal(record.attempts,1);
  assert.equal(record.nextRetryAt,null);
});

test('409 transport error remains terminal while 5xx remains backoff-retryable',async()=>{
  for(const scenario of [
    {status:409,operationId:'op-409',expectedStatus:'rejected',retryable:false,hasRetryAt:false},
    {status:503,operationId:'op-503',expectedStatus:'pending',retryable:true,hasRetryAt:true},
  ]){
    const storage=createMemoryKeyValueStore();
    const repository=createKeyValueOperationRepository({storage,ownerId:'coach-a'});
    const bus=createCommandBus({
      repository,
      getToken:async()=> 'valid-token',
      transport:{preflight:async()=>({}),execute:async()=>{throw httpError(scenario.status);}},
      now:()=>Date.parse('2026-09-30T12:00:00Z'),
    });
    await assert.rejects(()=>bus.execute({...baseCommand,operationId:scenario.operationId}));
    const [record]=await repository.list();
    assert.equal(record.status,scenario.expectedStatus);
    assert.equal(record.retryable,scenario.retryable);
    assert.equal(record.attempts,1);
    assert.equal(Boolean(record.nextRetryAt),scenario.hasRetryAt);
  }
});

test('auth-expired outbox remains isolated by authenticated owner',async()=>{
  const storage=createMemoryKeyValueStore();
  const ownerA=createKeyValueOperationRepository({storage,ownerId:'coach-a'});
  const ownerB=createKeyValueOperationRepository({storage,ownerId:'coach-b'});
  const bus=createCommandBus({
    repository:ownerA,
    getToken:async()=> 'expired-token',
    transport:{preflight:async()=>({}),execute:async()=>{throw httpError(401);}},
  });

  await bus.enqueue({...baseCommand,operationId:'op-owner-auth'});
  await bus.flushPending();

  assert.equal((await ownerA.list()).length,1);
  assert.equal((await ownerB.list()).length,0,'another authenticated owner must never inherit the queued command');
});
