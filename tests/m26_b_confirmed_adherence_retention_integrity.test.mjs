import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedAdherenceEvidence} from '../src/m26/engagement/confirmed-adherence.js';
import {__retentionHealthInternals} from '../src/m26/engagement/retention-health.js';
import {buildProgressHub} from '../src/m26/engagement/progress-hub.js';
import {buildAdherenceWindows,reusableConfirmedSummary} from '../src/m26/engagement/progress-continuity.js';

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

test('B: wearable current data requires a single comparable provider and consistent day counts',()=>{
 const base={daysWithData:3,freshness:'reciente',decision:{eligible:true,currentEvidenceDays:2,historicalContextDays:1,freshness:'reciente',quality:'alta',providers:['normalized_file']}};
 assert.equal(__retentionHealthInternals.activityFactor({wearable:base}).status,'green');
 const input={collections:{}};
 const hub=wearable=>buildProgressHub(input,'c1',{now:new Date('2026-11-10T18:00:00Z'),summaries:{28:{clientId:'c1',days:28,checkins:false,plannedSessions:0,completedSessions:0,adherence:null,wearable,iriAssessmentCount:0}}});
 assert.equal(hub(base).pillars.find(p=>p.id==='activity').status,'strong');
 assert.equal(hub(base).pillars.find(p=>p.id==='wellbeing').status,'insufficient','boolean is never a check-in count');
 for(const decision of [{providers:[]},{providers:['one','two']},{currentEvidenceDays:5},{currentEvidenceDays:true},{eligible:false}]){
  const changed={...base,decision:{...base.decision,...decision}};
  assert.equal(__retentionHealthInternals.activityFactor({wearable:changed}).status,'insufficient');
  assert.equal(hub(changed).pillars.find(p=>p.id==='activity').status,'insufficient');
 }
});
test('B: two old wearable days are not proof of recent activity or loss of adherence',()=>{
 const wearable={daysWithData:4,freshness:'atrasada',decision:{eligible:false,currentEvidenceDays:0,providers:[]}};
 const a=__retentionHealthInternals.activityFactor({wearable});
 assert.equal(a.status,'insufficient');
 assert.match(a.evidence,/disponibles/);
 assert.equal(__retentionHealthInternals.feedbackFactor({checkins:true},[]).status,'insufficient');
});

import {sessionExecutionIsConfirmed,confirmedSessionExecutionsForClient} from '../src/m26/domain/session-execution-truth.js';
import {deriveAdherenceAlerts,deriveAdherenceTrajectoryFromSummaries} from '../src/m26/engagement/adherence-engine.js';

const NOW_B=new Date('2026-11-10T20:00:00Z');
function bState(executions,appointments=[],pendingOperations=[]){
 return {collections:{appointments,sessionExecutions:executions,sessions:[],trainingCycles:[],
   checkins:[],iriAssessments:[],wearableDailySummaries:[],wearableConnections:[]},
   pendingOperations,conflicts:[],rejectedOperations:[]};
}
test('B: canonical truth rejects explicitly unconfirmed, contradictory typed and unacknowledged closures',()=>{
 const one={id:'e1',clientId:'c1',status:'completed',syncStatus:'clean',
  completedAt:'2026-11-09T10:00:00Z'};
 assert.equal(sessionExecutionIsConfirmed(one),true);
 for(const patch of [
  {serverConfirmed:false},{execution_status:'en_curso'},
  {execution_status:'cerrada_confirmada'},
  {execution_status:'cerrada_confirmada',remote_confirmed_at:'not-a-time'},
 ]){
  const wrong={...one,...patch};
  assert.equal(sessionExecutionIsConfirmed(wrong),false,JSON.stringify(patch));
  assert.equal(confirmedSessionExecutionsForClient(
    bState([wrong]),'c1',{requireCompleted:true}).length,0,JSON.stringify(patch));
 }
 const real={...one,execution_status:'cerrada_confirmada',
  remote_confirmed_at:'2026-11-09T11:00:00Z'};
 assert.equal(sessionExecutionIsConfirmed(real),true);
 assert.equal(confirmedSessionExecutionsForClient(bState([real]),'c1',{requireCompleted:true}).length,1);
});
test('B: pending, rejected and other-client feedback cannot produce a Coach pain alert',()=>{
 const base={id:'e1',clientId:'c1',status:'completed',syncStatus:'clean',
  completedAt:'2026-11-09T10:00:00Z',feedback:{pain:true}};
 for(const patch of [{syncStatus:'pending'},{serverConfirmed:false},
   {execution_status:'cerrada_confirmada'},
   {execution_status:'en_curso'},
 ]){
  const alerts=deriveAdherenceAlerts(bState([{...base,...patch}]),'c1',{now:NOW_B});
  assert.equal(alerts.some(a=>a.id==='post-session-discomfort'),false,JSON.stringify(patch));
 }
 const foreign={...base,id:'other',clientId:'c2'};
 assert.equal(deriveAdherenceAlerts(bState([foreign]),'c1',{now:NOW_B})
   .some(a=>a.id==='post-session-discomfort'),false);
 const real={...base,execution_status:'cerrada_confirmada',
  remote_confirmed_at:'2026-11-09T10:10:00Z'};
 assert.equal(deriveAdherenceAlerts(bState([real]),'c1',{now:NOW_B})
   .some(a=>a.id==='post-session-discomfort'),true);
 const once=[{id:'a1',clientId:'c1',status:'confirmada',scheduledAt:'2026-11-08T08:00:00Z'}];
 assert.equal(deriveAdherenceAlerts(bState([real],once),'c1',{now:NOW_B})
  .some(a=>a.id==='no-completions'),false,
 'one booking is insufficient evidence for a critical continuity alarm');
 const recurring=[...once,
  {id:'a2',clientId:'c1',status:'confirmada',scheduledAt:'2026-11-07T08:00:00Z'},
  {id:'a3',clientId:'c1',status:'confirmada',scheduledAt:'2026-11-06T08:00:00Z'}];
 assert.equal(deriveAdherenceAlerts(bState([real],recurring),'c1',{now:NOW_B})
  .some(a=>a.id==='no-completions'),true,
 'three unfulfilled bookings still require Coach review despite autonomous activity');
});
test('B: pending completion command prevents fabricated post-session feedback',()=>{
 const execution={id:'e1',clientId:'c1',status:'completed',syncStatus:'clean',
  completedAt:'2026-11-09T10:00:00Z',feedback:{pain:true}};
 const blocked=bState([execution],[],[{type:'EJECUCION_COMPLETAR',entityId:'e1'}]);
 assert.equal(deriveAdherenceAlerts(blocked,'c1',{now:NOW_B})
  .some(a=>a.id==='post-session-discomfort'),false);
});
test('B: 7/28/90 trajectory quarantines counts and ratios that do not agree',()=>{
 const s=(days,completed,planned,adherence)=>({
  clientId:'c1',days,scheduledCompletedSessions:completed,
  completedSessions:completed+5,plannedSessions:planned,adherence,
 });
 const actual=deriveAdherenceTrajectoryFromSummaries({
  d7:s(7,1,1,1),d28:s(28,4,4,0.2),d90:s(90,5,8,0.625),
 });
 assert.equal(actual.status,'insufficient');
 assert.equal(actual.windows.d28.evidence,false);
 assert.equal(actual.windows.d28.adherence,null);
 assert.equal(actual.windows.d7.adherence,1);
 assert.equal(actual.windows.d90.adherence,0.625);
});

