import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAppleExerciseStatus,appleExerciseConsentParams,verifyAppleExerciseConsentReceipt} from '../src/m26/wearables/v53-apple-authorization-contract.js';
const old='00000000-0000-4000-8000-000000000001',fresh='00000000-0000-4000-8000-000000000002';
const base={ok:true,provider:'apple_health',serverEnabled:true,authorized:false,reason:'consent-required',grantId:old,revocationCursor:8,scopes:[]};
const active={...base,authorized:true,reason:'authorized',scopes:['exerciseSessions']};
test('stale grant is CAS input, never authorization',()=>{
 assert.equal(verifyAppleExerciseStatus(base).authorized,false);
 assert.throws(()=>appleExerciseConsentParams(base));
 assert.deepEqual(appleExerciseConsentParams(base,{confirmed:true}),{p_expected_grant:old,p_expected_cursor:8,p_confirmed:true});
});
test('disabled, blocked and conflicting permissions forbid authorization',()=>{
 for(const status of [{...base,serverEnabled:false,reason:'release-disabled'},{...base,reason:'connection-blocked'},{...base,reason:'scope-conflict'}]){
  assert.equal(verifyAppleExerciseStatus(status).authorized,false);
  assert.throws(()=>appleExerciseConsentParams(status,{confirmed:true}));
 }
});
test('reject provider mixing, invented scope, malformed or inconsistent status',()=>{
 for(const v of [{...base,provider:'health_connect'},{...base,authorized:true},{...base,revocationCursor:'8'},{...base,revocationCursor:Number.MAX_SAFE_INTEGER+1},{...base,scopes:['generalHeartRate']},{...active,grantId:null},{...active,scopes:['exerciseSessions','generalHeartRate']},{...base,extra:true}])assert.throws(()=>verifyAppleExerciseStatus(v));
});
test('exact acknowledgement permits new grant or idempotent current grant only',()=>{
 const params=appleExerciseConsentParams(base,{confirmed:true});
 const ack={ok:true,provider:'apple_health',grantId:fresh,revocationCursor:8,scopes:['exerciseSessions'],alreadyAuthorized:false};
 assert.equal(verifyAppleExerciseConsentReceipt(ack,params).grantId,fresh);
 assert.equal(verifyAppleExerciseConsentReceipt({...ack,grantId:old,alreadyAuthorized:true},params).grantId,old);
 for(const v of [{...ack,revocationCursor:9},{...ack,grantId:old},{...ack,alreadyAuthorized:true},{...ack,provider:'health_connect'},{...ack,scopes:['exerciseSessions','sleepMinutes']}])assert.throws(()=>verifyAppleExerciseConsentReceipt(v,params));
});
