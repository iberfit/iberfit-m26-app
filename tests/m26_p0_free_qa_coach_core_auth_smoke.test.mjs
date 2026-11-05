import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canUseQaCoachCoreAuthSmoke} from '../src/m26/app/qa-coach-core-auth-smoke.js';
import {createM26Transport,M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN,
 M26_PRODUCTION_PROJECT_REF,M26_PRODUCTION_SUPABASE_ORIGIN} from '../src/m26/supabase-transport.js';
const runtime={enabled:true,qaOnly:true,canary:true,host:'m26-canary.iberfit.cl',
 projectRef:M26_QA_PROJECT_REF,url:M26_QA_SUPABASE_ORIGIN};
const opts={runtime,runtimeConfig:{freeQaCoachCoreAuthSmoke:true},
 email:'qa.rc74.coach@iberfit.cl',reason:'login',probe:true};
test('core-only smoke is double-gated to exact QA Coach, initial login and auth-only probe',()=>{
 assert.equal(canUseQaCoachCoreAuthSmoke(opts),true);
 for(const override of [
  {email:'qa.rc74.client-a@iberfit.cl'}, {reason:'readback'}, {reason:'session-published-verify'},
  {probe:false}, {runtimeConfig:{}}, {runtimeConfig:{freeQaCoachCoreAuthSmoke:false}},
  {runtime:{...runtime,enabled:false}}, {runtime:{...runtime,qaOnly:false}},
  {runtime:{...runtime,canary:false}}, {runtime:{...runtime,host:'app.iberfit.cl'}},
  {runtime:{...runtime,projectRef:M26_PRODUCTION_PROJECT_REF}},
  {runtime:{...runtime,url:M26_PRODUCTION_SUPABASE_ORIGIN}},
 ]) assert.equal(canUseQaCoachCoreAuthSmoke({...opts,...override}),false,JSON.stringify(override));
});
const validCore=()=>({environment:'QA',user:{role:'coach',id:'synthetic'},
 data:{clients:[{id:'10000000-0000-4000-8000-000000000001'}],
 m26Entities:[],domainEvents:[],sessionExecutions:[]},remoteRevisions:{}});
