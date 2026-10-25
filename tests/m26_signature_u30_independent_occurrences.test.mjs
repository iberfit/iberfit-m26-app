import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  planDatedTrainingOccurrences,prepareOccurrenceStateChange,
  resolveSantiagoLocalInstant,
} from '../src/m26/domain/dated-training-occurrences.js';

const CLIENT='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const SESSION='33333333-3333-4333-8333-333333333333';
const EXEC='44444444-4444-4444-8444-444444444444';
const options=()=>({
  sessionId:SESSION,clientId:CLIENT,sourceRevision:7,
  sourceSnapshot:{id:SESSION,clientId:CLIENT,title:'Fuerza A',blocks:[{exerciseId:'sentadilla',sets:3}]},
  cycleStartDate:'2026-10-26',cycleEndDate:'2026-11-30',
  durationMinutes:50,dates:[
    {localDate:'2026-10-27',localTime:'18:00'},
    {localDate:'2026-11-03',localTime:'18:00'},
    {localDate:'2026-11-10',localTime:'18:00'},
  ],
});
const error=(fn,code)=>assert.throws(fn,new RegExp('U30_'+code,'u'));
const migration=readFileSync(new URL('../supabase/migrations/20261025182000_signature_u30_independent_occurrence_foundation_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/rollbacks/20261025182000_signature_u30_independent_occurrence_foundation_v1.rollback.sql',import.meta.url),'utf8');

test('U30: three Santiago Tuesdays are three distinct ordered records with frozen source snapshots',()=>{
  const input=options();
  const result=planDatedTrainingOccurrences(input);
  assert.equal(result.count,3);
  assert.deepEqual(result.occurrences.map(x=>x.localDate),['2026-10-27','2026-11-03','2026-11-10']);
  assert.deepEqual(result.occurrences.map(x=>x.startsAt),[
    '2026-10-27T21:00:00.000Z',
    '2026-11-03T21:00:00.000Z',
    '2026-11-10T21:00:00.000Z',
  ]);
  assert.equal(result.occurrences[0].endsAt,'2026-10-27T21:50:00.000Z');
  assert.notEqual(result.occurrences[0].prescriptionSnapshot,result.occurrences[1].prescriptionSnapshot);
  input.sourceSnapshot.blocks[0].sets=100;
  assert.equal(result.occurrences[0].prescriptionSnapshot.blocks[0].sets,3);
  assert.equal(Object.isFrozen(result.occurrences[0].prescriptionSnapshot.blocks[0]),true);
  assert.equal(result.occurrences[0].status,'planificada');
  assert.equal(result.occurrences[0].prescriptionRevision,7);
  assert.equal(input.dates.length,3);
});

test('U30: completing Tuesday one never changes or consumes other Tuesday or shared prescription',()=>{
  const plan=planDatedTrainingOccurrences(options());
  const first=prepareOccurrenceStateChange(plan.occurrences[0],{event:'confirm',expectedRevision:0});
  const inProgress=prepareOccurrenceStateChange(first,{event:'start',expectedRevision:1,executionId:EXEC});
  const completed=prepareOccurrenceStateChange(inProgress,{event:'complete',expectedRevision:2,executionId:EXEC});
  assert.equal(completed.status,'completada');
  assert.equal(completed.revision,3);
  assert.equal(plan.occurrences[1].status,'planificada');
  assert.equal(plan.occurrences[2].status,'planificada');
  assert.equal(plan.occurrences[0].prescriptionSnapshot.title,'Fuerza A');
  const second=prepareOccurrenceStateChange(plan.occurrences[1],{event:'confirm',expectedRevision:0});
  const secondStart=prepareOccurrenceStateChange(second,{event:'start',expectedRevision:1,
    executionId:'55555555-5555-4555-8555-555555555555'});
  assert.equal(secondStart.status,'en_curso');
  error(()=>prepareOccurrenceStateChange(inProgress,{event:'complete',expectedRevision:1,executionId:EXEC}),'REVISION_CONFLICT');
  error(()=>prepareOccurrenceStateChange(completed,{event:'start',expectedRevision:3,executionId:EXEC}),'TRANSITION_FORBIDDEN');
  error(()=>prepareOccurrenceStateChange(inProgress,{event:'complete',expectedRevision:2,executionId:OTHER}),'EXECUTION_MISMATCH');
});

