import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSessionExecutionsForClient,confirmedSessionExecutionsForClient} from '../src/m26/domain/session-execution-truth.js';
import {computeProgressSummary,buildExerciseLongitudinalProgress} from '../src/m26/engagement/progress-engine.js';
import {confirmedAdherenceEvidence} from '../src/m26/engagement/confirmed-adherence.js';

const now=new Date('2026-11-11T12:00:00Z');
const completion=(patch={})=>({
  id:'execution-one',clientId:'client-one',sessionId:'session-one',
  appointmentId:'appointment-one',revision:4,status:'completed',
  syncStatus:'clean',completedAt:'2026-11-10T10:00:00Z',
  results:[{exerciseId:'squat',reps:5,loadKg:40,rpe:7}],
  ...patch,
});
const appointment=(patch={})=>({
  id:'appointment-one',clientId:'client-one',sessionId:'session-one',
  status:'confirmada',startAt:'2026-11-10T09:00:00Z',revision:4,...patch,
});
function state(executions,appointments=[appointment()]){
  return {collections:{sessionExecutions:executions,appointments,sessions:[],
    trainingCycles:[],iriAssessments:[],checkins:[],wearableDailySummaries:[],
    wearableConnections:[]},pendingOperations:[],conflicts:[],rejectedOperations:[]};
}
test('same execution ID and revision with contradictory measurements is quarantined in every order',()=>{
  const a=completion(),b=completion({results:[{exerciseId:'squat',reps:5,loadKg:80,rpe:9}]});
  for(const executions of [[a,b],[b,a]]){
    const input=state(executions);
    assert.equal(reconcileSessionExecutionsForClient(input,'client-one').conflicts.length,1);
    assert.equal(confirmedSessionExecutionsForClient(input,'client-one').length,0);
    const summary=computeProgressSummary(input,'client-one',{now,days:28});
    assert.equal(summary.confirmedWorkoutExecutions,0);
    assert.equal(summary.pendingConfirmationWorkouts,1);
    assert.equal(summary.evidenceConflicts,1);
    assert.equal(summary.scheduledCompletedSessions,0);
    assert.equal(summary.volume,null);
    assert.equal(summary.averageRpe,null);
    assert.equal(buildExerciseLongitudinalProgress(input,'client-one').totalExecutions,0);
  }
});
test('same-ID equal-revision duplicates with reordered JSON properties count once',()=>{
  const a=completion();
  const b=completion({results:[{rpe:7,loadKg:40,reps:5,exerciseId:'squat'}]});
  for(const executions of [[a,b],[b,a]]){
    const input=state(executions);
    assert.equal(reconcileSessionExecutionsForClient(input,'client-one').conflicts.length,0);
    assert.equal(confirmedSessionExecutionsForClient(input,'client-one').length,1);
    const summary=computeProgressSummary(input,'client-one',{now});
    assert.equal(summary.confirmedWorkoutExecutions,1);
    assert.equal(summary.scheduledCompletedSessions,1);
    assert.equal(summary.pendingConfirmationWorkouts,0);
  }
});
test('newer pending revision supersedes stale success; newer success clears old conflict',()=>{
  const old=completion({revision:2});
  const staleConflict=completion({revision:2,results:[{exerciseId:'squat',reps:99}]});
  const pending=completion({revision:5,syncStatus:'pending'});
  for(const executions of [[old,staleConflict,pending],[pending,staleConflict,old]]){
    const input=state(executions);
    const reconciliation=reconcileSessionExecutionsForClient(input,'client-one');
    assert.equal(reconciliation.conflicts.length,0);
    assert.equal(confirmedSessionExecutionsForClient(input,'client-one').length,0);
    assert.equal(computeProgressSummary(input,'client-one',{now}).pendingConfirmationWorkouts,1);
  }
  const latest=completion({revision:6});
  const result=computeProgressSummary(state([old,staleConflict,pending,latest]),'client-one',{now});
  assert.equal(result.confirmedWorkoutExecutions,1);
  assert.equal(result.pendingConfirmationWorkouts,0);
});
test('explicit no-show differs from technical uncertainty and never fabricates activity',()=>{
  const missing=confirmedAdherenceEvidence({appointments:[appointment({status:'ausencia_cliente'})]});
  assert.equal(missing.missedAppointments,1);
  assert.equal(missing.confirmedWorkouts,0);
  const booking=state([completion({syncStatus:'pending'})]);
  const pending=computeProgressSummary(booking,'client-one',{now});
  assert.equal(pending.explicitlyMissedAppointments,0);
  assert.equal(pending.pendingConfirmationWorkouts,1);
  assert.equal(pending.confirmedWorkoutExecutions,0);
});
test('same-ID/revision appointment conflict does not depend on arrival order',()=>{
  const ok=appointment(),noShow=appointment({status:'ausencia_cliente'});
  for(const appointments of [[ok,noShow],[noShow,ok]]){
    const result=computeProgressSummary(state([completion()],appointments),'client-one',{now});
    assert.equal(result.adherenceEvidence.conflictingAppointments,1);
    assert.equal(result.explicitlyMissedAppointments,0);
    assert.equal(result.scheduledCompletedSessions,0);
  }
});
test('client scope prevents identical IDs belonging to another Client from contaminating statistics',()=>{
  const c2=completion({clientId:'client-two',results:[{exerciseId:'squat',reps:9,loadKg:99}]});
  const input=state([c2,completion()]);
  assert.equal(computeProgressSummary(input,'client-one',{now}).confirmedWorkoutExecutions,1);
  assert.equal(computeProgressSummary(input,'client-two',{now}).confirmedWorkoutExecutions,1);
});
