import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTraining360DecisionPack} from '../src/m26/intelligence/training360-decision-pack.js';
import {createOccurrencePrivateReader} from '../src/m26/workflows/occurrence-private-reader.js';

const CLIENT='10000000-0000-4000-8000-000000000101';
const OTHER='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const OCC_A='10000000-0000-4000-8000-000000000104';
const OCC_B='10000000-0000-4000-8000-000000000105';
const OCC_C='10000000-0000-4000-8000-000000000106';
const EXEC='10000000-0000-4000-8000-000000000107';
const APPT_A='10000000-0000-4000-8000-000000000108';
const APPT_B='10000000-0000-4000-8000-000000000109';
const COACH='10000000-0000-4000-8000-000000000110';
const now=new Date('2026-11-04T16:00:00.000Z');
const published={id:SESSION,clientId:CLIENT,title:'Fuerza progresiva',
 status:'disponible',deliveryModality:'guiada_en_app',
 visibleToClient:true,clientVisibilityLevel:'full'};
const occ=(id,localDate,status,rest={})=>({
 id,clientId:CLIENT,sessionId:SESSION,localDate,timeZone:'America/Santiago',
 status,revision:status==='completada'?3:1,...rest,
});
const appointment=(id,status='confirmada',extra={})=>({
 id,clientId:CLIENT,sessionId:SESSION,status,...extra,
});
const completed=occ(OCC_A,'2026-11-02','completada',{
 executionId:EXEC,appointmentId:APPT_A,
});
const future=occ(OCC_B,'2026-11-05','confirmada',{appointmentId:APPT_B});
const activeExecution={id:EXEC,clientId:CLIENT,sessionId:SESSION,
 occurrenceId:OCC_A,status:'completada',revision:3,
 feedback:{privateNote:'DO NOT LEAK'}};
