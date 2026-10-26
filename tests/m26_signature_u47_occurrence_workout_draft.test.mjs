import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOccurrenceWorkoutDraft,buildOccurrenceWorkoutCommand,applyOccurrenceWorkoutAck,
  rehydrateOccurrenceWorkoutDraft,
} from '../src/m26/workflows/occurrence-workout-draft.js';
import {recordSet,advanceExecution,finishExecution,currentStep} from '../src/m26/workflows/session-execution.js';
const CLIENT='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const OCC1='10000000-0000-4000-8000-000000000105';
const OCC2='10000000-0000-4000-8000-000000000106';
const EXEC1='10000000-0000-4000-8000-000000000107';
const EXEC2='10000000-0000-4000-8000-000000000108';
const OP1='10000000-0000-4000-8000-000000000109';
const OP2='10000000-0000-4000-8000-000000000110';
const OP3='10000000-0000-4000-8000-000000000111';
const blocks=[
 {id:'base',type:'exercise',exerciseId:'squat',sets:1,reps:'8',plannedLoad:'20'},
 {id:'duo',type:'biserie',exerciseIds:['row','push'],rounds:1,
   prescriptions:{row:{reps:'10'},push:{reps:'12'}}},
 {id:'trio',type:'triserie',exerciseIds:['row','push','squat'],rounds:1},
 {id:'cardio',type:'circuito',exerciseIds:['row','push'],rounds:1},
 {id:'amrap',type:'amrap',exerciseIds:['row'],rounds:1},
 {id:'interval',type:'tabata',exerciseIds:['push'],rounds:1},
];
const queue=blocks.flatMap(block=>block.type==='exercise'
 ?[{blockId:block.id,exerciseId:block.exerciseId,sets:block.sets,
   prescription:{reps:block.reps,plannedLoad:block.plannedLoad}}]
 :block.exerciseIds.map((exerciseId,groupOrder)=>({
   blockId:block.id,exerciseId,sets:block.rounds,groupType:block.type,
   groupOrder,groupSize:block.exerciseIds.length,
   prescription:block.prescriptions?.[exerciseId]||{},
 })));
const occurrence=(id=OCC1)=>({
 id,clientId:CLIENT,sessionId:SESSION,localDate:'2026-10-27',
 timeZone:'America/Santiago',status:'confirmada',revision:1,
 executionId:null,
});
const snapshot=()=>({clientId:CLIENT,sessionId:SESSION,
 blocks:structuredClone(blocks),queue:structuredClone(queue)});
