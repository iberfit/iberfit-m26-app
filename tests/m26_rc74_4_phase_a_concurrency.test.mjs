import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCommand,createCommandBus,createMemoryOperationRepository
} from '../src/m26/command-bus.js';
import {
  M26_COMMAND_REGISTRY,M26_EXTENDED_COMMAND_REGISTRY,validateCommandCatalog,validateCommandAgainstRegistry
} from '../src/m26/command-catalog.js';

const PROGRESS_CONFLICT_REGISTRY=Object.freeze(M26_COMMAND_REGISTRY.map((row)=>row.type==='EJECUCION_GUARDAR_PROGRESO'?Object.freeze({...row,conflictSensitive:true}):row));

const progress=(operationId,entityId='exec-a',baseRevision=0)=>({
  operationId,type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',
  entityId,clientId:'client-a',baseRevision,conflictSensitive:true,
  payload:{progressSnapshot:{id:entityId,items:[{id:operationId}]}}
});
const start=(operationId,executionId='exec-a',baseRevision=7)=>({
  operationId,type:'SESION_INICIAR',entityType:'session',entityId:'session-a',clientId:'client-a',
  baseRevision,conflictSensitive:true,payload:{executionId,appointmentId:'appointment-a'}
});
function busWith(execute,{repository=createMemoryOperationRepository(),now=()=>Date.parse('2026-08-25T01:00:00Z')}={}){
  return {repository,bus:createCommandBus({repository,getToken:async()=> 'token',now,registry:PROGRESS_CONFLICT_REGISTRY,transport:{preflight:async()=>({kind:'ack'}),execute}})};
}

test('Phase A keeps live progress policy false while rebasing capability accepts the future true contract',()=>{
  const liveRow=M26_COMMAND_REGISTRY.find(x=>x.type==='EJECUCION_GUARDAR_PROGRESO');
  assert.equal(liveRow.conflictSensitive,false);
  const futureRow=PROGRESS_CONFLICT_REGISTRY.find(x=>x.type==='EJECUCION_GUARDAR_PROGRESO');
  assert.equal(futureRow.conflictSensitive,true);
  assert.equal(createCommand({...progress('op-policy'),conflictSensitive:false},{registry:PROGRESS_CONFLICT_REGISTRY}).conflictSensitive,true);
});

test('individual command validation treats conflict policy as server/catalog authority, not a required caller field',()=>{
  const base={type:'SESION_INICIAR',entityType:'session',reason:'',previewAccepted:false,payload:{}};
  assert.equal(validateCommandAgainstRegistry(base,'coach').ok,true);
  const wrong={...base,conflictSensitive:false};
  assert.deepEqual(validateCommandAgainstRegistry(wrong,'coach').errors,['CONFLICT_POLICY_MISMATCH']);
});

test('strict remote catalog compares snapshot/conflict/bootstrap semantics',()=>{
  const installed=M26_COMMAND_REGISTRY.map(x=>({
    command_type:x.type,entity_type:x.entityType,event_name:x.eventName,allowed_roles:[...x.allowedRoles],
    requires_reason:x.requiresReason,requires_preview:x.requiresPreview,snapshot_on_apply:x.snapshotOnApply,
    conflict_sensitive:x.conflictSensitive,bootstrap_allowed:x.bootstrapAllowed,enabled:x.enabled,
  }));
  const good=validateCommandCatalog(installed,M26_COMMAND_REGISTRY,{strict:true});
  assert.equal(good.ok,true);
  const drift=structuredClone(installed);
  drift.find(x=>x.command_type==='EJECUCION_GUARDAR_PROGRESO').conflict_sensitive=true;
  const bad=validateCommandCatalog(drift,M26_COMMAND_REGISTRY,{strict:true});
  assert.equal(bad.ok,false);
  assert.ok(bad.mismatches.some(x=>x.type==='EJECUCION_GUARDAR_PROGRESO'&&x.field==='conflictSensitive'));
  const incomplete=installed.map(({snapshot_on_apply,conflict_sensitive,bootstrap_allowed,...x})=>x);
  const missing=validateCommandCatalog(incomplete,M26_COMMAND_REGISTRY,{strict:true});
  assert.equal(missing.ok,false);
  assert.ok(missing.incomplete.some(x=>x.field==='conflictSensitive'));
});

