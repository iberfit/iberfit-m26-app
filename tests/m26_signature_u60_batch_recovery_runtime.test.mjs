import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoachOccurrenceBatchPublisher} from '../src/m26/workflows/occurrence-coach-batch-publisher.js';
import {createTraining360OccurrenceRuntime} from '../src/m26/workflows/occurrence-runtime.js';
import {buildCoachOccurrenceBatchCommand} from '../src/m26/domain/dated-training-occurrences.js';
const COACH='10000000-0000-4000-8000-000000000101';
const CLIENT='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const OCC='10000000-0000-4000-8000-000000000104';
const OP='10000000-0000-4000-8000-000000000105';
const actor={userId:COACH,role:'coach',accessToken:'mock-auth-token'};
const preview={timeZone:'America/Santiago',count:1,occurrences:[{
 clientId:CLIENT,sessionId:SESSION,prescriptionRevision:2,
 localDate:'2026-11-06',localTime:'10:00',
 startsAt:'2026-11-06T13:00:00.000Z',
 endsAt:'2026-11-06T14:00:00.000Z',
}]};
const args={confirmed:true,operationId:OP,sessionId:SESSION,clientId:CLIENT,
 baseRevision:2,preview};
const ack={kind:'ack',operationId:OP,entityId:SESSION,
 entityType:'training_occurrence_batch',remoteRevision:2,count:1,
 occurrences:[{id:OCC,localDate:'2026-11-06'}]};