const draft=(id=OCC1,execId=EXEC1)=>createOccurrenceWorkoutDraft({
 occurrence:occurrence(id),prescriptionSnapshot:snapshot(),executionId:execId,
});
const ack=(cmd,remoteRevision,executionRevision,status='en_curso')=>({
 kind:'ack',operationId:cmd.operationId,entityId:cmd.entityId,
 executionId:cmd.payload.executionId,remoteRevision,executionRevision,status,
});
test('U47 all six real block kinds remain ordered against U44 server queue',()=>{
 const d=draft();
 assert.equal(d.execution.queue.length,queue.length);
 assert.deepEqual(d.execution.queue.map(x=>[x.blockId,x.exerciseId,x.groupType||null]),
   queue.map(x=>[x.blockId,x.exerciseId,x.groupType||null]));
 assert.deepEqual([...new Set(d.execution.queue.map(x=>x.groupType).filter(Boolean))],
   ['biserie','triserie','circuito','amrap','tabata']);
 assert.equal(d.occurrenceRevision,1);
 assert.equal(d.executionRevision,null);
 assert.equal(d.execution.status,'ready');
});
test('U47 confirmed starts and progress have independent CAS, never V26 fallback',()=>{
 const first=draft(),second=draft(OCC2,EXEC2);
 const start=buildOccurrenceWorkoutCommand(first,{action:'start',operationId:OP1});
 assert.equal(start.type,'OCURRENCIA_INICIAR');
 assert.equal(start.entityId,OCC1);
 assert.equal(start.payload.executionId,EXEC1);
 assert.equal(start.baseRevision,1);
 assert.throws(()=>buildOccurrenceWorkoutCommand(first,{
   action:'progress',operationId:OP2,
 }),/U47_EXECUTION_NOT_ACKNOWLEDGED/);
 applyOccurrenceWorkoutAck(first,start,ack(start,2,1));
 assert.equal(first.execution.status,'active');
 assert.equal(first.occurrenceRevision,2);
 assert.equal(first.executionRevision,1);
 recordSet(first.execution,first.session,{reps:8,load:20,rpe:7,rir:3});
 const progress=buildOccurrenceWorkoutCommand(first,{action:'progress',operationId:OP2});
 assert.equal(progress.type,'OCURRENCIA_GUARDAR_PROGRESO');
 assert.equal(progress.baseRevision,2);
 assert.equal(progress.payload.executionBaseRevision,1);
 assert.ok(Object.keys(progress.payload.results).length>0);
 applyOccurrenceWorkoutAck(first,progress,ack(progress,2,2));
 assert.equal(first.occurrenceRevision,2,'progress never closes a future date');
 assert.equal(first.executionRevision,2);
 assert.equal(second.phase,'ready');
 assert.equal(second.execution.status,'ready');
 assert.equal(second.occurrenceRevision,1);
 assert.notEqual(first.execution.id,second.execution.id);
});
test('U47 ACK must match identity, CAS, status and execution',()=>{
 const d=draft(),cmd=buildOccurrenceWorkoutCommand(d,{action:'start',operationId:OP1});
 assert.throws(()=>applyOccurrenceWorkoutAck(d,cmd,{
   ...ack(cmd,2,1),executionId:EXEC2,
 }),/U47_ACK_IDENTITY_MISMATCH/);
 assert.throws(()=>applyOccurrenceWorkoutAck(d,cmd,ack(cmd,2,1,'completada')),
   /U47_ACK_REVISION_INVALID/);
 assert.throws(()=>applyOccurrenceWorkoutAck(d,cmd,ack(cmd,1,1)),
   /U47_ACK_START_INVALID/);
 assert.equal(d.phase,'ready','failed ACK must not start local training');
 assert.equal(d.execution.status,'ready');
});
test('U47 cannot prepare a foreign snapshot, wrong queue, duplicate execution or stale date',()=>{
 assert.throws(()=>createOccurrenceWorkoutDraft({
   occurrence:occurrence(),prescriptionSnapshot:{...snapshot(),clientId:EXEC2},
   executionId:EXEC1,
 }),/U47_SNAPSHOT_OWNER_MISMATCH/);
 const changed=snapshot();changed.queue[1].exerciseId='other';
 assert.throws(()=>createOccurrenceWorkoutDraft({
   occurrence:occurrence(),prescriptionSnapshot:changed,executionId:EXEC1,
 }),/U47_QUEUE_DRIFT/);
 assert.throws(()=>createOccurrenceWorkoutDraft({
   occurrence:{...occurrence(),status:'en_curso',executionId:EXEC1},
   prescriptionSnapshot:snapshot(),executionId:EXEC2,
 }),/U47_OCCURRENCE_NOT_STARTABLE/);
 assert.throws(()=>createOccurrenceWorkoutDraft({
   occurrence:{...occurrence(),localDate:'2026-02-30'},
   prescriptionSnapshot:snapshot(),executionId:EXEC1,
 }),/U47_DATE_INVALID/);
 const d=draft();
 assert.throws(()=>buildOccurrenceWorkoutCommand(d,{
   action:'legacy',operationId:OP1,
 }),/U47_ACTION_FORBIDDEN/);
});
test('U47 completion sends results and feedback to occurrence, not canonical session',()=>{
 const d=createOccurrenceWorkoutDraft({
   occurrence:occurrence(),prescriptionSnapshot:{
     clientId:CLIENT,sessionId:SESSION,
     blocks:[blocks[0]],queue:[queue[0]],
   },executionId:EXEC1,
 });
 const start=buildOccurrenceWorkoutCommand(d,{action:'start',operationId:OP1});
 applyOccurrenceWorkoutAck(d,start,ack(start,2,1));
 recordSet(d.execution,d.session,{reps:8,load:20,rpe:7,rir:3});
 advanceExecution(d.execution);
 assert.equal(d.execution.status,'awaiting_feedback');
 finishExecution(d.execution,{sessionRpe:7,comment:'Buen entrenamiento',pain:false});
 const complete=buildOccurrenceWorkoutCommand(d,{action:'complete',operationId:OP3});
 assert.equal(complete.type,'OCURRENCIA_COMPLETAR');
 assert.equal(complete.baseRevision,2);
 assert.equal(complete.payload.executionBaseRevision,1);
 assert.equal(complete.payload.feedback.sessionRpe,7);
 assert.equal(complete.entityId,OCC1);
 assert.notEqual(complete.entityId,SESSION);
 assert.throws(()=>applyOccurrenceWorkoutAck(d,complete,ack(complete,2,2,'completada')),
   /U47_ACK_CAS_INVALID/);
 applyOccurrenceWorkoutAck(d,complete,ack(complete,3,2,'completada'));
 assert.equal(d.phase,'completed');
 assert.equal(d.occurrenceRevision,3);
});