test('extension commands that are intentionally non-conflict remain valid',()=>{
  const command=createCommand({
    operationId:'checkin-op',type:'CHECKIN_REGISTRAR',entityType:'checkin',entityId:'checkin-a',clientId:'client-a',
    baseRevision:0,conflictSensitive:false,payload:{patch:{energy:7}}
  },{registry:M26_EXTENDED_COMMAND_REGISTRY,role:'cliente'});
  assert.equal(command.conflictSensitive,false);
});

test('two offline progress snapshots rebase sequentially without changing operationId',async()=>{
  const seen=[];
  const {bus}=busWith(async(_token,command)=>{
    seen.push({id:command.operationId,base:command.baseRevision});
    return {kind:'ack',operationId:command.operationId,remoteRevision:command.baseRevision+1};
  });
  await bus.enqueue(progress('op-a'));
  await bus.enqueue(progress('op-b'));
  const result=await bus.flushPending();
  assert.equal(result.attempted,2);
  assert.deepEqual(seen,[{id:'op-a',base:0},{id:'op-b',base:1}]);
  assert.equal((await bus.pending()).length,0);
});

test('offline SESION_INICIAR seeds execution queue from receipt executionRevision, not session remoteRevision',async()=>{
  const seen=[];
  const {bus}=busWith(async(_token,command)=>{
    seen.push({type:command.type,base:command.baseRevision});
    if(command.type==='SESION_INICIAR')return {
      kind:'ack',operationId:command.operationId,remoteRevision:8,
      receipt:{response:{executionId:'exec-a',executionRevision:1,appointmentId:'appointment-a'}}
    };
    return {kind:'ack',operationId:command.operationId,remoteRevision:command.baseRevision+1};
  });
  await bus.enqueue(start('op-start'));
  await bus.enqueue(progress('op-progress','exec-a',0));
  const result=await bus.flushPending();
  assert.equal(result.attempted,2);
  assert.deepEqual(seen,[{type:'SESION_INICIAR',base:7},{type:'EJECUCION_GUARDAR_PROGRESO',base:1}]);
});

test('an operation already attempted is never rebased',async()=>{
  const seen=[];
  const {repository,bus}=busWith(async(_token,command)=>{
    seen.push({id:command.operationId,base:command.baseRevision});
    if(command.operationId==='op-first')return {kind:'ack',operationId:command.operationId,remoteRevision:1};
    return {kind:'conflict',operationId:command.operationId,remoteRevision:2,reason:'REVISION_MISMATCH'};
  });
  await bus.enqueue(progress('op-first'));
  await repository.put({
    ...progress('op-attempted'),status:'pending',retryable:true,queuedOffline:true,attempts:1,nextRetryAt:null,
    createdAt:'2026-08-25T01:00:01.000Z',updatedAt:'2026-08-25T01:00:01.000Z',queueOrder:2
  });
  const result=await bus.flushPending();
  assert.equal(result.attempted,2);
  assert.deepEqual(seen,[{id:'op-first',base:0},{id:'op-attempted',base:0}]);
  assert.equal(result.results[1].kind,'conflict');
});

test('a deferred predecessor prevents same-execution leapfrogging',async()=>{
  const repository=createMemoryOperationRepository(),seen=[];
  await repository.put({...progress('op-deferred'),status:'pending',retryable:true,queuedOffline:true,attempts:1,nextRetryAt:'2026-08-25T01:05:00Z',createdAt:'2026-08-25T01:00:00Z',updatedAt:'2026-08-25T01:00:00Z',queueOrder:1});
  await repository.put({...progress('op-later'),status:'pending',retryable:true,queuedOffline:true,attempts:0,nextRetryAt:null,createdAt:'2026-08-25T01:00:01Z',updatedAt:'2026-08-25T01:00:01Z',queueOrder:2});
  const {bus}=busWith(async(_token,command)=>{seen.push(command.operationId);return {kind:'ack',operationId:command.operationId,remoteRevision:1};},{repository});
  const result=await bus.flushPending();
  assert.equal(result.attempted,0);
  assert.equal(result.deferred,1);
  assert.equal(result.blocked,1);
  assert.deepEqual(seen,[]);
});

