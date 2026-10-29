import test from 'node:test';
import assert from 'node:assert/strict';
import {newU47Scope,u47WriteAuthorized} from '../qa/coach-webauthn-recurring/u47-running-policy.mjs';
const ID='4d244c01-8966-40f1-8cc7-9e6ec46d1708';
const CLIENT='10000000-0000-4000-8000-000000000471';
const EXEC='30000000-0000-4000-8000-000000000473';
const TITLE='QA U47 · Running 40738135729-1';
const old=process.env.M26_QA_U48_RUNNING;process.env.M26_QA_U48_RUNNING='true';
process.on('exit',()=>{if(old===undefined)delete process.env.M26_QA_U48_RUNNING;else process.env.M26_QA_U48_RUNNING=old});
const cmd=(type='SESION_INICIAR')=>({type,operationId:'50000000-0000-4000-8000-000000000001',
  entityType:'session',entityId:ID,clientId:CLIENT,baseRevision:2,payload:{executionId:EXEC}});
const req=(x,origin='https://gjztkdwfmunnzhtvxrsu.supabase.co')=>({
 method:()=> 'POST',headers:()=>({authorization:'Bearer qa.synthetic.jwt'}),
 url:()=>origin+'/rest/v1/rpc/iberfit_execute_command_v26',
 postDataJSON:()=>({p_command:x}),
});
const scope=()=>Object.assign(newU47Scope({stage:'execute',clientId:CLIENT,title:TITLE}),
 {sessionId:ID,serverPublicationConfirmed:true,historyClean:true,enabled:true});
test('U48 one-shot flag cannot publish or mutate any other QA prescription',()=>{
 const s=scope();
 assert.equal(u47WriteAuthorized(req({...cmd(),type:'SESION_PUBLICAR'}),s),false);
 assert.equal(u47WriteAuthorized(req({...cmd(),entityId:EXEC}),s),false);
 assert.equal(u47WriteAuthorized(req(cmd(),'https://pjhmrhejsoofmouedavw.supabase.co'),s),false);
 assert.equal(s.uniqueByOperation.size,0);
});
test('U48 cannot start the already ACKed running a second time',()=>{
 const s=scope();
 const foreign=scope();foreign.sessionId=EXEC;
 assert.equal(u47WriteAuthorized(req(cmd()),foreign),false);
 const withCita=cmd();withCita.payload.appointmentId=EXEC;
 assert.equal(u47WriteAuthorized(req(withCita),s),false);
 assert.equal(u47WriteAuthorized(req(cmd()),s),false);
 assert.equal(u47WriteAuthorized(req({...cmd(),operationId:'50000000-0000-4000-8000-000000000002'}),s),false);
 assert.equal(s.executionId,null);
 assert.equal(s.uniqueByOperation.size,0);
 assert.equal(s.typeCounts.get('SESION_INICIAR')||0,0);
});
test('U48 may only continue the verified existing execution ID, not a new or foreign one',()=>{
 const s=scope();
 s.executionId=EXEC; // Only after independent authoritative bootstrap/DB validation.
 const progress={...cmd('EJECUCION_GUARDAR_PROGRESO'),entityType:'session_execution',
   entityId:EXEC,baseRevision:1,operationId:'50000000-0000-4000-8000-000000000031',
   payload:{progressSnapshot:{sessionId:ID,clientId:CLIENT}}};
 assert.equal(u47WriteAuthorized(req(progress),s),true);
 assert.equal(u47WriteAuthorized(req({...progress,operationId:'50000000-0000-4000-8000-000000000032',entityId:ID}),s),false);
 assert.equal(u47WriteAuthorized(req({...progress,operationId:'50000000-0000-4000-8000-000000000033',payload:{progressSnapshot:{sessionId:ID,clientId:EXEC}}}),s),false);
 assert.equal(s.typeCounts.get('EJECUCION_GUARDAR_PROGRESO'),1);
 assert.equal(s.typeCounts.get('SESION_INICIAR')||0,0);
});
test('U48 never permits non-first protected runs without explicit flag',()=>{
 const s=scope();
 process.env.M26_QA_U48_RUNNING='false';
 assert.equal(u47WriteAuthorized(req(cmd()),s),false);
 process.env.M26_QA_U48_RUNNING='true';
});


test('U48 Coach readback is sequenced before U55 offline builder with no secondary Coach publication',async()=>{
 const fs=await import('node:fs');
 const spec=fs.readFileSync(new URL('../qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs',import.meta.url),'utf8');
 const recovery=fs.readFileSync(new URL('../qa/coach-webauthn-recurring/u48-running-recovery.mjs',import.meta.url),'utf8');
 assert.ok(spec.indexOf("await certifyU48ExistingRunning({browser")>0);
 assert.ok(spec.indexOf("await certifyU48ExistingRunning({browser")<spec.indexOf('u56Scope.title=await certifyOfflineCoachAuthoring('));
 assert.match(recovery,/data-coach-client-workspace/);
 assert.match(recovery,/independentCoachMfaReadback:true/);
 assert.doesNotMatch(recovery,/SESION_PUBLICAR/);
});


