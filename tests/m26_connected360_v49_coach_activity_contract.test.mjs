import test from 'node:test';
import assert from 'node:assert/strict';
import {connected360CoachActivityParams,connected360CoachConsentParams,connected360CoachConsentStatusParams,verifyConnected360CoachExerciseDays,verifyConnected360CoachConsentStatus,verifyConnected360CoachConsentReceipt,verifyConnected360CoachRecipients,connected360RecipientDecision} from '../src/m26/wearables/v49-coach-activity-contract.js';
import {connected360ObservedDayContinuity} from '../src/m26/wearables/v46-production-summary.js';

const clientId='11111111-1111-4111-8111-111111111111',coachId='22222222-2222-4222-8222-222222222222',assignmentId='33333333-3333-4333-8333-333333333333';
const now=new Date('2026-11-28T18:00:00Z');
const valid=()=>({ok:true,schema:'iberfit.connected360.coach-exercise-days.v1',clientId,provider:'health_connect',coverage:'partial',periodStart:'2026-11-22',periodEnd:'2026-11-28',days:[{date:'2026-11-28',sports:['running','strength']},{date:'2026-11-27',sports:['running']}]});
test('coach read is exact client, current civil window and minimized response',()=>{
  const checked=verifyConnected360CoachExerciseDays(valid(),{clientId,now});
  assert.equal(checked.days.length,2);assert.ok(Object.isFrozen(checked.days[0].sports));
  assert.deepEqual(connected360CoachActivityParams(clientId),{p_client:clientId});
  for(const changed of [
    {...valid(),clientId:coachId},{...valid(),periodEnd:'2026-11-27'},{...valid(),periodStart:'2026-11-21'},
    {...valid(),provider:'apple_health'},{...valid(),extra:'secret'},
    {...valid(),days:[{date:'2026-11-28',sports:['running'],avgBpm:140}]},
    {...valid(),days:[{date:'2026-11-28',sports:['running','running']}]},
    {...valid(),days:[{date:'2026-11-28',sports:['swimming']}]},
    {...valid(),days:[{date:'2026-11-29',sports:['running']}]},
    {...valid(),days:[...valid().days].reverse()},
    {...valid(),days:[...valid().days,valid().days[1]]},
  ])assert.throws(()=>verifyConnected360CoachExerciseDays(changed,{clientId,now}),/M26_V49/);
  assert.deepEqual(verifyConnected360CoachExerciseDays({...valid(),days:[]},{clientId,now}).days,[]);
});
test('only explicit decision and matching revision receipt allow a consent transition',()=>{
  const params=connected360CoachConsentParams({coachId,assignmentId,expectedRevision:0,allow:true});
  assert.deepEqual(params,{p_coach:coachId,p_assignment:assignmentId,p_expected_revision:0,p_allow:true});
  assert.equal(verifyConnected360CoachConsentReceipt({ok:true,shared:true,revision:1},params).revision,1);
  assert.throws(()=>verifyConnected360CoachConsentReceipt({ok:true,shared:true,revision:0},params),/M26_V49/);
  assert.throws(()=>verifyConnected360CoachConsentReceipt({ok:true,shared:false,revision:1},params),/M26_V49/);
  assert.throws(()=>connected360CoachConsentParams({coachId,expectedRevision:0,allow:true}),/M26_V49/);
  assert.throws(()=>connected360CoachConsentParams({coachId,assignmentId,expectedRevision:0,allow:'true'}),/M26_V49/);
  const revoke=connected360CoachConsentParams({coachId,expectedRevision:1,allow:false});
  assert.equal(verifyConnected360CoachConsentReceipt({ok:true,shared:false,revision:2},revoke).shared,false);
  assert.equal(verifyConnected360CoachConsentReceipt({ok:true,shared:false,revision:1},revoke).revision,1);
  assert.deepEqual(connected360CoachConsentStatusParams(coachId),{p_coach:coachId});
  assert.equal(verifyConnected360CoachConsentStatus({ok:true,recorded:true,revision:1,purpose:'coaching-exercise-days-v1'}).recorded,true);
  assert.throws(()=>verifyConnected360CoachConsentStatus({ok:true,recorded:true,revision:0,purpose:'coaching-exercise-days-v1'}),/M26_V49/);
});
test('shared distinct-day continuity has no synthesized activity or automatic plan change',()=>{
  const observed=new Set(['2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27','2026-11-27']);
  const result=connected360ObservedDayContinuity(observed,new Set(observed),{now,source:'coach_authorized_activity'});
  assert.equal(result.days,5);assert.equal(result.discipline,'running');assert.equal(result.automaticPlanChange,false);
  assert.equal(result.interpretation,'presence_only');
  observed.delete('2026-11-25');
  assert.equal(connected360ObservedDayContinuity(observed,new Set(observed),{now,source:'coach_authorized_activity'}),null);
});

test('recipient list is exact, owner-bound and does not imply effective permission',()=>{
  const row={coachId,assignmentId,displayName:'Coach de prueba',eligible:true,recorded:false,effective:false,revision:0};
  const payload={ok:true,schema:'iberfit.connected360.coach-recipients.v1',clientId,purpose:'coaching-exercise-days-v1',recipients:[row]};
  const value=verifyConnected360CoachRecipients(payload,{clientId});
  assert.ok(Object.isFrozen(value.recipients[0]));
  assert.throws(()=>connected360RecipientDecision(value.recipients[0],true),/M26_V49/);
  assert.deepEqual(connected360RecipientDecision(value.recipients[0],true,{confirmed:true}),{coachId,assignmentId,expectedRevision:0,allow:true});
  assert.throws(()=>connected360RecipientDecision(value.recipients[0],false,{confirmed:true}),/M26_V49/);
  const retired={...row,assignmentId:null,eligible:false,recorded:true,revision:2};
  const old=verifyConnected360CoachRecipients({...payload,recipients:[retired]},{clientId});
  assert.equal(connected360RecipientDecision(old.recipients[0],false,{confirmed:true}).expectedRevision,2);
  assert.throws(()=>connected360RecipientDecision(old.recipients[0],true,{confirmed:true}),/M26_V49/);
  for(const invalid of [
    {...payload,clientId:coachId},{...payload,recipients:[row,row]},
    {...payload,recipients:[{...row,effective:true}]},
    {...payload,recipients:[{...retired,assignmentId}]},
    {...payload,recipients:[{...row,recorded:true}]},
    {...payload,recipients:[{...row,ownerUserId:clientId}]},
  ])assert.throws(()=>verifyConnected360CoachRecipients(invalid,{clientId}),/M26_V49/);
});