test('external write after first ACK still produces server conflict on rebased successor',async()=>{
  let remoteRevision=0;const seen=[];
  const {bus}=busWith(async(_token,command)=>{
    seen.push({id:command.operationId,base:command.baseRevision,remoteRevision});
    if(command.operationId==='op-first'){
      remoteRevision=1;
      queueMicrotask(()=>{remoteRevision=2;});
      return {kind:'ack',operationId:command.operationId,remoteRevision:1};
    }
    if(command.baseRevision!==remoteRevision)return {kind:'conflict',operationId:command.operationId,remoteRevision,reason:'REVISION_MISMATCH'};
    remoteRevision+=1;return {kind:'ack',operationId:command.operationId,remoteRevision};
  });
  await bus.enqueue(progress('op-first'));
  await bus.enqueue(progress('op-second'));
  await new Promise(resolve=>setImmediate(resolve));
  const result=await bus.flushPending();
  assert.equal(result.attempted,2);
  assert.equal(result.results[1].kind,'conflict');
  assert.equal(seen[1].base,1);
  assert.equal(seen[1].remoteRevision,2);
});

test('a persisted conflict blocks subsequent commands in the same execution across later flushes',async()=>{
  const seen=[];
  const {bus}=busWith(async(_token,command)=>{
    seen.push(command.operationId);
    if(command.operationId==='op-conflict')return {kind:'conflict',operationId:command.operationId,remoteRevision:4,reason:'REVISION_MISMATCH'};
    return {kind:'ack',operationId:command.operationId,remoteRevision:5};
  });
  await bus.enqueue(progress('op-conflict'));
  await bus.enqueue(progress('op-behind'));
  const first=await bus.flushPending();
  assert.equal(first.attempted,1);
  assert.equal(first.results[0].kind,'conflict');
  const second=await bus.flushPending();
  assert.equal(second.attempted,0);
  assert.equal(second.blocked,1);
  assert.deepEqual(seen,['op-conflict']);
});

test('blocked lineage does not stall unrelated execution',async()=>{
  const repository=createMemoryOperationRepository(),seen=[];
  await repository.put({...progress('a-deferred','exec-a'),status:'pending',retryable:true,queuedOffline:true,attempts:1,nextRetryAt:'2026-08-25T01:05:00Z',createdAt:'2026-08-25T01:00:00Z',updatedAt:'2026-08-25T01:00:00Z',queueOrder:1});
  await repository.put({...progress('a-later','exec-a'),status:'pending',retryable:true,queuedOffline:true,attempts:0,nextRetryAt:null,createdAt:'2026-08-25T01:00:01Z',updatedAt:'2026-08-25T01:00:01Z',queueOrder:2});
  await repository.put({...progress('b-ready','exec-b'),status:'pending',retryable:true,queuedOffline:true,attempts:0,nextRetryAt:null,createdAt:'2026-08-25T01:00:02Z',updatedAt:'2026-08-25T01:00:02Z',queueOrder:3});
  const {bus}=busWith(async(_token,command)=>{seen.push(command.operationId);return {kind:'ack',operationId:command.operationId,remoteRevision:1};},{repository});
  const result=await bus.flushPending();
  assert.equal(result.attempted,1);
  assert.deepEqual(seen,['b-ready']);
  assert.equal(result.blocked,1);
});

test('manual retry cannot leapfrog same-lineage predecessor',async()=>{
  const repository=createMemoryOperationRepository();
  await repository.put({...progress('op-old'),status:'pending',retryable:true,queuedOffline:true,attempts:1,nextRetryAt:'2026-08-25T01:05:00Z',createdAt:'2026-08-25T01:00:00Z',updatedAt:'2026-08-25T01:00:00Z',queueOrder:1});
  await repository.put({...progress('op-new'),status:'pending',retryable:true,queuedOffline:true,attempts:0,nextRetryAt:null,createdAt:'2026-08-25T01:00:01Z',updatedAt:'2026-08-25T01:00:01Z',queueOrder:2});
  const {bus}=busWith(async()=>({kind:'ack',remoteRevision:1}),{repository});
  await assert.rejects(()=>bus.retry('op-new'),/M26_OPERATION_BLOCKED_BY_PREDECESSOR/);
});

test('future contract upgrades a never-attempted legacy queued progress operation before send',async()=>{
  const repository=createMemoryOperationRepository(),seen=[];
  await repository.put({
    ...progress('legacy-unattempted','exec-a',0),conflictSensitive:false,
    status:'pending',retryable:true,queuedOffline:true,attempts:0,nextRetryAt:null,
    createdAt:'2026-08-25T01:00:00Z',updatedAt:'2026-08-25T01:00:00Z',queueOrder:1,
  });
  const bus=createCommandBus({
    repository,registry:PROGRESS_CONFLICT_REGISTRY,getToken:async()=> 'token',
    now:()=>Date.parse('2026-08-25T01:00:00Z'),
    transport:{preflight:async()=>({kind:'ack'}),execute:async(_token,command)=>{
      seen.push({conflictSensitive:command.conflictSensitive,baseRevision:command.baseRevision});
      return {kind:'ack',operationId:command.operationId,remoteRevision:1};
    }},
  });
  const result=await bus.flushPending();
  assert.equal(result.attempted,1);
  assert.deepEqual(seen,[{conflictSensitive:true,baseRevision:0}]);
  assert.equal((await repository.list()).length,0);
});

