import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveCoachSelfLaunchJourney} from '../src/m26/rc39/view-model.js';

function coachState({identity,startedBy='coach-1',executionStatus='cerrada_confirmada'}={}){
  return {
    identity,
    hydration:{serverTime:'2026-09-24T13:00:00Z'},
    collections:{
      clients:[{id:'client-1',name:'Cliente'}],
      sessions:[{id:'session-1',clientId:'client-1',status:'publicado',publishedAt:'2026-09-23T12:00:00Z'}],
      appointments:[],
      sessionExecutions:[{
        id:'exec-1',
        clientId:'client-1',
        sessionId:'session-1',
        started_by:startedBy,
        execution_status:executionStatus,
        remote_confirmed_at:'2026-09-24T12:00:00Z',
      }],
      checkins:[],
      iriAssessments:[],
      wearableDailySummaries:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };
}

const identity={id:'coach-1',role:'coach',name:'Carlos',email:'coach@iberfit.cl',status:'active'};

test('authenticated Coach self journey can reach the same six-milestone ready state as Admin',()=>{
  const journey=deriveCoachSelfLaunchJourney({state:coachState({identity})});
  assert.equal(journey.ready,true);
  assert.equal(journey.completedCount,6);
  assert.equal(journey.percent,100);
  assert.equal(journey.profileVerified,true);
  assert.equal(journey.accountStatusVerified,true);
  assert.equal(journey.completedSessionEvidence,true);
});

test('missing own profile/account evidence keeps self readiness fail-closed',()=>{
  const journey=deriveCoachSelfLaunchJourney({state:coachState({identity:{...identity,email:'',status:''}})});
  assert.equal(journey.ready,false);
  assert.equal(journey.profileVerified,false);
  assert.equal(journey.accountStatusVerified,false);
});

test('execution performed by another Coach cannot satisfy the first-session milestone',()=>{
  const journey=deriveCoachSelfLaunchJourney({state:coachState({identity,startedBy:'coach-2'})});
  assert.equal(journey.ready,false);
  assert.equal(journey.milestones.find((item)=>item.id==='session').complete,false);
});

test('rejected execution cannot satisfy the first-session milestone',()=>{
  const journey=deriveCoachSelfLaunchJourney({state:coachState({identity,executionStatus:'cierre_rechazado'})});
  assert.equal(journey.ready,false);
  assert.equal(journey.milestones.find((item)=>item.id==='session').complete,false);
});
