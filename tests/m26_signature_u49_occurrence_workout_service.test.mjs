import test from 'node:test';
import assert from 'node:assert/strict';
import {createOccurrenceWorkoutService} from '../src/m26/workflows/occurrence-workout-service.js';
const checkpoint=()=>{
  let entry=null,etag=0;
  return {capability:'encrypted-owner-bound-cas',
    readCheckpoint:async()=>entry?structuredClone(entry):null,
    writeCheckpoint:async(_scope,snapshot,expectedEtag)=>{
      if((entry?.etag??null)!==(expectedEtag??null))
        throw new Error('CHECKPOINT_CAS_CONFLICT');
      entry={snapshot:structuredClone(snapshot),etag:'test-etag-'+(++etag)};
      return entry.etag;
    },
    clearCheckpoint:async(_scope,expected)=>{
      if(entry?.etag!==expected)throw new Error('CHECKPOINT_CAS_CONFLICT');
      entry=null;
    },
  };
};
const CLIENT='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const OCC='10000000-0000-4000-8000-000000000105';
const EXEC='10000000-0000-4000-8000-000000000107';
const OPS=[
 '10000000-0000-4000-8000-000000000109',
 '10000000-0000-4000-8000-000000000110',
 '10000000-0000-4000-8000-000000000111',
];
const block={id:'base',type:'exercise',exerciseId:'squat',sets:1,reps:'8'};
const snapshot={clientId:CLIENT,sessionId:SESSION,
 blocks:[block],queue:[{blockId:'base',exerciseId:'squat',sets:1,
   prescription:{reps:'8'}}]};
const record=()=>({id:OCC,clientId:CLIENT,sessionId:SESSION,
 localDate:'2026-10-27',timeZone:'America/Santiago',revision:1,
 status:'confirmada',executionId:null});
const setup=({offlineOnce=false,otherClient=false}={})=>{
 let sequence=[EXEC,...OPS],sent=[],uncertain=null,networkDown=offlineOnce;
 let occurrence=record(),executionBody=null;
 const receipt=cmd=>({
   kind:'ack',operationId:cmd.operationId,entityId:OCC,
   executionId:EXEC,remoteRevision:cmd.type==='OCURRENCIA_INICIAR'?2:
     cmd.type==='OCURRENCIA_COMPLETAR'?3:2,
   executionRevision:cmd.type==='OCURRENCIA_INICIAR'?1:
     cmd.type==='OCURRENCIA_GUARDAR_PROGRESO'?2:3,
   status:cmd.type==='OCURRENCIA_COMPLETAR'?'completada':'en_curso',
 });
 const accept=cmd=>{
   const ack=receipt(cmd);
   occurrence={...occurrence,status:ack.status,revision:ack.remoteRevision,
     executionId:EXEC};
   if(cmd.type==='OCURRENCIA_INICIAR')executionBody={
     id:EXEC,clientId:CLIENT,sessionId:SESSION,occurrenceId:OCC,
     status:'en_curso',startedAt:new Date().toISOString(),
     revision:1,sourceSnapshot:structuredClone(snapshot),
     queue:structuredClone(snapshot.queue),results:{},skippedSets:{},events:[],
   };
   if(cmd.type==='OCURRENCIA_GUARDAR_PROGRESO')
     executionBody={...executionBody,revision:2,
       results:structuredClone(cmd.payload.results),
       skippedSets:structuredClone(cmd.payload.skippedSets)};
   return ack;
 };
 const coordinator={
   hasUncertain:async()=>Boolean(uncertain),
   send:async cmd=>{
     sent.push(cmd);
     if(networkDown){networkDown=false;uncertain=cmd;
       throw new Error('network_unknown_after_commit');}
     return accept(cmd);
   },
   retryUncertain:async()=>{
     const cmd=uncertain;
     if(!cmd)throw new Error('NO_PENDING_COMMAND');
     uncertain=null;return accept(cmd);
   },
 };
 const cp=checkpoint();
 const service=createOccurrenceWorkoutService({
   enabled:true,coordinator,checkpoint:cp,createId:()=>sequence.shift(),
   readPrivateOccurrence:async()=>({
     occurrence:{...occurrence,clientId:otherClient?EXEC:CLIENT},
     prescriptionSnapshot:structuredClone(snapshot),
     executionBody:structuredClone(executionBody),
   }),
 });
 return {service,sent,coordinator,checkpoint:cp};
};
test('U49 stays dormant without explicit certified access',async()=>{
 let called=0;
 const c={hasUncertain:async()=>{called++;return false;},
   send:async()=>{called++;},retryUncertain:async()=>{called++;}};
 const disabled=createOccurrenceWorkoutService({
   coordinator:c,readPrivateOccurrence:async()=>{called++;},
   createId:()=>EXEC,
 });
 await assert.rejects(disabled.open({clientId:CLIENT,occurrenceId:OCC}),
   /U49_API_NOT_ENABLED/);
 assert.equal(called,0);
});
test('U49 authentic owner workflow starts, records, saves and completes exactly one date',async()=>{
 const {service,sent}=setup();
 await service.open({clientId:CLIENT,occurrenceId:OCC});
 assert.equal(service.view().phase,'ready');
 await service.start();
 assert.equal(service.view().phase,'active');
 await service.record({reps:8,rpe:7,rir:3,load:20});
 await service.save();
 assert.equal(service.view().executionRevision,2);
 assert.equal(service.view().occurrenceRevision,2);
 await service.advance();
 await service.finish({sessionRpe:7,comment:'Sesión completada con técnica',pain:false});
 await service.complete();
 assert.equal(service.view().phase,'completed');
 assert.equal(service.view().occurrenceRevision,3);
 assert.deepEqual(sent.map(x=>x.type),[
  'OCURRENCIA_INICIAR','OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR']);
 assert.equal(sent.every(x=>x.entityId===OCC&&x.clientId===CLIENT),true);
 assert.equal(sent.some(x=>x.type==='SESION_INICIAR'||x.entityId===SESSION),false);
});
test('U49 unknown network result blocks new commands and recovers SAME ID',async()=>{
 const {service,sent}=setup({offlineOnce:true});
 await service.open({clientId:CLIENT,occurrenceId:OCC});
 await assert.rejects(service.start(),/network_unknown_after_commit/);
 assert.equal(service.view().phase,'pending-recovery');
 await assert.rejects(service.start(),/U49_RECOVERY_REQUIRED/);
 assert.equal(sent.length,1);
 const restored=await service.reconcile();
 assert.equal(restored.phase,'active');
 assert.equal(restored.executionRevision,1);
 assert.equal(sent.length,1,'only same operation is retried by journal');
});
test('U49 denies a cross-client authoritative read without preparing an execution',async()=>{
 const {service,sent}=setup({otherClient:true});
 await assert.rejects(service.open({clientId:CLIENT,occurrenceId:OCC}),
  /U49_PRIVATE_READ_SCOPE_MISMATCH/);
 assert.equal(service.view().phase,'needs-refresh');
 assert.equal(sent.length,0);
});