test('B: booked 7/28/90 adherence cannot be inflated by autonomous activity',()=>{
 const now=new Date('2026-11-10T20:00:00Z');
 const execution=idx=>({id:'e'+idx,clientId:'c1',status:'completed',syncStatus:'clean',
  completedAt:'2026-11-09T11:00:00Z',appointmentId:null});
 const state={collections:{appointments:[{id:'a1',clientId:'c1',status:'confirmada',
   startAt:'2026-11-09T10:00:00Z'}],sessionExecutions:[1,2,3,4].map(execution),
   iriAssessments:[],checkins:[],wearableDailySummaries:[],sessions:[],trainingCycles:[]}};
 const windows=buildAdherenceWindows(state,'c1',{now});
 assert.deepEqual(windows.map(x=>x.plannedSessions),[1,1,1]);
 assert.deepEqual(windows.map(x=>x.completedSessions),[0,0,0]);
 assert.deepEqual(windows.map(x=>x.activityCompletedSessions),[4,4,4]);
 assert.deepEqual(windows.map(x=>x.adherence),[0,0,0]);
 const hub=buildProgressHub(state,'c1',{now});
 const consistency=hub.pillars.find(x=>x.id==='consistency');
 assert.equal(consistency.value,0);assert.match(consistency.evidence,/0 de 1 citas programadas cumplidas/);
});
test('B: wrong-client or contradictory cached 28-day progress is ignored and recomputed',()=>{
 const base={clientId:'c1',days:28,plannedSessions:2,completedSessions:2,scheduledCompletedSessions:1,adherence:0.5};
 assert.equal(reusableConfirmedSummary(base,'c1',28),base);
 for(const candidate of [
  {...base,clientId:'c2'}, {...base,days:90}, {...base,adherence:1},
  {...base,scheduledCompletedSessions:3}, {...base,plannedSessions:true},
  {...base,adherence:NaN}, {...base,adherence:2},
 ])assert.equal(reusableConfirmedSummary(candidate,'c1',28),null);
 const state={collections:{appointments:[],sessionExecutions:[],iriAssessments:[],
  checkins:[],wearableDailySummaries:[],sessions:[],trainingCycles:[]}};
 const now=new Date('2026-11-10T20:00:00Z');
 const forged={...base,scheduledCompletedSessions:2,adherence:1};
 const windows=buildAdherenceWindows(state,'c1',{now,windows:[28],summaries:{28:forged}});
 // Internally consistent but stale cache is acceptable: freshness is governed by
 // the caller's snapshot revision. Contradictory data must never be accepted.
 assert.equal(windows[0].adherence,1);
 const inconsistent={...base,scheduledCompletedSessions:2,adherence:0.25};
 const rejected=buildAdherenceWindows(state,'c1',{now,windows:[28],summaries:{28:inconsistent}});
 assert.equal(rejected[0].adherence,null);assert.equal(rejected[0].hasPlan,false);
 const hub=buildProgressHub(state,'c1',{now,summaries:{28:inconsistent}});
 assert.equal(hub.pillars.find(x=>x.id==='consistency').status,'insufficient');
});