test('U30: duplicate or out-of-cycle days and time conflicts are fail-closed, never partially accepted',()=>{
  const input=options();
  error(()=>planDatedTrainingOccurrences({...input,dates:['2026-10-27','2026-10-27']}),'DUPLICATE_LOCAL_DAY');
  error(()=>planDatedTrainingOccurrences({...input,dates:['2026-12-01']}),'OUTSIDE_CYCLE');
  error(()=>planDatedTrainingOccurrences({...input,dates:['2026-02-30']}),'LOCAL_DATE_INVALID');
  error(()=>planDatedTrainingOccurrences({...input,existingOccurrences:[{sessionId:SESSION,localDate:'2026-11-03'}]}),'DUPLICATE_LOCAL_DAY');
  error(()=>planDatedTrainingOccurrences({...input,existingAppointments:[
    {clientId:CLIENT,startsAt:'2026-10-27T21:20:00.000Z',endsAt:'2026-10-27T22:30:00.000Z',status:'confirmada'},
  ]}),'CLIENT_TIME_CONFLICT');
  assert.equal(planDatedTrainingOccurrences({...input,existingAppointments:[
    {clientId:OTHER,startsAt:'2026-10-27T21:20:00.000Z',endsAt:'2026-10-27T22:30:00.000Z',status:'confirmada'},
  ]}).count,3,'other Clients are isolated');
  error(()=>planDatedTrainingOccurrences({...input,clientId:OTHER}),'SNAPSHOT_OWNER_MISMATCH');
});

test('U30: date-only occurrences remain un-timed; invalid duration/count/revision fail',()=>{
  const input=options();
  const occurrence=planDatedTrainingOccurrences({...input,dates:['2026-11-03']}).occurrences[0];
  assert.equal(occurrence.localTime,null);
  assert.equal(occurrence.startsAt,null);
  assert.equal(occurrence.endsAt,null);
  error(()=>planDatedTrainingOccurrences({...input,sourceRevision:-1}),'REVISION_INVALID');
  error(()=>planDatedTrainingOccurrences({...input,durationMinutes:300}),'DURATION_INVALID');
  error(()=>planDatedTrainingOccurrences({...input,dates:[]}),'COUNT_INVALID');
  error(()=>planDatedTrainingOccurrences({...input,dates:[{localDate:'2026-11-03',localTime:'25:00'}]}),'LOCAL_TIME_INVALID');
});

test('U30: actual Chile DST spring gap rejected, autumn duplicated hour requires explicit choice',()=>{
  error(()=>resolveSantiagoLocalInstant('2026-09-06','00:30'),'DST_NONEXISTENT_LOCAL_TIME');
  error(()=>resolveSantiagoLocalInstant('2026-04-04','23:30'),'DST_AMBIGUOUS_LOCAL_TIME');
  const earlier=resolveSantiagoLocalInstant('2026-04-04','23:30',{disambiguation:'earlier'});
  const later=resolveSantiagoLocalInstant('2026-04-04','23:30',{disambiguation:'later'});
  assert.equal(earlier,'2026-04-05T02:30:00.000Z');
  assert.equal(later,'2026-04-05T03:30:00.000Z');
  assert.equal(resolveSantiagoLocalInstant('2026-09-06','01:30'),'2026-09-06T04:30:00.000Z');
});

test('U30: database integrity, frozen snapshot and read restrictions are enforced at source',()=>{
  assert.match(migration,/u30_same_client_prerequisite/u);
  assert.match(migration,/FOREIGN KEY \(session_id,client_id\)[\s\S]*?REFERENCES public\.sessions\(id,client_id\)/u);
  assert.match(migration,/FOREIGN KEY \(appointment_id,client_id,session_id\)[\s\S]*?REFERENCES public\.appointments\(id,client_id,session_id\)/u);
  assert.match(migration,/ON DELETE SET NULL \(appointment_id\)/u);
  assert.match(migration,/UNIQUE \(session_id,local_date\)/u);
  assert.match(migration,/u30_clock_consistency_check/u);
  assert.match(migration,/u30_occurrence_source_protected/u);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/u);
  assert.match(migration,/REVOKE ALL ON TABLE[\s\S]*?FROM PUBLIC,anon,authenticated,service_role/u);
  assert.doesNotMatch(migration,/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)[\s\S]*?TO\s+(?:anon|authenticated)/iu);
  assert.match(migration,/ADD COLUMN occurrence_id uuid/u);
  assert.match(migration,/WHERE occurrence_id IS NOT NULL/u);
  assert.doesNotMatch(migration,/\bUPDATE public\.|\bTRUNCATE\b|\bDELETE FROM public\./iu);
  assert.match(rollback,/NOT EXISTS \(SELECT 1 FROM public\.training_session_occurrences_v1\)/u);
  assert.match(rollback,/WHERE occurrence_id IS NOT NULL/u);
});
