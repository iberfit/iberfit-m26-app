import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdherenceTrajectory,
  deriveAdherenceAlerts,
  buildCoachFollowUpPlan,
} from '../src/m26/engagement/adherence-engine.js';

const NOW=new Date('2026-09-25T12:00:00.000Z');
const CLIENT='client-adherence';

function isoDaysAgo(days){
  const date=new Date(NOW);
  date.setUTCDate(date.getUTCDate()-days);
  return date.toISOString();
}

function appointment(daysAgo,status='scheduled',index=0){
  return {
    id:`appointment-${daysAgo}-${index}`,
    clientId:CLIENT,
    startAt:isoDaysAgo(daysAgo),
    status,
  };
}

function group(daysAgo,count,completed){
  return Array.from({length:count},(_,index)=>
    appointment(daysAgo,statusFor(index,completed),index)
  );
}

function statusFor(index,completed){
  return index<completed?'completed':'scheduled';
}

function stateWithAppointments(appointments=[]){
  return {
    collections:{
      appointments,
      sessionExecutions:[],
      checkins:[],
      iriAssessments:[],
      wearableDailySummaries:[],
      trainingCycles:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };
}

test('classifies a short-term drop without overstating a long-term decline',()=>{
  const state=stateWithAppointments([
    ...group(2,2,0),
    ...group(14,6,6),
    ...group(50,12,9),
  ]);
  const trajectory=buildAdherenceTrajectory(state,CLIENT,{now:NOW});
  assert.equal(trajectory.state,'recent_decline');
  assert.equal(trajectory.windows.d7.adherence,0);
  assert.equal(trajectory.windows.d28.adherence,0.75);
  assert.equal(trajectory.windows.d90.adherence,0.75);
  assert.equal(trajectory.autoPrescription,false);
  assert.equal(trajectory.requiresCoachDecision,true);
});

test('classifies a sustained decline only when short and medium windows both deteriorate',()=>{
  const state=stateWithAppointments([
    ...group(2,2,0),
    ...group(14,4,2),
    ...group(50,10,8),
  ]);
  const trajectory=buildAdherenceTrajectory(state,CLIENT,{now:NOW});
  assert.equal(trajectory.state,'sustained_decline');
  assert.ok(trajectory.deltas.d7VsD28<=-0.15);
  assert.ok(trajectory.deltas.d28VsD90<=-0.1);
});

test('recognizes recovery when the last 7 days improve meaningfully over 28 days',()=>{
  const state=stateWithAppointments([
    ...group(2,2,2),
    ...group(14,6,2),
    ...group(50,6,3),
  ]);
  const trajectory=buildAdherenceTrajectory(state,CLIENT,{now:NOW});
  assert.equal(trajectory.state,'recovering');
  assert.equal(trajectory.windows.d7.adherence,1);
  assert.ok(trajectory.deltas.d7VsD28>=0.15);
});

test('keeps a stable trajectory neutral when window differences are small',()=>{
  const state=stateWithAppointments([
    ...group(2,2,2),
    ...group(14,5,4),
    ...group(50,3,3),
  ]);
  const trajectory=buildAdherenceTrajectory(state,CLIENT,{now:NOW});
  assert.equal(trajectory.state,'stable');
  assert.ok(Math.abs(trajectory.deltas.d7VsD28)<0.15);
  assert.ok(Math.abs(trajectory.deltas.d28VsD90)<0.15);
});

test('distinguishes persistently low adherence from a new decline',()=>{
  const state=stateWithAppointments([
    ...group(2,2,1),
    ...group(14,2,1),
    ...group(50,6,3),
  ]);
  const trajectory=buildAdherenceTrajectory(state,CLIENT,{now:NOW});
  assert.equal(trajectory.state,'low_sustained');
  const alerts=deriveAdherenceAlerts(state,CLIENT,{now:NOW});
  const adherenceAlert=alerts.find((item)=>item.id==='adherence-low');
  assert.ok(adherenceAlert);
  assert.equal(adherenceAlert.meta.trajectory.state,'low_sustained');
  const followUp=buildCoachFollowUpPlan([adherenceAlert]);
  assert.equal(followUp.signalId,'adherence-low');
  assert.equal(followUp.requiresCoachDecision,true);
  assert.equal(followUp.autoPrescription,false);
});

test('does not manufacture a trend when planned-session evidence is insufficient',()=>{
  const state=stateWithAppointments([
    ...group(2,1,1),
    ...group(14,1,1),
  ]);
  const trajectory=buildAdherenceTrajectory(state,CLIENT,{now:NOW});
  assert.equal(trajectory.state,'insufficient');
  assert.deepEqual(trajectory.evidence.comparableWindows,[]);
  const alerts=deriveAdherenceAlerts(state,CLIENT,{now:NOW});
  assert.equal(alerts.some((item)=>item.id.startsWith('adherence-')),false);
});

test('recovery remains informational and actionable without being treated as a warning',()=>{
  const state=stateWithAppointments([
    ...group(2,2,2),
    ...group(14,6,2),
    ...group(50,6,3),
  ]);
  const alerts=deriveAdherenceAlerts(state,CLIENT,{now:NOW});
  const recovery=alerts.find((item)=>item.id==='adherence-recovering');
  assert.ok(recovery);
  assert.equal(recovery.severity,'info');
  assert.match(recovery.detail,/7d/);
  assert.match(recovery.detail,/28d/);
  assert.match(recovery.detail,/90d/);
});
