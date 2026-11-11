import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedAdherenceEvidence} from '../src/m26/engagement/confirmed-adherence.js';
import {__retentionHealthInternals} from '../src/m26/engagement/retention-health.js';

const appointment=(id,status='confirmada')=>({id,sessionId:'session-a',status,revision:2});
const completion=(id,more={})=>({
 id,sessionId:'session-a',appointmentId:'a1',revision:2,
 status:'completed',syncStatus:'clean',completedAt:'2026-11-10T10:00:00Z',
 ...more,
});
test('B baseline: confirmed exercise fulfils its own booked date and avoids double count',()=>{
 const actual=confirmedAdherenceEvidence({appointments:[appointment('a1'),appointment('a2')],
  executions:[completion('e1'),completion('e1')]});
 assert.equal(actual.plannedSessions,2);
 assert.equal(actual.scheduledCompleted,1);
 assert.equal(actual.completedSessions,1);
 assert.equal(actual.adherence,0.5);
 assert.equal(actual.linkedExecutions,1);
});
test('B: pending, open, declined, unacknowledged and rejected workouts never become completed activity',()=>{
 for(const patch of [
  {status:'active'}, {status:'en_curso'}, {status:'cancelled'},
  {syncStatus:'pending'}, {syncStatus:'rejected'}, {syncStatus:'conflict'},
  {serverConfirmed:false}, {execution_status:'cerrada_confirmada'},
  {status:'completed',execution_status:'en_curso'},
  {status:'completed',execution_status:'cerrada_confirmada',remote_confirmed_at:'garbage'},
 ]){
  const actual=confirmedAdherenceEvidence({appointments:[appointment('a1')],executions:[completion('e1',patch)]});
  assert.equal(actual.scheduledCompleted,0,JSON.stringify(patch));
  assert.equal(actual.completedSessions,0,JSON.stringify(patch));
  assert.equal(actual.adherence,0,JSON.stringify(patch));
  assert.equal(actual.unconfirmedExecutions,1,JSON.stringify(patch));
 }
});
test('B: typed confirmed PostgreSQL receipt matches a verified canonical completion',()=>{
 const typed=completion('e1',{status:'completada',execution_status:'cerrada_confirmada',
  remote_confirmed_at:'2026-11-10T10:10:00Z'});
 const actual=confirmedAdherenceEvidence({appointments:[appointment('a1')],executions:[typed]});
 assert.equal(actual.scheduledCompleted,1);
 assert.equal(actual.unconfirmedExecutions,0);
});
test('B: contradictory versions of the same execution at the same revision are quarantined',()=>{
 const ok=completion('e1');
 const bad=completion('e1',{syncStatus:'pending'});
 for(const order of [[ok,bad],[bad,ok]]){
  const actual=confirmedAdherenceEvidence({appointments:[appointment('a1')],executions:order});
  assert.equal(actual.scheduledCompleted,0);
  assert.equal(actual.completedSessions,0);
  assert.equal(actual.conflictingExecutions,1);
 }
});
test('B: a newer verified version supersedes older pending; an older pending never beats newer verified',()=>{
 const old=completion('e1',{revision:1,syncStatus:'pending'});
 const newer=completion('e1',{revision:3,syncStatus:'clean'});
 for(const order of [[old,newer],[newer,old]]){
  const actual=confirmedAdherenceEvidence({appointments:[appointment('a1')],executions:order});
  assert.equal(actual.scheduledCompleted,1);
  assert.equal(actual.conflictingExecutions,0);
 }
});
test('B: standalone exercises do not fake adherence to a different booking',()=>{
 const actual=confirmedAdherenceEvidence({appointments:[appointment('a1')],
  executions:[completion('e1',{appointmentId:null})]});
 assert.equal(actual.plannedSessions,1);
 assert.equal(actual.scheduledCompleted,0);
 assert.equal(actual.completedSessions,1);
 assert.equal(actual.standaloneExecutions,1);
 assert.equal(actual.adherence,0);
});
test('B: retention Coach headline uses booked attendance, not autonomous volume',()=>{
 const result=__retentionHealthInternals.adherenceFactor({
  plannedSessions:4,completedSessions:9,scheduledCompletedSessions:0,adherence:0,
  dataQuality:'media',
 });
 assert.equal(result.status,'red');
 assert.match(result.evidence,/0 de 4 sesiones confirmadas/);
});
test('B: contradictory or absent adherence is insufficient evidence, not churn risk',()=>{
 for(const item of [
  {plannedSessions:4,completedSessions:5,scheduledCompletedSessions:5,adherence:1},
  {plannedSessions:4,completedSessions:4,scheduledCompletedSessions:2,adherence:1},
  {plannedSessions:4,completedSessions:0,scheduledCompletedSessions:0,adherence:null},
 ]){
  const result=__retentionHealthInternals.adherenceFactor(item);
  assert.equal(result.status,'insufficient');
 }
});
