import test from 'node:test';
import assert from 'node:assert/strict';
import {coachRestTransitionEligible,restRemainingSeconds} from '../src/m26/workflows/session-timer.js';

test('automatic rest transition is allowed only for active confirmed Coach work',()=>{
 const context={actor:{role:'coach'},execution:{status:'active',syncStatus:'clean'}};
 assert.equal(coachRestTransitionEligible(context),true);
 assert.equal(coachRestTransitionEligible(context,{busy:true}),false);
 assert.equal(coachRestTransitionEligible(context,{hidden:true}),false);
 for(const patch of [{status:'paused'},{status:'completed'},{syncStatus:'pending'},{syncStatus:'rejected'},{pendingOperationIds:['write']},{reviewingHistory:true}]){
  assert.equal(coachRestTransitionEligible({...context,execution:{...context.execution,...patch}}),false);
 }
 for(const role of ['client','admin',''])assert.equal(coachRestTransitionEligible({...context,actor:{role}}),false);
});
test('returning from suspension uses wall clock and never negative or stale countdown',()=>{
 const at=Date.parse('2026-11-24T18:00:00Z');
 const execution={restUntil:new Date(at+60000).toISOString()};
 assert.equal(restRemainingSeconds(execution,at),60);
 assert.equal(restRemainingSeconds(execution,at+15000),45);
 assert.equal(restRemainingSeconds(execution,at+61000),0);
});
