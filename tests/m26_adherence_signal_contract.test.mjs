import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveAdherenceAlerts} from '../src/m26/engagement/adherence-engine.js';

const clientId='client-adherence-contract';
const now=new Date('2026-09-25T12:00:00.000Z');

function dateDaysAgo(days){
  const date=new Date(now);
  date.setUTCDate(date.getUTCDate()-days);
  return date.toISOString();
}

function appointments(daysAgo,count,completed){
  return Array.from({length:count},(_,index)=>({
    id:`${daysAgo}-${index}`,
    clientId,
    startAt:dateDaysAgo(daysAgo),
    status:index<completed?'completed':'scheduled',
  }));
}

test('adherence-low remains the stable signal id while trajectory carries the richer state',()=>{
  const state={
    collections:{
      appointments:[
        ...appointments(2,2,0),
        ...appointments(14,6,6),
        ...appointments(50,12,9),
      ],
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

  const alert=deriveAdherenceAlerts(state,clientId,{now})
    .find((item)=>item.id==='adherence-low');

  assert.ok(alert);
  assert.equal(alert.meta.trajectory.state,'recent_decline');
  assert.equal(alert.meta.trajectory.autoPrescription,false);
  assert.equal(alert.meta.trajectory.requiresCoachDecision,true);
});
