/**
 * Real QA authentication security gate. Read-only, synthetic QA test accounts.
 * No service key, privileged verification bypass, production access or PII in logs.
 * A fresh password-only session must NOT create or issue any official document.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const REF='gjztkdwfmunnzhtvxrsu';
const URL_ROOT='https://'+REF+'.supabase.co';
const ORIGIN='https://m26-canary.iberfit.cl';
const required=['M26_PROJECT_REF','M26_QA_ONLY','M26_SUPABASE_URL',
 'M26_SUPABASE_PUBLISHABLE_KEY','M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
 'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
 'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD'];
for(const name of required)assert.ok(process.env[name],'M44_QA_MISSING_ENV_'+name);
assert.equal(process.env.M26_PROJECT_REF,REF);
assert.equal(process.env.M26_QA_ONLY,'true');
assert.equal(new URL(process.env.M26_SUPABASE_URL).origin,URL_ROOT);
const key=process.env.M26_SUPABASE_PUBLISHABLE_KEY;
assert.ok(!/service[_-]?role|sb_secret/iu.test(key),'M44_QA_SECRET_KEY_FORBIDDEN');
function send(path,body,token){
 const url=new URL(path,URL_ROOT);
 assert.equal(url.origin,URL_ROOT,'M44_QA_EGRESS_DENIED');
 return fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
  headers:{apikey:key,Origin:ORIGIN,'content-type':'application/json',
   ...(token?{Authorization:'Bearer '+token}:{})},
  body:JSON.stringify(body)});
}
async function login(email,password){
 const response=await send('/auth/v1/token?grant_type=password',{email,password});
 const data=await response.json();
 assert.equal(response.status,200,'M44_QA_AUTH_UNAVAILABLE');
 assert.ok(typeof data.access_token==='string','M44_QA_AUTH_TOKEN_MISSING');
 return data.access_token;
}
async function rpc(method,token,data={}){
 const r=await send('/rest/v1/rpc/'+method,data,token);
 const body=await r.json().catch(()=>({}));
 return {status:r.status,code:String(body?.message||body?.code||'').slice(0,90)};
}
const [coach,clientA,clientB]=await Promise.all([
 login(process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD),
 login(process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD),
 login(process.env.M26_QA_CLIENT_B_EMAIL,process.env.M26_QA_CLIENT_B_PASSWORD),
]);
const assurance=await rpc('iberfit_privileged_assurance_context_v65d',coach);
const assuranceRequired=await send('/rest/v1/rpc/iberfit_privileged_assurance_context_v65d',{},coach);
const v=await assuranceRequired.json();
assert.equal(v.iberfitAssurance,'required','M44_QA_FRESH_COACH_SESSION_MUST_REQUIRE_ASSURANCE');
let passed=0;
for(const [label,token,method,args] of [
 ['coach cannot prepare without MFA',coach,'iberfit_m44_prepare_evolution_report_issue_v1',{p_report_id:randomUUID()}],
 ['coach cannot read history without MFA',coach,'iberfit_m44_report_issued_pdf_history_v1',{p_report_id:randomUUID()}],
 ['client A cannot issue',clientA,'iberfit_m44_prepare_evolution_report_issue_v1',{p_report_id:randomUUID()}],
 ['client B cannot issue',clientB,'iberfit_m44_prepare_evolution_report_issue_v1',{p_report_id:randomUUID()}],
 ['coach cannot bypass impl',coach,'iberfit_m44_prepare_evolution_report_issue_impl_v1',{p_report_id:randomUUID()}],
]){
 const result=await rpc(method,token,args);
 assert.equal(result.status,403,label+' rejected '+result.status);
 passed++;
}
const response=await send('/functions/v1/iberfit-evolution-report-emission-v1',
 {action:'issue',reportId:randomUUID(),issueRequestId:randomUUID()},coach);
const rejected=await response.json().catch(()=>({}));
assert.equal(response.status,403,'M44_EDGE_MFA_REQUIRED_'+String(rejected.code||'UNKNOWN').slice(0,70));
assert.equal(rejected.code,'M44_PRIVILEGED_ASSURANCE_REQUIRED');
assert.ok(!rejected.signedUrl&&!rejected.sourceSnapshot);
passed++;
// Authenticated PDF streaming is prohibited without verified Coach assurance.
// Unrelated Client credentials must not retrieve PDF bytes or internal paths.
for(const [label,token] of [['COACH_MFA',coach],['CLIENT_A',clientA],['CLIENT_B',clientB]]){
 const r=await send('/functions/v1/iberfit-evolution-report-emission-v1',
  {action:'download',issuanceId:randomUUID()},token);
 const contentType=String(r.headers.get('content-type')||'');
 const denied=await r.json().catch(()=>({}));
 assert.ok([403,404].includes(r.status),label+'_DOWNLOAD_MUST_FAIL_CLOSED_'+r.status);
 assert.ok(contentType.includes('application/json'),label+'_DOWNLOAD_MUST_NOT_RETURN_PDF');
 assert.equal(denied.ok,false,label+'_PDF_NOT_DELIVERED');
 assert.equal(denied.signedUrl,undefined,label+'_NO_BEARERLESS_URL');
 passed++;
}
console.log(JSON.stringify({ok:true,environment:'QA',realAuthenticatedSessions:3,
 deniedPrivilegedOperations:passed,assuranceRequired:true,executedMutations:0,
 productionTouched:false,serviceRoleUsed:false}));
