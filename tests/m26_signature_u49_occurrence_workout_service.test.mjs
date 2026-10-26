import test from 'node:test';
import assert from 'node:assert/strict';
import {createOccurrenceWorkoutService} from '../src/m26/workflows/occurrence-workout-service.js';
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
 const service=createOccurrenceWorkoutService({
   enabled:true,coordinator,createId:()=>sequence.shift(),
   readPrivateOccurrence:async()=>({
     occurrence:{...occurrence,clientId:otherClient?EXEC:CLIENT},
     prescriptionSnapshot:structuredClone(snapshot),
     executionBody:structuredClone(executionBody),
   }),
 });
 return {service,sent,coordinator};
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
 service.record({reps:8,rpe:7,rir:3,load:20});
 await service.save();
 assert.equal(service.view().executionRevision,2);
 assert.equal(service.view().occurrenceRevision,2);
 service.advance();
 service.finish({sessionRpe:7,comment:'Sesión completada con técnica',pain:false});
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