test('U48 resumes a dated workout at the first unresolved set using server-owned CAS',()=>{
 const blk={...blocks[0],sets:3};
 const frozen={clientId:CLIENT,sessionId:SESSION,
   blocks:[blk],queue:[{...queue[0],sets:3}]};
 const original=createOccurrenceWorkoutDraft({
   occurrence:occurrence(),prescriptionSnapshot:frozen,executionId:EXEC1,
 });
 const start=buildOccurrenceWorkoutCommand(original,{action:'start',operationId:OP1});
 applyOccurrenceWorkoutAck(original,start,ack(start,2,1));
 recordSet(original.execution,original.session,{reps:8,load:20,rpe:7,rir:3});
 const saved=buildOccurrenceWorkoutCommand(original,{action:'progress',operationId:OP2});
 applyOccurrenceWorkoutAck(original,saved,ack(saved,2,2));
 const remote={
   id:EXEC1,clientId:CLIENT,sessionId:SESSION,occurrenceId:OCC1,
   status:'en_curso',revision:2,startedAt:new Date().toISOString(),
   sourceSnapshot:structuredClone(frozen),queue:structuredClone(frozen.queue),
   results:structuredClone(original.execution.results),skippedSets:{},events:[],
 };
 const reopened=rehydrateOccurrenceWorkoutDraft({
   occurrence:{...occurrence(),status:'en_curso',revision:2,executionId:EXEC1},
   prescriptionSnapshot:frozen,executionBody:remote,
 });
 assert.equal(reopened.phase,'active');
 assert.equal(reopened.executionRevision,2);
 assert.equal(reopened.occurrenceRevision,2);
 assert.equal(currentStep(reopened.execution,reopened.session).setNumber,2,
   'the completed first set cannot be recorded twice after reload');
 const next=buildOccurrenceWorkoutCommand(reopened,{action:'progress',operationId:OP3});
 assert.equal(next.payload.executionBaseRevision,2);
 assert.equal(next.baseRevision,2);
 assert.equal(next.entityId,OCC1);
});
test('U48 fails closed for missing, foreign, changed and completed server records',()=>{
 const frozen=snapshot();
 const base={id:EXEC1,clientId:CLIENT,sessionId:SESSION,
   occurrenceId:OCC1,status:'en_curso',revision:2,
   startedAt:new Date().toISOString(),sourceSnapshot:frozen,
   queue:structuredClone(frozen.queue),results:{},skippedSets:{}};
 const o={...occurrence(),status:'en_curso',revision:2,executionId:EXEC1};
 const args={occurrence:o,prescriptionSnapshot:frozen,executionBody:base};
 assert.throws(()=>rehydrateOccurrenceWorkoutDraft({
   ...args,executionBody:{...base,clientId:EXEC2},
 }),/U47_REHYDRATION_OWNER_MISMATCH/);
 assert.throws(()=>rehydrateOccurrenceWorkoutDraft({
   ...args,executionBody:{...base,sourceSnapshot:{...frozen,clientId:EXEC2}},
 }),/U47_REHYDRATION_SOURCE_MISMATCH/);
 assert.throws(()=>rehydrateOccurrenceWorkoutDraft({
   ...args,occurrence:{...o,status:'completada'},
 }),/U47_REHYDRATION_NOT_ACTIVE/);
 assert.throws(()=>rehydrateOccurrenceWorkoutDraft({
   ...args,executionBody:{...base,results:null},
 }),/U47_REHYDRATION_RESULTS_INVALID/);
});
