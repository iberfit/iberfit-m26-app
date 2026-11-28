import test from 'node:test';
import assert from 'node:assert/strict';
import {createM26Transport,M26_QA_PROJECT_REF,M26_PRODUCTION_PROJECT_REF} from '../src/m26/supabase-transport.js';
import {reportCivilDate} from '../src/m26/domain/civil-date.js';
import {verifyConnected360AppleCoachExerciseDays,verifyConnected360AppleCoachRecipients,verifyConnected360AppleCoachConsentReceipt,verifyConnected360AppleCoachTrendConsentReceipt,verifyConnected360AppleCoachTrendRecipients,verifyConnected360AppleCoachTrends,verifyConnected360CoachExerciseDays,verifyConnected360CoachRecipients,connected360MultiProviderCoachActivityView} from '../src/m26/wearables/v49-coach-activity-contract.js';
const clientId='11111111-1111-4111-8111-111111111111',coachId='22222222-2222-4222-8222-222222222222',assignmentId='33333333-3333-4333-8333-333333333333';
const token='synthetic-test-jwt';
const now=new Date('2026-11-28T18:00:00Z');
function daysDto(provider,dates=[],clock=now){
 const end=reportCivilDate(clock),start=new Date(end+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-6);
 return {ok:true,schema:provider==='apple_health'?'iberfit.connected360.apple-coach-exercise-days.v1':'iberfit.connected360.coach-exercise-days.v1',clientId,provider,coverage:'partial',periodStart:start.toISOString().slice(0,10),periodEnd:end,days:dates};
}
const recipients=()=>({ok:true,schema:'iberfit.connected360.apple-coach-recipients.v1',provider:'apple_health',clientId,purpose:'coaching-apple-exercise-days-v1',recipients:[{coachId,assignmentId,displayName:'Coach',eligible:true,recorded:false,effective:false,revision:0}]});
const trendPurpose='coaching-apple-trends-v1';
const trendRecipients=()=>({...recipients(),schema:'iberfit.connected360.apple-coach-trend-recipients.v1',purpose:trendPurpose});
function trendDto(days,clock=now){
 const end=reportCivilDate(clock),shift=n=>{const d=new Date(end+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 return {ok:true,schema:'iberfit.connected360.apple-coach-trends.v1',provider:'apple_health',clientId,purpose:trendPurpose,windowDays:days,coverage:'observed-only',
 periods:[0,1].map(index=>({kind:index?'previous':'recent',periodStart:shift(-(index+1)*days),periodEnd:shift(-1-index*days),observedDays:2,disciplines:[{sport:'running',observedDays:2}]}))};
}
const decision={coachId,assignmentId,expectedRevision:0,allow:true};
const qa={enabled:true,qaOnly:true,host:'m26-canary.iberfit.cl',canary:true,projectRef:M26_QA_PROJECT_REF,url:'https://'+M26_QA_PROJECT_REF+'.supabase.co',publishableKey:'sb_publishable_QA_test_not_a_real_key'};
const prod={enabled:true,qaOnly:false,host:'app.iberfit.cl',projectRef:M26_PRODUCTION_PROJECT_REF,url:'https://'+M26_PRODUCTION_PROJECT_REF+'.supabase.co',publishableKey:'sb_publishable_PROD_test_not_a_real_key'};
function fixture(runtime=qa,enabled=true,override=null){
 const calls=[];
 const transport=createM26Transport(runtime,{connected360AppleCandidate:enabled,fetchImpl:async(url,init)=>{
  const path=new URL(url).pathname,body=JSON.parse(init.body);
  calls.push({path,body,method:init.method,authorization:init.headers.authorization});
  let result=path.endsWith('my_apple_coach_trend_recipients_v1')?trendRecipients():path.endsWith('set_apple_coach_trend_consent_v1')?{ok:true,provider:'apple_health',purpose:trendPurpose,shared:body.p_allow,revision:body.p_expected_revision+1}:path.endsWith('apple_coach_trends_v1')?trendDto(body.p_days,new Date()):path.endsWith('my_apple_coach_recipients_v1')?recipients():path.endsWith('set_apple_coach_consent_v1')?{ok:true,provider:'apple_health',shared:body.p_allow,revision:body.p_expected_revision+1}:daysDto('apple_health',[],new Date());
  if(override)result=override(result);
  return {ok:true,status:200,headers:{get:k=>k==='content-type'?'application/json':null},json:async()=>result};
 }});
 return {transport,calls};
}
test('V56 exact provider DTOs cannot be interpreted as Health Connect or another client',()=>{
 const apple=daysDto('apple_health',[{date:'2026-11-28',sports:['running']}]);
 assert.equal(verifyConnected360AppleCoachExerciseDays(apple,{clientId,now}).provider,'apple_health');
 assert.throws(()=>verifyConnected360CoachExerciseDays(apple,{clientId,now}));
 assert.throws(()=>verifyConnected360AppleCoachExerciseDays({...apple,clientId:coachId},{clientId,now}));
 assert.throws(()=>verifyConnected360AppleCoachExerciseDays({...apple,days:[{...apple.days[0],distance:1000}]},{clientId,now}));
 assert.equal(verifyConnected360AppleCoachRecipients(recipients(),{clientId}).recipients.length,1);
 assert.throws(()=>verifyConnected360CoachRecipients(recipients(),{clientId}));
 assert.throws(()=>verifyConnected360AppleCoachRecipients({...recipients(),purpose:'coaching-exercise-days-v1'},{clientId}));
 assert.throws(()=>verifyConnected360AppleCoachConsentReceipt({ok:true,provider:'health_connect',shared:true,revision:1},{p_allow:true,p_expected_revision:0}));
});
test('V56 union retains provenance, deduplicates date/sport and keeps partial coverage',()=>{
 const apple=daysDto('apple_health',[{date:'2026-11-28',sports:['running']},{date:'2026-11-27',sports:['interval_running']},{date:'2026-11-26',sports:['running']}]);
 const hc=daysDto('health_connect',[{date:'2026-11-28',sports:['interval_running']},{date:'2026-11-25',sports:['running']},{date:'2026-11-24',sports:['running']}]);
 const view=connected360MultiProviderCoachActivityView([apple,hc],{clientId,now});
 assert.equal(view.days.length,5);assert.equal(view.days[0].sports.length,1);
 assert.deepEqual(view.days[0].sports[0].providers,['apple_health','health_connect']);
 assert.equal(view.cue.days,5);assert.equal(view.cue.discipline,'running');assert.equal(view.coverage,'partial');assert.equal(view.automaticPlanChange,false);
 assert.equal(connected360MultiProviderCoachActivityView([apple],{clientId,now}).cue,null);
 assert.throws(()=>connected360MultiProviderCoachActivityView([apple,apple],{clientId,now}));
 assert.throws(()=>connected360MultiProviderCoachActivityView([apple,{...hc,clientId:coachId}],{clientId,now}));
});
test('V56 exact QA RPCs, explicit confirmation, bearer and strict response shape',async()=>{
 const x=fixture();
 await assert.rejects(x.transport.setConnected360AppleCandidateCoachConsent(token,decision),/EXPLICIT_CONSENT_REQUIRED/u);
 assert.equal(x.calls.length,0);
 await x.transport.connected360AppleCandidateCoachRecipients(token,clientId);
 await x.transport.setConnected360AppleCandidateCoachConsent(token,decision,{confirmed:true});
 await x.transport.connected360AppleCandidateCoachExerciseDays(token,clientId);
 assert.deepEqual(x.calls.map(c=>c.path),['/rest/v1/rpc/m26_wearable_v56_my_apple_coach_recipients_v1','/rest/v1/rpc/m26_wearable_v56_set_apple_coach_consent_v1','/rest/v1/rpc/m26_wearable_v56_apple_coach_exercise_days_v1']);
 assert.deepEqual(x.calls.map(c=>c.body),[{}, {p_coach:coachId,p_assignment:assignmentId,p_expected_revision:0,p_allow:true},{p_client:clientId}]);
 assert.ok(x.calls.every(c=>c.method==='POST'&&c.authorization==='Bearer '+token));
 const invalid=fixture(qa,true,result=>[result,result]);
 await assert.rejects(invalid.transport.connected360AppleCandidateCoachRecipients(token,clientId));
});
test('V56 disabled, production, invalid token or aborted calls never reach the network',async()=>{
 for(const x of [fixture(qa,false),fixture(prod,true)]){
  await assert.rejects(x.transport.connected360AppleCandidateCoachRecipients(token,clientId),/CANDIDATE_QA_ONLY/u);
  await assert.rejects(x.transport.setConnected360AppleCandidateCoachConsent(token,decision,{confirmed:true}),/CANDIDATE_QA_ONLY/u);
  await assert.rejects(x.transport.connected360AppleCandidateCoachExerciseDays(token,clientId),/CANDIDATE_QA_ONLY/u);
  assert.equal(x.calls.length,0);
 }
 const x=fixture(),controller=new AbortController();controller.abort();
 await assert.rejects(x.transport.connected360AppleCandidateCoachRecipients('',clientId),/AUTH_REQUIRED/u);
 await assert.rejects(x.transport.connected360AppleCandidateCoachExerciseDays(token,clientId,{signal:controller.signal}),/REQUEST_CANCELLED/u);
 assert.equal(x.calls.length,0);
});

test('V58 exact trend purpose and dates never accept weekly or private history data',()=>{
 const opts={clientId,days:28,now};
 assert.equal(verifyConnected360AppleCoachTrends(trendDto(28),opts).periods[0].observedDays,2);
 assert.throws(()=>verifyConnected360AppleCoachTrendRecipients(recipients(),{clientId}));
 assert.throws(()=>verifyConnected360AppleCoachRecipients(trendRecipients(),{clientId}));
 assert.equal(verifyConnected360AppleCoachTrendRecipients(trendRecipients(),{clientId}).purpose,trendPurpose);
 const receipt={ok:true,provider:'apple_health',purpose:trendPurpose,shared:true,revision:1},params={p_allow:true,p_expected_revision:0};
 assert.equal(verifyConnected360AppleCoachTrendConsentReceipt(receipt,params).purpose,trendPurpose);
 assert.throws(()=>verifyConnected360AppleCoachConsentReceipt(receipt,params));
 assert.throws(()=>verifyConnected360AppleCoachTrendConsentReceipt({ok:true,provider:'apple_health',shared:true,revision:1},params));
 const dto=trendDto(28),first=dto.periods[0];
 for(const change of [{...dto,purpose:'coaching-apple-exercise-days-v1'},{...dto,clientId:coachId},{...dto,periods:[{...first,retainedOnlyDays:1},dto.periods[1]]},{...dto,periods:[{...first,periodEnd:'2026-11-28'},dto.periods[1]]},{...dto,periods:[{...first,disciplines:[{sport:'running',observedDays:3}]},dto.periods[1]]}])assert.throws(()=>verifyConnected360AppleCoachTrends(change,opts));
});
test('V58 transport uses only explicit QA trend endpoints and confirms purpose-specific receipt',async()=>{
 const x=fixture();
 await assert.rejects(x.transport.setConnected360AppleCandidateCoachTrendConsent(token,decision),/EXPLICIT_CONSENT_REQUIRED/u);
 assert.equal(x.calls.length,0);
 await x.transport.connected360AppleCandidateCoachTrendRecipients(token,clientId);
 await x.transport.setConnected360AppleCandidateCoachTrendConsent(token,decision,{confirmed:true});
 await x.transport.connected360AppleCandidateCoachTrends(token,clientId,28);
 assert.deepEqual(x.calls.map(c=>c.path),['/rest/v1/rpc/m26_wearable_v58_my_apple_coach_trend_recipients_v1','/rest/v1/rpc/m26_wearable_v58_set_apple_coach_trend_consent_v1','/rest/v1/rpc/m26_wearable_v58_apple_coach_trends_v1']);
 assert.deepEqual(x.calls[2].body,{p_client:clientId,p_days:28});
 for(const y of [fixture(qa,false),fixture(prod,true)]){
  await assert.rejects(y.transport.connected360AppleCandidateCoachTrendRecipients(token,clientId));
  await assert.rejects(y.transport.setConnected360AppleCandidateCoachTrendConsent(token,decision,{confirmed:true}));
  await assert.rejects(y.transport.connected360AppleCandidateCoachTrends(token,clientId,28));
  assert.equal(y.calls.length,0);
 }
});