test('future contract never mutates the fingerprint of an already-attempted legacy operation',async()=>{
  const repository=createMemoryOperationRepository();
  await repository.put({
    ...progress('legacy-attempted','exec-a',0),conflictSensitive:false,
    status:'pending',retryable:true,queuedOffline:true,attempts:1,nextRetryAt:null,
    createdAt:'2026-08-25T01:00:00Z',updatedAt:'2026-08-25T01:00:00Z',queueOrder:1,
  });
  let calls=0;
  const bus=createCommandBus({
    repository,registry:PROGRESS_CONFLICT_REGISTRY,getToken:async()=> 'token',
    now:()=>Date.parse('2026-08-25T01:00:00Z'),
    transport:{preflight:async()=>({kind:'ack'}),execute:async()=>{calls+=1;return {kind:'ack',remoteRevision:1};}},
  });
  const result=await bus.flushPending();
  assert.equal(result.attempted,1);
  assert.equal(result.results[0].kind,'conflict');
  assert.match(result.results[0].error,/M26_OPERATION_CONTRACT_STALE/);
  assert.equal(calls,0);
  const [stored]=await repository.list();
  assert.equal(stored.conflictSensitive,false);
  assert.equal(stored.attempts,1);
  assert.equal(stored.status,'conflict');
  assert.equal(stored.retryable,false);
});

test('a server conflict blocks only its execution lineage and lets an independent execution continue',async()=>{
  const seen=[];
  const {bus}=busWith(async(_token,command)=>{
    seen.push(command.operationId);
    if(command.operationId==='a-conflict')return {kind:'conflict',operationId:command.operationId,remoteRevision:4,reason:'REVISION_MISMATCH'};
    return {kind:'ack',operationId:command.operationId,remoteRevision:1};
  });
  await bus.enqueue(progress('a-conflict','exec-a'));
  await bus.enqueue(progress('a-behind','exec-a'));
  await bus.enqueue(progress('b-ready','exec-b'));
  const result=await bus.flushPending();
  assert.equal(result.attempted,2);
  assert.deepEqual(seen,['a-conflict','b-ready']);
  assert.equal(result.results[0].kind,'conflict');
  assert.equal(result.results[1].kind,'ack');
  assert.equal(result.blocked,1);
});

test('an attempted legacy contract is quarantined without changing its fingerprint and does not stall another execution',async()=>{
  const repository=createMemoryOperationRepository(),seen=[];
  await repository.put({
    ...progress('legacy-attempted-a','exec-a',0),conflictSensitive:false,
    status:'pending',retryable:true,queuedOffline:true,attempts:1,nextRetryAt:null,
    createdAt:'2026-08-25T01:00:00Z',updatedAt:'2026-08-25T01:00:00Z',queueOrder:1,
  });
  await repository.put({
    ...progress('b-ready-after-stale','exec-b',0),conflictSensitive:true,
    status:'pending',retryable:true,queuedOffline:true,attempts:0,nextRetryAt:null,
    createdAt:'2026-08-25T01:00:01Z',updatedAt:'2026-08-25T01:00:01Z',queueOrder:2,
  });
  const bus=createCommandBus({
    repository,registry:PROGRESS_CONFLICT_REGISTRY,getToken:async()=> 'token',
    now:()=>Date.parse('2026-08-25T01:00:00Z'),
    transport:{preflight:async()=>({kind:'ack'}),execute:async(_token,command)=>{seen.push(command.operationId);return {kind:'ack',operationId:command.operationId,remoteRevision:1};}},
  });
  const result=await bus.flushPending();
  assert.equal(result.attempted,2);
  assert.equal(result.results[0].kind,'conflict');
  assert.equal(result.results[0].error,'M26_OPERATION_CONTRACT_STALE');
  assert.equal(result.results[1].kind,'ack');
  assert.deepEqual(seen,['b-ready-after-stale']);
  const [stale]=await repository.list();
  assert.equal(stale.operationId,'legacy-attempted-a');
  assert.equal(stale.conflictSensitive,false);
  assert.equal(stale.status,'conflict');
  assert.equal(stale.retryable,false);
  assert.equal(stale.attempts,1);
});