const setup=(other={})=>({
 role:'client',clientId:CLIENT,now,sessions:[published],
 appointments:[appointment(APPT_A,'completada'),appointment(APPT_B)],
 occurrences:[completed,future],executions:[activeExecution],...other,
});
test('U60 decision: independent due dates, verified completion, no double-counting',()=>{
 const result=buildTraining360DecisionPack(setup());
 assert.equal(result.schema,'iberfit.training360.decision.v1');
 assert.equal(result.asOfLocalDate,'2026-11-04');
 assert.equal(result.summary.prescriptions,1);
 assert.equal(result.summary.scheduledDates,2);
 assert.equal(result.summary.dueDates,1);
 assert.equal(result.summary.completedDue,1);
 assert.equal(result.summary.verifiedAdherencePct,100);
 assert.equal(result.days.length,2);
 assert.equal(result.upcoming.length,1);
 assert.equal(result.upcoming[0].canRequestStartHint,true);
 assert.ok(!JSON.stringify(result).includes('DO NOT LEAK'));
 assert.equal(result.nextDecision.type,'upcoming');
});
test('U60 decision: never count incomplete execution evidence as completed',()=>{
 const value=buildTraining360DecisionPack(setup({executions:[]}));
 assert.equal(value.summary.completedDue,0);
 assert.equal(value.summary.verifiedAdherencePct,0);
 assert.equal(value.days[0].complete,false);
});
test('U60 decision: missing evidence is null, not an invented adherence number',()=>{
 const empty=buildTraining360DecisionPack(setup({occurrences:[],executions:[]}));
 assert.equal(empty.summary.verifiedAdherencePct,null);
 assert.equal(empty.summary.scheduledDates,0);
 assert.equal(empty.nextDecision,null);
});
test('U60 decision: foreign client, bad dates and foreign session are excluded',()=>{
 const foreign=occ(OCC_C,'2026-11-03','confirmada',{clientId:OTHER});
 const wrongDate=occ(OCC_C,'2026-02-31','confirmada');
 const noSource=occ(OCC_C,'2026-11-03','confirmada',{
   sessionId:'10000000-0000-4000-8000-000000000199'});
 const value=buildTraining360DecisionPack(setup({
   occurrences:[completed,future,foreign,wrongDate,noSource],
 }));
 assert.equal(value.summary.scheduledDates,2);
 assert.ok(!JSON.stringify(value).includes(OTHER));
});
test('U60 decision: client cannot infer Coach draft or withdrawn prescription',()=>{
 const hidden=buildTraining360DecisionPack(setup({
   sessions:[{...published,visibleToClient:false}],occurrences:[completed,future],
 }));
 assert.equal(hidden.summary.prescriptions,0);
 assert.equal(hidden.summary.scheduledDates,0);
 const coach=buildTraining360DecisionPack(setup({
   role:'coach',sessions:[{...published,visibleToClient:false}],
 }));
 assert.equal(coach.summary.scheduledDates,2);
});
test('U60 decision: appointment from same client but other prescription is not linked',()=>{
 const value=buildTraining360DecisionPack(setup({
   appointments:[appointment(APPT_A,'completada'),
     appointment(APPT_B,'confirmada',{sessionId:OCC_C})],
 }));
 assert.equal(value.upcoming.length,0,'foreign-source appointment must hide the Client date');
 assert.equal(value.summary.scheduledDates,1);
 assert.equal(value.summary.insufficientEvidence,true);
});
test('U60 decision: deduplicates revisions and preserves date-only cancellations',()=>{
 const value=buildTraining360DecisionPack(setup({
   role:'coach', // Coach sees its unlinked date-only cancelled records; Client does not.
   occurrences:[completed,{...completed,revision:2},future,
     occ(OCC_C,'2026-11-03','cancelada')],
 }));
 assert.equal(value.summary.scheduledDates,3);
 assert.equal(value.summary.cancelled,1);
 assert.equal(value.summary.completedDue,1);
});
test('U60 decision: Coach receives actionable evidence warning for unpaired execution',()=>{
 const running=occ(OCC_C,'2026-11-04','en_curso',{
   executionId:EXEC,appointmentId:APPT_B,
 });
 const value=buildTraining360DecisionPack(setup({
   role:'coach',occurrences:[running],executions:[],
 }));
 assert.equal(value.nextDecision.type,'verify-execution');
 assert.equal(value.needsRecovery.length,1);
});
test('U60 decision: never infer authority from local role on input',()=>{
 assert.throws(()=>buildTraining360DecisionPack(setup({role:'not-a-role'})),
   /U60_DECISION_ROLE_INVALID/);
 assert.throws(()=>buildTraining360DecisionPack(setup({clientId:'bad'})),
   /U60_DECISION_CLIENT_INVALID/);
 assert.throws(()=>buildTraining360DecisionPack(setup({occurrences:null})),
   /U60_DECISION_COLLECTIONS_INVALID/);
});

