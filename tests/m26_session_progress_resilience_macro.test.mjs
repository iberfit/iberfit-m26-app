import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createCommandBus,createMemoryOperationRepository} from '../src/m26/command-bus.js';
import {markExecutionSync} from '../src/m26/workflows/session-execution.js';

const progress=(operationId,baseRevision=0)=>({
  operationId,
  type:'EJECUCION_GUARDAR_PROGRESO',
  entityType:'session_execution',
  entityId:'execution-resilience-1',
  clientId:'client-resilience-1',
  baseRevision,
  conflictSensitive:true,
  payload:{progressSnapshot:{id:'execution-resilience-1',operationId}},
});

function deferred(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});return {promise,resolve,reject};}

test('an ACK individual no declara clean mientras queden operaciones pendientes',()=>{
  const execution={syncStatus:'pending',pendingOperationIds:['op-1','op-2'],lastSyncError:'NETWORK'};
  markExecutionSync(execution,'clean',{operationId:'op-1'});
  assert.equal(execution.syncStatus,'pending');
  assert.deepEqual(execution.pendingOperationIds,['op-2']);
  assert.equal(execution.lastSyncError,null);
  markExecutionSync(execution,'clean',{operationId:'op-2'});
  assert.equal(execution.syncStatus,'clean');
  assert.deepEqual(execution.pendingOperationIds,[]);
});

test('un ACK online tardío rebasa el siguiente progreso en cola del mismo execution lineage',async()=>{
  const repository=createMemoryOperationRepository();
  const firstGate=deferred();
  const calls=[];
  const bus=createCommandBus({
    repository,
    getToken:async()=> 'jwt',
    getRole:()=> 'coach',
    rehydrate:async()=>{},
    transport:{
      preflight:async()=>({kind:'ack'}),
      execute:async(_token,command)=>{
        calls.push({operationId:command.operationId,baseRevision:command.baseRevision});
        if(command.operationId==='op-first')return await firstGate.promise;
        return {kind:'ack',remoteRevision:2};
      },
    },
  });

  const first=bus.execute(progress('op-first',0));
  await new Promise(resolve=>setTimeout(resolve,0));
  await bus.enqueue(progress('op-second',0));
  firstGate.resolve({kind:'ack',remoteRevision:1});
  await first;

  const pending=await bus.pending();
  assert.equal(pending.length,1);
  assert.equal(pending[0].operationId,'op-second');
  assert.equal(pending[0].baseRevision,1,'el sucesor debe quedar rebasado al revision ACK del predecesor online');

  const flush=await bus.flushPending();
  assert.equal(flush.attempted,1);
  assert.equal(flush.results[0].ok,true);
  assert.deepEqual(await bus.pending(),[]);
  assert.deepEqual(calls,[
    {operationId:'op-first',baseRevision:0},
    {operationId:'op-second',baseRevision:1},
  ]);
});

test('la implementación del controlador protege las mutaciones normales con timeout de UI y cola posterior',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(source,/progressActionTimeoutMs=4000/u);
  assert.match(source,/M26_SESSION_PROGRESS_TIMEOUT/u);
  assert.match(source,/const hasPending=execution\?\.syncStatus==='pending'\|\|pendingIds\.size>0/u);
  assert.match(source,/if\(!isOnline\(online\)\|\|hasPending\)return \{kind:'queued'/u);
  assert.match(source,/Guardado en este dispositivo\. Puedes continuar la sesión mientras IBERFIT confirma la sincronización\./u);
  assert.match(source,/schedulePendingExecutionSync\(context,1250\)/u);
  assert.match(source,/if\(pendingExecutionSyncTimer\)\{\s*if\(delay>0\)return false;\s*clearTimeout\(pendingExecutionSyncTimer\)/u);
});