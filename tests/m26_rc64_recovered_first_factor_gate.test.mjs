import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateRecoveredFirstFactor,mayRetryUserLoginAfterNetworkError} from '../qa/rc64/recovered-first-factor-contract.mjs';
const auth='POST qa-supabase /auth/v1/token';
const ev=['issued','requestfailed','issued','http-200'];
const run=(extra={})=>evaluateRecoveredFirstFactor({events:ev,networkFailureCodes:['net::ERR_ABORTED'],externalFailures:[auth],authenticated:true,...extra});
test('RC64 recognizes exactly one recovered first-factor network abort',()=>{
  const v=run();
  assert.equal(v.recovered,true);
  assert.equal(v.reason,'FIRST_FACTOR_RECOVERED_EXACTLY_ONCE');
  assert.deepEqual(v.remainingFailures,[]);
});
test('RC64 never masks unauthenticated, denied, repeated or unverified failures',()=>{
  for(const overrides of [
    {authenticated:false},
    {events:['issued','http-401','issued','http-200']},
    {events:['issued','requestfailed','issued','http-403']},
    {events:['issued','requestfailed']},
    {events:['issued','http-200','issued','requestfailed']},
    {events:['issued','requestfailed','issued','requestfailed','issued','http-200']},
    {networkFailureCodes:['net::ERR_ABORTED','net::ERR_ABORTED']},
    {networkFailureCodes:['UNCLASSIFIED']},
    {externalFailures:[]},
  ])assert.equal(run(overrides).recovered,false,JSON.stringify(overrides));
});
test('RC64 preserves another critical failure even when auth is recovered',()=>{
  const r=run({externalFailures:[auth,'POST qa-supabase /rest/v1/rpc/iberfit_bootstrap_v26',auth]});
  assert.equal(r.recovered,true);
  assert.deepEqual(r.remainingFailures,['POST qa-supabase /rest/v1/rpc/iberfit_bootstrap_v26',auth]);
});
test('RC64 unchanged success path and security-sensitive source contracts',()=>{
  assert.deepEqual(evaluateRecoveredFirstFactor({events:['issued','http-200'],networkFailureCodes:[],externalFailures:[],authenticated:true}).remainingFailures,[]);
  const src=readFileSync(new URL('../qa/rc64/authenticated-current-contract.spec.mjs',import.meta.url),'utf8');
  assert.match(src,/expect\(blocked,'Authenticated startup attempted a business mutation or foreign request'\)\.toEqual\(\[\]\)/u);
  assert.match(src,/expect\(firstFactorRecovery\.remainingFailures/u);
  assert.match(src,/expect\(pageErrors\)\.toEqual\(\[\]\)/u);
  assert.match(src,/expect\(new Set\(optionalReadFailures\)\.size/u);
});

test('RC64 manual user retry only after two typed first-factor network failures',()=>{
 const events=['issued','requestfailed','issued','requestfailed'];
 const networkFailureCodes=['net::ERR_ABORTED','net::ERR_TIMED_OUT'];
 assert.equal(mayRetryUserLoginAfterNetworkError({events,networkFailureCodes,networkErrorVisible:true,userRetryCount:0}),true);
 for(const bad of [
   {events:['issued','http-401','issued','requestfailed']},
   {events:['issued','requestfailed']},
   {networkFailureCodes:['net::ERR_ABORTED','UNCLASSIFIED']},
   {networkFailureCodes:['net::ERR_ABORTED','net::ERR_ABORTED','net::ERR_ABORTED']},
   {networkErrorVisible:false},
   {userRetryCount:1},
 ])assert.equal(mayRetryUserLoginAfterNetworkError({
   events,networkFailureCodes,networkErrorVisible:true,userRetryCount:0,...bad,
 }),false,JSON.stringify(bad));
});
test('RC64 explicit retry only accepts exact verified terminal 200 with no foreign failures',()=>{
 const events=['issued','requestfailed','issued','requestfailed','issued','http-200'];
 const networkFailureCodes=['net::ERR_ABORTED','net::ERR_TIMED_OUT'];
 const base={events,networkFailureCodes,authenticated:true,userRetryCount:1,externalFailures:[auth,auth]};
 const ok=evaluateRecoveredFirstFactor(base);
 assert.equal(ok.recovered,true);
 assert.equal(ok.reason,'FIRST_FACTOR_USER_RETRY_RECOVERED');
 assert.deepEqual(ok.remainingFailures,[]);
 for(const bad of [
   {userRetryCount:0},
   {events:[...events,'issued','http-200']},
   {events:['issued','requestfailed','issued','requestfailed','issued','http-403']},
   {events:['issued','requestfailed','issued','http-200']},
   {networkFailureCodes:['net::ERR_ABORTED','UNCLASSIFIED']},
   {externalFailures:[auth]},
   {authenticated:false},
 ])assert.equal(evaluateRecoveredFirstFactor({...base,...bad}).recovered,false,JSON.stringify(bad));
 const stillRed=evaluateRecoveredFirstFactor({...base,externalFailures:[auth,'POST qa-supabase /rest/v1/rpc/iberfit_bootstrap_v26',auth]});
 assert.equal(stillRed.recovered,true);
 assert.deepEqual(stillRed.remainingFailures,['POST qa-supabase /rest/v1/rpc/iberfit_bootstrap_v26']);
});
test('RC64 spec only retries one explicitly visible network failure and preserves MFA checks',()=>{
 const src=readFileSync(new URL('../qa/rc64/authenticated-current-contract.spec.mjs',import.meta.url),'utf8');
 assert.match(src,/mayRetryUserLoginAfterNetworkError\(/u);
 assert.match(src,/firstFactorUserRetryCount=1/u);
 assert.match(src,/M26_QA_AUTH_PHASE_DIAGNOSTIC/u);
 assert.match(src,/verifyPrivilegedFailClosed\(page,account,assurance\)/u);
 assert.match(src,/page\.locator\('\.m26-auth-notice\[role="alert"\]'\)/u);
 assert.doesNotMatch(src,/request\.post\('\/auth\/v1\/token/u);
});