// Universal remote recovery (running, strength, swimming) is NOT a second start.
import {recoverAuthenticatedRemoteExecution} from '../src/m26/workflows/session-entry-freshness.js';
import {advanceExecution,buildProgressExecutionCommand} from '../src/m26/workflows/session-execution.js';
const baseBlock={id:'40000000-0000-4000-8000-000000000475',type:'exercise',
 exerciseId:'IBF-CARRERA-SUAVE',sets:1,restSeconds:0,measurementProfile:'endurance'};
function remoteFixture(block=baseBlock){
 const session={id:ID,clientId:CLIENT,title:'Trabajo autorizado',status:'en_curso',
  revision:3,visibleToClient:true,clientVisibilityLevel:'full',
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',blocks:[block]};
 const row={id:EXEC,client_id:CLIENT,session_id:ID,execution_status:'activa',revision:1,
  summary:{id:EXEC,sessionId:ID,clientId:CLIENT,status:'en_curso',revision:1,
   sourceSnapshot:[structuredClone(block)],items:[structuredClone(block)],
   cursor:{itemIndex:0,setIndex:0},startedAt:'2026-10-28T20:00:00.000Z'}};
 const visibleExecutions=[{id:EXEC,sessionId:ID,clientId:CLIENT,executionStatus:'activa'}];
 const canonicalExecutions=[{entityId:EXEC,sessionId:ID,clientId:CLIENT,status:'en_curso'}];
 return {session,clientId:CLIENT,executionRow:row,visibleExecutions,canonicalExecutions};
}
test('U48 verified existing running reconstructs same remote CAS without a second start',()=>{
 const data=remoteFixture();
 const recovered=recoverAuthenticatedRemoteExecution(data);
 assert.equal(recovered.execution.id,EXEC);
 assert.equal(recovered.execution.status,'active');
 assert.equal(recovered.execution.revision,1);
 assert.equal(recovered.execution.results && Object.keys(recovered.execution.results).length,0);
 assert.equal(recovered.execution.events.length,0);
 assert.equal(buildProgressExecutionCommand(recovered.execution).entityId,EXEC);
 assert.equal(buildProgressExecutionCommand(recovered.execution).baseRevision,1);
});
test('U48 recovery is generic for authorized strength and swimming blocks',()=>{
 for(const exerciseId of ['IBF-SENTADILLA','IBF-NATACION-SUAVE']){
  const data=remoteFixture({...baseBlock,exerciseId,
   measurementProfile:exerciseId==='IBF-SENTADILLA'?'strength':'endurance'});
  assert.equal(recoverAuthenticatedRemoteExecution(data).execution.queue[0].exerciseId,exerciseId);
 }
});
test('U48 recovered execution fails closed on identity, duplicate, CAS and plan drift',()=>{
 const variants=[
  d=>{d.executionRow.client_id=EXEC;},
  d=>{d.executionRow.summary.revision=0;},
  d=>{d.visibleExecutions.push({...d.visibleExecutions[0]});},
  d=>{d.executionRow.summary.items[0].exerciseId='OTHER';},
  d=>{d.executionRow.summary.progressSavedAt='2026-10-28T20:01:00.000Z';},
  d=>{d.executionRow.id='00000000-0000-4000-8000-000000000000';},
  d=>{d.canonicalExecutions[0].entityId='00000000-0000-4000-8000-000000000000';},
  d=>{d.session.status='disponible';},
 ];
 for(const mutate of variants){
  const d=remoteFixture();mutate(d);
  assert.throws(()=>recoverAuthenticatedRemoteExecution(d),/M48_RECOVERY_/);
 }
});

test('U48 restores a durable partially completed workout from server progressSnapshot, not a blank start',()=>{
 const block={...baseBlock,sets:2};
 const data=remoteFixture(block);
 const original=recoverAuthenticatedRemoteExecution(data).execution;
 const observed={exerciseId:block.exerciseId,setNumber:1,reps:null,seconds:1200,rpe:7,
   distanceKm:3.3,completedAt:'2026-10-28T20:20:00.000Z'};
 data.executionRow.revision=2;
 data.executionRow.summary.revision=2;
 data.executionRow.summary.progressSavedAt='2026-10-28T20:20:01.000Z';
 data.executionRow.summary.progressSnapshot={
   id:EXEC,clientId:CLIENT,sessionId:ID,status:'active',revision:1,
   startedAt:'2026-10-28T20:00:00.000Z',index:0,setIndex:1,
   queue:structuredClone(original.queue),results:{[block.exerciseId+':1']:observed},
   events:[{type:'SET_COMPLETED',at:observed.completedAt}],accumulatedActiveMs:1_200_000,
   skippedSets:{},skippedExercises:{},
 };
 const recovered=recoverAuthenticatedRemoteExecution(data).execution;
 assert.equal(recovered.id,EXEC);
 assert.equal(recovered.revision,2);
 assert.equal(recovered.setIndex,1);
 assert.equal(recovered.results[block.exerciseId+':1'].distanceKm,3.3);
 assert.equal(recovered.events.length,1);
 assert.equal(buildProgressExecutionCommand(recovered).baseRevision,2);
});
test('U48 rejects forged nested progress identity or a missing durable queue',()=>{
 for(const mutate of [
  s=>{s.sessionId=EXEC;},
  s=>{s.clientId=EXEC;},
  s=>{s.revision=999;},
  s=>{s.queue=[];},
  s=>{s.results=null;},
 ]){
  const data=remoteFixture(),exec=recoverAuthenticatedRemoteExecution(data).execution;
  data.executionRow.revision=2;data.executionRow.summary.revision=2;
  data.executionRow.summary.progressSavedAt='2026-10-28T20:20:01.000Z';
  data.executionRow.summary.progressSnapshot={
    id:EXEC,clientId:CLIENT,sessionId:ID,status:'active',revision:1,
    startedAt:'2026-10-28T20:00:00.000Z',index:0,setIndex:0,
    queue:structuredClone(exec.queue),results:{},events:[],
  };
  mutate(data.executionRow.summary.progressSnapshot);
  assert.throws(()=>recoverAuthenticatedRemoteExecution(data),/M48_RECOVERY_/);
 }
});

test('U48 client bootstrap reconciles its intentionally redacted legacy execution against verified canonical lineage',async()=>{
 const {reconcileCanonicalTrainingCollections}=await import('../src/m26/domain/canonical-training-collections.js');
 const sanitizedLegacy={id:EXEC,revision:1,results:[],feedback:{},sourceSnapshot:{}};
 const canonical={entityType:'session_execution',entityId:EXEC,clientId:CLIENT,status:'en_curso',revision:1,
  body:{id:EXEC,clientId:CLIENT,sessionId:ID,status:'en_curso',revision:1}};
 const collections=reconcileCanonicalTrainingCollections({
  m26Entities:[canonical],sessionExecutions:[sanitizedLegacy],
 });
 assert.equal(collections.sessionExecutions.length,1);
 const execution=collections.sessionExecutions[0];
 assert.equal(execution.id,EXEC);
 assert.equal(execution.clientId,CLIENT);
 assert.equal(execution.sessionId,ID);
 assert.equal(execution.status,'en_curso');
 assert.equal(execution.revision,1);
 assert.deepEqual(execution.results,[]);
 assert.equal(sanitizedLegacy.clientId,undefined,'server raw privacy projection not mutated');
 assert.equal(sanitizedLegacy.sessionId,undefined,'server raw privacy projection not mutated');
});

test('U48 revision 2 restores the last confirmed set and advances to feedback without replay',()=>{
 const data=remoteFixture();
 const initial=recoverAuthenticatedRemoteExecution(data).execution;
 const step=initial.queue[0],key=step.exerciseId+':1';
 const observed={exerciseId:step.exerciseId,setNumber:1,reps:null,seconds:2148,
   rpe:7,distanceKm:6.5,completedAt:'2026-10-28T20:20:00.000Z'};
 data.executionRow.revision=2;data.executionRow.summary.revision=2;
 data.executionRow.summary.progressSavedAt='2026-10-28T20:20:01.000Z';
 data.executionRow.summary.progressSnapshot={
   id:EXEC,clientId:CLIENT,sessionId:ID,status:'active',revision:1,
   startedAt:'2026-10-28T20:00:00.000Z',index:0,setIndex:0,
   queue:structuredClone(initial.queue),results:{[key]:observed},
   events:[{type:'SET_COMPLETED',at:observed.completedAt}],
   accumulatedActiveMs:1200000,skippedSets:{},skippedExercises:{},
 };
 const recovered=recoverAuthenticatedRemoteExecution(data).execution;
 assert.equal(recovered.revision,2);
 assert.equal(recovered.status,'active');
 assert.equal(Object.keys(recovered.results).length,1);
 advanceExecution(recovered);
 assert.equal(recovered.status,'awaiting_feedback');
 assert.equal(Object.keys(recovered.results).length,1,'Never register the same set again');
 const cmd=buildProgressExecutionCommand(recovered);
 assert.equal(cmd.baseRevision,2,'Server-confirmed CAS must be retained');
 assert.equal(cmd.entityId,EXEC,'Use exact original execution');
 assert.equal(cmd.clientId,CLIENT);
 assert.equal(cmd.payload.progressSnapshot.status,'awaiting_feedback');
});