function privateFixture(){
 const p={clientId:CLIENT,sessionId:SESSION,title:'Fuerza',
   queue:[{blockId:'a',exerciseId:'squat',sets:2,prescription:{}}],
   blocks:[{id:'a',type:'exercise',exerciseId:'squat',sets:2}]};
 return {kind:'private-occurrence',occurrence:{
   id:OCC_B,clientId:CLIENT,sessionId:SESSION,localDate:'2026-11-05',
   timeZone:'America/Santiago',status:'confirmada',revision:1,
   executionId:null,appointmentId:APPT_B,
 },prescriptionSnapshot:p,executionBody:null};
}
const clientActor={userId:CLIENT,clientId:CLIENT,role:'cliente',accessToken:'test-auth-token'};
function privateReader({enabled=true,read=async()=>privateFixture(),actor=async()=>clientActor}={}){
 return createOccurrencePrivateReader({enabled,transport:{occurrencePrivateRead:read},
   getAuthContext:actor});
}
test('U60 private reader stays disabled without backend activation',async()=>{
 const svc=privateReader({enabled:false,read:async()=>{throw Error('should-not-call');}});
 await assert.rejects(svc.read({clientId:CLIENT,occurrenceId:OCC_B}),
   /U60_PRIVATE_NOT_ENABLED/);
});
test('U60 private reader accepts exact authorized date and isolates clones',async()=>{
 let calls=0;
 const svc=privateReader({read:async(token,query)=>{
   calls++;assert.equal(token,'test-auth-token');
   assert.deepEqual(query,{clientId:CLIENT,occurrenceId:OCC_B});
   return privateFixture();
 }});
 const item=await svc.read({clientId:CLIENT,occurrenceId:OCC_B});
 assert.equal(calls,1);
 assert.equal(item.occurrence.id,OCC_B);
 assert.equal(item.prescriptionSnapshot.queue.length,1);
});
test('U60 private reader refuses cross-client before making an HTTP request',async()=>{
 let calls=0;
 const svc=privateReader({read:async()=>{calls++;return privateFixture();}});
 await assert.rejects(svc.read({clientId:OTHER,occurrenceId:OCC_B}),
   /U60_PRIVATE_CLIENT_SCOPE_FORBIDDEN/);
 assert.equal(calls,0);
});
test('U60 private reader discards fetched data if role changes while awaiting',async()=>{
 let n=0;
 const svc=privateReader({actor:async()=>{
   n++;return n===1?clientActor:{...clientActor,userId:COACH,role:'coach'};
 }});
 await assert.rejects(svc.read({clientId:CLIENT,occurrenceId:OCC_B}),
   /U60_PRIVATE_AUTH_CONTEXT_CHANGED/);
});
test('U60 private reader rejects foreign response identity and injected fields',async()=>{
 for(const mutate of [
   x=>{x.occurrence.clientId=OTHER;},
   x=>{x.occurrence.id=OCC_A;},
   x=>{x.prescriptionSnapshot.sessionId=OCC_A;},
   x=>{x.prescriptionSnapshot.internalNotes='secret';},
   x=>{x.occurrence.extraUnauthorized='leak';},
 ]){
   const result=privateFixture();mutate(result);
   await assert.rejects(
     privateReader({read:async()=>result}).read({clientId:CLIENT,occurrenceId:OCC_B}),
     /U60_PRIVATE_/);
 }
});
test('U60 private reader requires a matching independent execution to resume',async()=>{
 const result=privateFixture();
 result.occurrence.status='en_curso';
 result.occurrence.executionId=EXEC;
 await assert.rejects(
   privateReader({read:async()=>result}).read({clientId:CLIENT,occurrenceId:OCC_B}),
   /U60_PRIVATE_EXECUTION_DRIFT/);
 result.executionBody={id:EXEC,clientId:CLIENT,sessionId:SESSION,occurrenceId:OCC_B,
   status:'en_curso',revision:1,
   queue:structuredClone(result.prescriptionSnapshot.queue),
   sourceSnapshot:structuredClone(result.prescriptionSnapshot)};
 const ok=await privateReader({read:async()=>result}).read({
   clientId:CLIENT,occurrenceId:OCC_B});
 assert.equal(ok.executionBody.id,EXEC);
});
test('U60 private reader rejects Coach-only draft for Client',async()=>{
 const result=privateFixture();result.occurrence.status='planificada';
 await assert.rejects(
   privateReader({read:async()=>result}).read({clientId:CLIENT,occurrenceId:OCC_B}),
   /U60_PRIVATE_CLIENT_UNPUBLISHED_FORBIDDEN/);
 const coach=privateReader({
   actor:async()=>({userId:COACH,role:'coach',accessToken:'coach-jwt'}),
   read:async()=>result,
 });
 assert.equal((await coach.read({clientId:CLIENT,occurrenceId:OCC_B}))
   .occurrence.status,'planificada');
});
test('U60 source/UI wiring is advisory and never exposes a new start command',()=>{
 const vm=readFileSync(new URL('../src/m26/rc39/view-model.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/m26/rc39/route-render.js',import.meta.url),'utf8');
 assert.match(vm,/buildTraining360DecisionPack/u);
 assert.match(ui,/renderTraining360DecisionSummary/u);
 assert.match(ui,/data-training360-evidence="server-scoped"/u);
 assert.doesNotMatch(ui,/data-workflow-action="occurrence-start"/u);
});
