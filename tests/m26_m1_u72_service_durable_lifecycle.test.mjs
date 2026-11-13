import test from 'node:test';
import assert from 'node:assert/strict';
import {createExecution} from '../src/m26/workflows/session-execution.js';
import {createOccurrenceWorkoutService} from '../src/m26/workflows/occurrence-workout-service.js';

// No Supabase credentials, actual data or mutable network. Reproduces the
// EXACT private U60 read + CAS ACK contract across two application lifecycles.
const CLIENT='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const OCC='10000000-0000-4000-8000-000000000105';
const EXEC='10000000-0000-4000-8000-000000000107';
const STARTED='2026-11-12T16:00:00Z';
const PAUSED='2026-11-12T16:20:00Z';
const RESUMED='2026-11-12T16:24:00Z';
const block={id:'u72-base',type:'exercise',exerciseId:'squat',sets:2,reps:'8'};
const session={id:SESSION,clientId:CLIENT,blocks:[block]};
const queue=createExecution({session,clientId:CLIENT,executionId:EXEC}).queue;
const prescriptionSnapshot={clientId:CLIENT,sessionId:SESSION,
  blocks:structuredClone(session.blocks),queue:structuredClone(queue)};
function checkpoint(){
 let value=null,revision=0;
 return {capability:'encrypted-owner-bound-cas',
  readCheckpoint:async()=>value?structuredClone(value):null,
  writeCheckpoint:async(_scope,next,etag)=>{
   assert.equal(value?.etag??null,etag??null,'no stale checkpoint update');
   value={snapshot:structuredClone(next),etag:String(++revision)};
   return value.etag;
  },
  clearCheckpoint:async(_scope,etag)=>{
   assert.equal(value?.etag,etag,'no blind checkpoint deletion');
   value=null;
  },
 };
}
function server(){
 let occ={id:OCC,clientId:CLIENT,sessionId:SESSION,
   localDate:'2026-11-12',timeZone:'America/Santiago',
   status:'confirmada',revision:1,executionId:null};
 let executionBody=null,serial=0,blocked=false;
 const operations=[];
 const now=()=>new Date().toISOString();
 return {
  operations,
  interruptNext:()=>{blocked=true;},
  async read(){return {occurrence:structuredClone(occ),
    prescriptionSnapshot:structuredClone(prescriptionSnapshot),
    executionBody:structuredClone(executionBody)};},
  async send(cmd){
   operations.push(structuredClone(cmd));
   if(blocked){blocked=false;throw new Error('U72_SYNTHETIC_NETWORK_UNCERTAIN');}
   assert.equal(cmd.clientId,CLIENT);assert.equal(cmd.entityId,OCC);
   assert.equal(cmd.baseRevision,occ.revision,'independent occurrence CAS');
   const type=cmd.type;
   if(type==='OCURRENCIA_INICIAR'){
     assert.equal(occ.status,'confirmada');
     assert.equal(cmd.payload.executionId,EXEC);
     occ={...occ,status:'en_curso',executionId:EXEC,revision:2};
     executionBody={id:EXEC,clientId:CLIENT,sessionId:SESSION,
      occurrenceId:OCC,status:'en_curso',revision:1,startedAt:STARTED,
      activeSince:STARTED,pausedAt:null,accumulatedActiveMs:null,
      sourceSnapshot:structuredClone(prescriptionSnapshot),
      queue:structuredClone(queue),results:{},skippedSets:{},events:[]};
   }else{
     assert.equal(occ.status,'en_curso');
     assert.equal(cmd.payload.executionId,EXEC);
     assert.equal(cmd.payload.executionBaseRevision,executionBody.revision,
       'independent execution CAS');
     const next=executionBody.revision+1;
     if(type==='OCURRENCIA_GUARDAR_PROGRESO'){
       assert.equal(executionBody.status,'en_curso');
       executionBody={...executionBody,revision:next,
        results:structuredClone(cmd.payload.results),
        skippedSets:structuredClone(cmd.payload.skippedSets)};
     }else if(type==='OCURRENCIA_PAUSAR'){
       assert.equal(executionBody.status,'en_curso');
       assert.deepEqual(Object.keys(cmd.payload),['executionId','executionBaseRevision']);
       executionBody={...executionBody,revision:next,status:'pausada',
        activeSince:null,pausedAt:PAUSED,accumulatedActiveMs:1200000,
        events:[...executionBody.events,{type:'SESSION_PAUSED'}]};
     }else if(type==='OCURRENCIA_REANUDAR'){
       assert.equal(executionBody.status,'pausada');
       assert.deepEqual(Object.keys(cmd.payload),['executionId','executionBaseRevision']);
       executionBody={...executionBody,revision:next,status:'en_curso',
        activeSince:RESUMED,pausedAt:null,
        events:[...executionBody.events,{type:'SESSION_RESUMED'}]};
     }else throw new Error('U72_UNEXPECTED_COMMAND_'+type);
   }
   serial++;
   return {kind:'ack',operationId:cmd.operationId,entityId:OCC,
    executionId:EXEC,remoteRevision:occ.revision,
    executionRevision:executionBody.revision,status:'en_curso',
    ...(type==='OCURRENCIA_PAUSAR'||type==='OCURRENCIA_REANUDAR'
      ?{executionStatus:executionBody.status,
        activeSince:executionBody.activeSince,
        accumulatedActiveMs:executionBody.accumulatedActiveMs,
        serverAt:type==='OCURRENCIA_PAUSAR'?PAUSED:RESUMED}:{}),
    duplicate:false};
  },
  coordinator(){return {hasUncertain:async()=>false,
    send:command=>this.send(command),
    retryUncertain:async()=>{throw Error('U72_NO_UNCERTAIN_COMMAND');}};},
  get revision(){return executionBody?.revision??0;},
 };
}
const scope={clientId:CLIENT,occurrenceId:OCC};
function service(backend,cp,first=true){
 let i=0;
 const ids=first?[EXEC,
   '10000000-0000-4000-8000-000000000120',
   '10000000-0000-4000-8000-000000000121',
   '10000000-0000-4000-8000-000000000122',
   '10000000-0000-4000-8000-000000000125']:
  ['10000000-0000-4000-8000-000000000123',
   '10000000-0000-4000-8000-000000000124'];
 return createOccurrenceWorkoutService({enabled:true,checkpoint:cp,
   coordinator:backend.coordinator(),
   readPrivateOccurrence:()=>backend.read(),
   createId:()=>ids[i++]??(() =>{throw Error('U72_ID_EXHAUSTED');})()});
}
test('U72 encrypted draft auto-saves and survives private paused read across app restart',async()=>{
 const backend=server(),cp=checkpoint(),one=service(backend,cp);
 assert.equal((await one.open(scope)).phase,'ready');
 await one.start();
 await one.record({reps:8,rpe:7,rir:2,load:20});
 await one.advance();
 assert.equal(one.view().unsavedWork,true);
 const paused=await one.pause();
 assert.equal(paused.executionStatus,'paused');
 assert.equal(paused.unsavedWork,false);
 assert.equal(paused.executionRevision,3);
 assert.deepEqual(backend.operations.map(x=>x.type),[
  'OCURRENCIA_INICIAR','OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_PAUSAR']);
 assert.equal(backend.operations[1].payload.executionBaseRevision,1);
 assert.equal(backend.operations[2].payload.executionBaseRevision,2);
 assert.equal(await cp.readCheckpoint(scope),null);
 await assert.rejects(one.record({reps:9,rpe:7}),/U49_WORKOUT_PAUSED/);
 await assert.rejects(one.save(),/U47_PROGRESS_NOT_READY/);
 assert.equal(backend.operations.length,3,
  'paused save cannot dispatch a new command or mutate confirmed results');
 const two=service(backend,cp,false);
 const recovered=await two.open(scope);
 assert.equal(recovered.phase,'active');
 assert.equal(recovered.executionStatus,'paused');
 assert.equal(recovered.accumulatedActiveMs,1200000);
 assert.equal(recovered.currentStep.setNumber,2,
  'already recorded first set must not repeat after restart');
 const resumed=await two.resume();
 assert.equal(resumed.executionStatus,'active');
 assert.equal(resumed.executionRevision,4);
 assert.equal(resumed.activeSince,RESUMED);
 assert.equal(resumed.accumulatedActiveMs,1200000);
 assert.equal(backend.operations.at(-1).type,'OCURRENCIA_REANUDAR');
 assert.equal(backend.operations.at(-1).payload.executionBaseRevision,3);
});
test('U72 unknown ACK during pause never marks workout paused optimistically',async()=>{
 const backend=server(),cp=checkpoint(),svc=service(backend,cp);
 await svc.open(scope);
 await svc.start();
 backend.interruptNext();
 await assert.rejects(svc.pause(),/U72_SYNTHETIC_NETWORK_UNCERTAIN/);
 assert.equal(svc.view().phase,'needs-refresh');
 assert.equal(svc.view().executionStatus,'active');
 assert.equal(backend.operations.at(-1).type,'OCURRENCIA_PAUSAR');
 assert.equal(backend.revision,1);
});