function makeTransport({qa=true,payload=validCore()}={}){
 const calls=[];
 const t=createM26Transport({
  enabled:true,qaOnly:qa,canary:qa,host:qa?'m26-canary.iberfit.cl':'app.iberfit.cl',
  projectRef:qa?M26_QA_PROJECT_REF:M26_PRODUCTION_PROJECT_REF,
  url:qa?M26_QA_SUPABASE_ORIGIN:M26_PRODUCTION_SUPABASE_ORIGIN,
  publishableKey:'synthetic-public-key',timeoutMs:8000,
 },{fetchImpl:async(url,options)=>{
  calls.push({path:new URL(url).pathname,method:options.method,auth:options.headers.authorization});
  return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
 }});
 return {t,calls};
}
test('QA auth-only core uses one authorized RPC, no U38 history',async()=>{
 const {t,calls}=makeTransport();
 const result=await t.bootstrapQaCoachCoreAuthSmoke('synthetic-token');
 assert.deepEqual(result,validCore());
 assert.equal(calls.length,1);
 assert.equal(calls[0].path,'/rest/v1/rpc/iberfit_bootstrap_v26_core_u37_qa');
 assert.equal(calls[0].method,'POST');
 assert.equal(calls[0].auth,'Bearer synthetic-token');
});
test('PROD, stale ownership, missing token and unprivileged core fail closed',async()=>{
 const prod=makeTransport({qa:false});
 await assert.rejects(prod.t.bootstrapQaCoachCoreAuthSmoke('synthetic-token'),/SMOKE_ONLY/u);
 assert.equal(prod.calls.length,0);
 const qa=makeTransport();
 await assert.rejects(qa.t.bootstrapQaCoachCoreAuthSmoke(''),/AUTH_REQUIRED/u);
 await assert.rejects(qa.t.bootstrapQaCoachCoreAuthSmoke('synthetic-token',{
  assertOwner:()=>{throw Error('M26_HYDRATION_STALE_SESSION');},
 }),/M26_HYDRATION_STALE_SESSION/u);
 assert.equal(qa.calls.length,0);
 const other=makeTransport({payload:{...validCore(),user:{role:'client'}}});
 await assert.rejects(other.t.bootstrapQaCoachCoreAuthSmoke('synthetic-token'),/CONTEXT_INVALID/u);
});
test('U80 QA Coach initial authentication is core only, historical decisions are explicitly client-scoped',()=>{
 const app=readFileSync('src/m26/app/application.js','utf8');
 const tr=readFileSync('src/m26/supabase-transport.js','utf8');
 assert.match(app,/qaAtomicCoach&&canUseQaCoachCoreAuthSmoke/u);
 assert.match(app,/coachHistoryDemand&&!qaCoreAuthSmoke/u);
 assert.match(app,/bootstrapQaCoachWithHistory\(currentToken\(\),\{[\s\S]*clientId:requestedHistoryClient/u);
 assert.match(app,/bootstrapQaCoachCoreAuthSmoke\(currentToken\(\),\{[\s\S]*assertOwner:requireOwner/u);
 assert.match(app,/const coachHistoryDemand=reason==='coach-history-demand'/u);
 assert.match(app,/M26_COACH_HISTORY_SCOPE_FORBIDDEN/u);
 assert.match(app,/:transport\.bootstrap\(currentToken\(\),\{signal\}\)/u);
 assert.match(tr,/iberfit_privileged_history_page_u38_qa/u);
 assert.match(tr,/U39_HISTORY_NOT_COMPLETE/u);
});


// Integration contract: original smoke first login stays explicitly gated;
// U80 also opens the second login with core before selected-client demand.
test('U80 WebAuthn recurring isolates the first smoke and requires an explicit second-login historical readback',()=>{
 const fs=requireSource('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs');
 const workflow=requireSource('.github/workflows/coach-webauthn-recurring.yml');
 const build=requireSource('qa/rc64/build-authenticated-surface.mjs');
 assert.equal((workflow.match(/M26_QA_COACH_CORE_AUTH_SMOKE: 'true'/gu)||[]).length,2,
   'both the build and the Playwright steps must receive the exact opt-in');
 assert.match(build,/process\.env\.M26_QA_COACH_CORE_AUTH_SMOKE==='true'/u);
 assert.match(build,/freeQaCoachCoreAuthSmoke: true/u);
 const trigger=fs.indexOf('__IBERFIT_QA_AUTH_ONLY_CORE_PROBE__=true;');
 const first=fs.indexOf("await loginAndCompleteWebAuthn(page,process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD)",trigger);
 const restored=fs.indexOf('__IBERFIT_QA_AUTH_ONLY_CORE_PROBE__=false;',first);
 const second=fs.indexOf("await loginAndCompleteWebAuthn(page,process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD)",restored);
 assert.ok(trigger>=0&&first>trigger&&restored>first&&second>restored);
 assert.match(fs,/First WebAuthn registration must not prefetch U38/u);
 assert.match(fs,/Second MFA must not preload all Coach archives/u);
 assert.match(fs,/Explicit Coach history must use real U38 RLS reads/u);
 assert.match(fs,/data-m26-coach-history-gate/u);
 assert.match(fs,/data-m26-qa-coach-history-load/u);
 assert.match(fs,/auditAuthenticatedProfessionalRoutes/u);
 assert.ok(fs.includes("expect(allCards,entity+': no historical Coach publication removed')"));
 assert.doesNotMatch(fs,/addInitScript\(\(\)=>\{globalThis\.__IBERFIT_QA_AUTH_ONLY_CORE_PROBE__/u);
});
function requireSource(path){return readFileSync(path,'utf8');}