test('U49 pre-dispatch rejection never traps the user in nonexistent recovery',async()=>{
 const {service,coordinator}=setup();
 await service.open({clientId:CLIENT,occurrenceId:OCC});
 coordinator.send=async()=>{throw new Error('pre_dispatch_auth_denied');};
 coordinator.hasUncertain=async()=>false;
 await assert.rejects(service.start(),/pre_dispatch_auth_denied/);
 assert.equal(service.view().phase,'needs-refresh');
 await service.open({clientId:CLIENT,occurrenceId:OCC});
 assert.equal(service.view().phase,'ready');
});
test('U49 incorrect ACK requires fresh private read, never a fabricated retry',async()=>{
 const {service,coordinator}=setup();
 await service.open({clientId:CLIENT,occurrenceId:OCC});
 coordinator.send=async cmd=>({
   kind:'ack',operationId:cmd.operationId,entityId:cmd.entityId,
   executionId:CLIENT,remoteRevision:2,executionRevision:1,status:'en_curso',
 });
 coordinator.hasUncertain=async()=>false;
 await assert.rejects(service.start(),/U47_ACK_IDENTITY_MISMATCH/);
 assert.equal(service.view().phase,'needs-refresh');
 await service.open({clientId:CLIENT,occurrenceId:OCC});
 assert.equal(service.view().phase,'ready');
});
test('U49 failed cleanup of a conflict retains pending recovery',async()=>{
 const {service,coordinator}=setup();
 await service.open({clientId:CLIENT,occurrenceId:OCC});
 coordinator.send=async()=>({
   kind:'conflict',reason:'REVISION_MISMATCH',localRecoveryPending:true,
 });
 await service.start();
 assert.equal(service.view().phase,'pending-recovery');
 await assert.rejects(service.start(),/U49_RECOVERY_REQUIRED/);
});