function setup({send=async()=>ack,getActor=async()=>actor,enabled=true}={}){
 const entries=new Map(),history=[];
 const journal={capability:'encrypted-owner-bound',
   readPending:async key=>entries.get(key)||null,
   writePending:async(key,value)=>{
     if(entries.has(key))throw Error('PENDING_EXISTS');
     entries.set(key,structuredClone(value));history.push('write');
   },
   clearPending:async(key,op)=>{
     assert.equal(entries.get(key)?.operationId,op);
     entries.delete(key);history.push('clear');
   },
 };
 const transport={occurrenceCommand:async(token,command)=>{
   history.push('remote');
   assert.ok(entries.size===1,'encrypted persistent claim precedes transport');
   assert.equal(token,actor.accessToken);
   return send(token,command);
 }};
 const svc=createCoachOccurrenceBatchPublisher({enabled,
   journal,transport,getAuthContext:getActor});
 return {svc,journal,entries,history};
}
test('U60 batch creates exactly one confirmed Coach operation, persisted before send',async()=>{
 const {svc,entries,history}=setup();
 const result=await svc.publish(args);
 assert.equal(result.kind,'ack');
 assert.equal(result.localRecoveryPending,false);
 assert.deepEqual(history,['write','remote','clear']);
 assert.equal(entries.size,0);
});
test('U60 batch refusal with no confirmation never creates a pending write',async()=>{
 const {svc,history}=setup();
 await assert.rejects(svc.publish({...args,confirmed:false}),
   /U30_PREVIEW_CONFIRMATION_REQUIRED/);
 assert.deepEqual(history,[]);
});
test('U60 batch cannot publish with role other than Coach',async()=>{
 const {svc,history}=setup({getActor:async()=>({...actor,role:'cliente'})});
 await assert.rejects(svc.publish(args),/U60_BATCH_COACH_AUTH_REQUIRED/);
 assert.deepEqual(history,[]);
});
test('U60 batch preserves SAME operationId and encrypted record across a network loss',async()=>{
 let n=0;
 const {svc,entries,history}=setup({send:async(_token,cmd)=>{
   n++;assert.equal(cmd.operationId,OP);
   if(n===1)throw Error('network_reset_after_server_ack_unknown');
   return {...ack,duplicate:true};
 }});
 await assert.rejects(svc.publish(args),/network_reset_after_server_ack_unknown/);
 assert.equal(entries.size,1);
 assert.equal(await svc.hasPending({clientId:CLIENT,sessionId:SESSION}),true);
 await assert.rejects(svc.publish({...args,operationId:
  '10000000-0000-4000-8000-000000000199'}),
 /U60_BATCH_UNCERTAIN_COMMAND_REQUIRES_RECOVERY/);
 const result=await svc.retryPending({clientId:CLIENT,sessionId:SESSION});
 assert.equal(result.kind,'ack');
 assert.equal(result.duplicate,true);
 assert.equal(entries.size,0);
 assert.deepEqual(history,['write','remote','remote','clear']);
});
test('U60 batch rejects foreign or mismatched acknowledgement and keeps recovery',async()=>{
 const {svc,entries}=setup({send:async()=>({...ack,entityId:OCC})});
 await assert.rejects(svc.publish(args),/U60_BATCH_ACK_MISMATCH/);
 assert.equal(entries.size,1);
});
test('U60 definitive U32 conflict clears journal and permits corrected new operation',async()=>{
 const {svc,entries,history}=setup({send:async(_token,cmd)=>({
   kind:'conflict',operationId:cmd.operationId,
   reason:'SOURCE_REVISION_MISMATCH',remoteRevision:3,
 })});
 const outcome=await svc.publish(args);
 assert.equal(outcome.kind,'conflict');
 assert.equal(outcome.localRecoveryPending,false);
 assert.equal(entries.size,0);
 assert.deepEqual(history,['write','remote','clear']);
 assert.equal(await svc.hasPending({clientId:CLIENT,sessionId:SESSION}),false);
 await assert.rejects(svc.retryPending({clientId:CLIENT,sessionId:SESSION}),
   /U60_BATCH_NO_VERIFIED_PENDING_BATCH/);
 const corrected=await svc.publish({...args,baseRevision:3,
   preview:{...preview,occurrences:preview.occurrences.map(row=>({
     ...row,prescriptionRevision:3,
   }))},
   operationId:'10000000-0000-4000-8000-000000000199'});
 assert.equal(corrected.kind,'conflict');
 assert.equal(entries.size,0);
});
test('U60 rejected U32 operation does not permanently lock Coach publishing',async()=>{
 const {svc,history,entries}=setup({send:async()=>({
   kind:'rejected',operationId:OP,reason:'PUBLISHED_CYCLE_REQUIRED',
 })});
 const result=await svc.publish(args);
 assert.equal(result.kind,'rejected');
 assert.equal(result.localRecoveryPending,false);
 assert.equal(entries.size,0);
 assert.deepEqual(history,['write','remote','clear']);
});
test('U60 malformed refusal cannot clear the only durable operation',async()=>{
 const {svc,history,entries}=setup({send:async()=>({
   kind:'conflict',operationId:OP,reason:'',
 })});
 await assert.rejects(svc.publish(args),/U60_BATCH_REJECTION_UNVERIFIED/);
 assert.equal(entries.size,1);
 assert.deepEqual(history,['write','remote']);
});
test('U60 definitive conflict with failed journal deletion remains recoverable',async()=>{
 const entries=new Map(),history=[],key=COACH+'|'+CLIENT+'|'+SESSION;
 const journal={capability:'encrypted-owner-bound',
   readPending:async name=>entries.get(name)||null,
   writePending:async(name,cmd)=>{entries.set(name,structuredClone(cmd));history.push('write');},
   clearPending:async()=>{history.push('clear-attempt');throw Error('IDB_WRITER_LOST');},
 };
 const svc=createCoachOccurrenceBatchPublisher({
   enabled:true,getAuthContext:async()=>actor,journal,
   transport:{occurrenceCommand:async()=>{history.push('remote');return {
     kind:'conflict',operationId:OP,reason:'SOURCE_REVISION_MISMATCH',
   };}},
 });
 const result=await svc.publish(args);
 assert.equal(result.localRecoveryPending,true);
 assert.equal(await svc.hasPending({clientId:CLIENT,sessionId:SESSION}),true);
 assert.ok(entries.has(key));
 assert.deepEqual(history,['write','remote','clear-attempt']);
});
test('U60 batch guards actor switch before reporting remote success',async()=>{
 let n=0;
 const {svc,entries}=setup({getActor:async()=>{
   n++;return n===1?actor:{...actor,userId:CLIENT};
 }});
 await assert.rejects(svc.publish(args),/U60_BATCH_ACTOR_CHANGED/);
 assert.equal(entries.size,1);
});
test('U60 batch publisher disabled mode makes zero network requests',async()=>{
 const {svc,history}=setup({enabled:false});
 await assert.rejects(svc.publish(args),/U60_BATCH_NOT_ENABLED/);
 assert.deepEqual(history,[]);
});
test('U60 batch command is scoped to one session and immutable confirmed dates',()=>{
 const cmd=buildCoachOccurrenceBatchCommand(args);
 assert.equal(cmd.type,'OCURRENCIAS_CREAR_LOTE');
 assert.equal(cmd.entityId,SESSION);
 assert.equal(cmd.clientId,CLIENT);
 assert.equal(cmd.payload.dates[0].localDate,'2026-11-06');
 assert.throws(()=>buildCoachOccurrenceBatchCommand({
   ...args,preview:{...preview,count:2},
 }),/U30_PREVIEW_INVALID/);
});
test('U60 full runtime is off unless explicitly supplied backend and crypto capability',async()=>{
 const service=createTraining360OccurrenceRuntime();
 assert.equal(service.enabled,false);
 assert.throws(()=>service.previewDates(args),/U60_RUNTIME_NOT_ENABLED/);
 await assert.rejects(service.calendar({clientId:CLIENT}),
   /U60_RUNTIME_NOT_ENABLED/);
 await assert.rejects(service.openWorkout({clientId:CLIENT,occurrenceId:OCC}),
   /U60_RUNTIME_NOT_ENABLED/);
 assert.throws(()=>createTraining360OccurrenceRuntime({enabled:true}),
   /U60_RUNTIME_DEPENDENCIES_REQUIRED/);
});