test('U49 a remotely completed workout after unknown ACK opens read-only, never restarts',async()=>{
 const executor={id:EXEC,clientId:CLIENT,sessionId:SESSION,occurrenceId:OCC,
   status:'completada',revision:3,results:{},skippedSets:{},
   sourceSnapshot:structuredClone(snapshot),queue:structuredClone(snapshot.queue)};
 let attempts=0;
 const s=createOccurrenceWorkoutService({
   enabled:true,checkpoint:checkpoint(),
   coordinator:{hasUncertain:async()=>false,retryUncertain:async()=>{},
     send:async()=>{attempts++;throw new Error('NEVER_RESTART');}},
   createId:()=>OPS[0],
   readPrivateOccurrence:async()=>({
     occurrence:{...record(),status:'completada',revision:3,executionId:EXEC},
     prescriptionSnapshot:structuredClone(snapshot),
     executionBody:structuredClone(executor),
   }),
 });
 const view=await s.open({clientId:CLIENT,occurrenceId:OCC});
 assert.equal(view.phase,'completed');
 assert.equal(view.executionRevision,3);
 assert.equal(view.currentStep,null);
 await assert.rejects(s.start(),/U49_TERMINAL_READ_ONLY/);
 await assert.rejects(s.save(),/U49_TERMINAL_READ_ONLY/);
 assert.equal(attempts,0);
});
test('U49 forged completion with foreign execution fails closed',async()=>{
 const s=createOccurrenceWorkoutService({
   enabled:true,checkpoint:checkpoint(),
   coordinator:{hasUncertain:async()=>false,retryUncertain:async()=>{},
     send:async()=>{}},
   createId:()=>OPS[0],
   readPrivateOccurrence:async()=>({
     occurrence:{...record(),status:'completada',revision:3,executionId:EXEC},
     prescriptionSnapshot:structuredClone(snapshot),
     executionBody:{id:EXEC,clientId:EXEC,sessionId:SESSION,
       occurrenceId:OCC,status:'completada',revision:3},
   }),
 });
 await assert.rejects(s.open({clientId:CLIENT,occurrenceId:OCC}),
   /U49_COMPLETION_RECEIPT_SCOPE_MISMATCH/);
 assert.equal(s.view().phase,'needs-refresh');
});
test('U49 cancelled occurrence is read-only without fabricating an execution',async()=>{
 const s=createOccurrenceWorkoutService({
   enabled:true,checkpoint:checkpoint(),
   coordinator:{hasUncertain:async()=>false,retryUncertain:async()=>{},
     send:async()=>{throw new Error('NEVER_CALL');}},
   createId:()=>OPS[0],
   readPrivateOccurrence:async()=>({
     occurrence:{...record(),status:'cancelada',revision:2},
     prescriptionSnapshot:structuredClone(snapshot),
   }),
 });
 const view=await s.open({clientId:CLIENT,occurrenceId:OCC});
 assert.equal(view.phase,'cancelled');
 await assert.rejects(s.start(),/U49_TERMINAL_READ_ONLY/);
});

// U51: every mutation MUST survive encrypted storage, and switching must not
// silently drop a client's last unsynchronized set.
test('U51 interrupted workout restores unsaved set under the same occurrence',async()=>{
 const {service,coordinator,checkpoint:cp,sent}=setup();
 await service.open({clientId:CLIENT,occurrenceId:OCC});
 await service.start();
 await service.record({reps:8,rpe:7,rir:3,load:20});
 assert.equal(service.view().unsavedWork,true);
 await assert.rejects(service.open({clientId:CLIENT,occurrenceId:OCC}),
   /U49_UNSAVED_WORKOUT_BLOCKED/);
 const restored=createOccurrenceWorkoutService({
   enabled:true,coordinator,checkpoint:cp,createId:()=>OPS[1],
   readPrivateOccurrence:async()=>({
     occurrence:{...record(),status:'en_curso',revision:2,executionId:EXEC},
     prescriptionSnapshot:structuredClone(snapshot),
     executionBody:{
       id:EXEC,clientId:CLIENT,sessionId:SESSION,occurrenceId:OCC,
       status:'en_curso',startedAt:new Date().toISOString(),revision:1,
       sourceSnapshot:structuredClone(snapshot),queue:structuredClone(snapshot.queue),
       results:{},skippedSets:{},events:[],
     },
   }),
 });
 const view=await restored.open({clientId:CLIENT,occurrenceId:OCC});
 assert.equal(view.phase,'active');
 assert.equal(view.unsavedWork,true);
 await restored.save();
 assert.equal(restored.view().unsavedWork,false);
 assert.equal(sent.length,2,'only start and one occurrence progress command');
 const saved=sent[1];
 assert.equal(saved.type,'OCURRENCIA_GUARDAR_PROGRESO');
 assert.equal(Object.values(saved.payload.results)[0].reps,8);
 assert.equal(await cp.readCheckpoint({clientId:CLIENT,occurrenceId:OCC}),null);
});
test('U51 ciphertext write rejection never reports a recorded set as saved',async()=>{
 const {service,checkpoint:cp}=setup();
 await service.open({clientId:CLIENT,occurrenceId:OCC});
 await service.start();
 cp.writeCheckpoint=async()=>{throw new Error('indexeddb_quota_denied');};
 await assert.rejects(service.record({reps:8,rpe:7,rir:3,load:20}),
   /indexeddb_quota_denied/);
 assert.equal(service.view().phase,'needs-refresh');
 assert.equal(service.view().unsavedWork,false);
});
