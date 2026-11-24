import {mkdir,writeFile} from 'node:fs/promises';
import {releaseQaAuthSessions,runQaStageWithCleanup} from './release_qa_auth_sessions.mjs';

// Non-mutating negative security gate: SQL ACL denies DELETE before row matching.
// The only target is a reserved synthetic UUID, prechecked absent in QA.
const QA_REF='gjztkdwfmunnzhtvxrsu';
const QA_ORIGIN='https://'+QA_REF+'.supabase.co';
const NONEXISTENT_ID='00000000-0000-0000-0000-000000000000';
const required=[
  'M26_QA_ONLY','M26_PROJECT_REF','M26_SUPABASE_URL',
  'M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
];
for(const key of required){
  if(!process.env[key])throw new Error('P0_CLIENT_DELETE_QA_ENV_MISSING:'+key);
}
if(process.env.M26_QA_ONLY!=='true'||process.env.M26_PROJECT_REF!==QA_REF||
   new URL(process.env.M26_SUPABASE_URL).origin!==QA_ORIGIN){
  throw new Error('P0_CLIENT_DELETE_QA_ONLY_REQUIRED');
}
const apiKey=process.env.M26_SUPABASE_PUBLISHABLE_KEY;
const headers={'apikey':apiKey,'content-type':'application/json'};
const request=async(path,options={})=>{
  const url=new URL(path,QA_ORIGIN);
  if(url.origin!==QA_ORIGIN)throw new Error('P0_CLIENT_DELETE_EXTERNAL_ORIGIN_DENIED');
  const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20_000)});
  const payload=await response.json().catch(()=>null);
  return {status:response.status,payload};
};
const issuedSessions=[];
const fixtureEmails=new Set(['qa.rc74.coach@iberfit.cl','qa.rc74.client-a@iberfit.cl']);
if(String(process.env.M26_QA_COACH_EMAIL).trim().toLowerCase()!=='qa.rc74.coach@iberfit.cl'||
   String(process.env.M26_QA_CLIENT_A_EMAIL).trim().toLowerCase()!=='qa.rc74.client-a@iberfit.cl'){
  throw Error('P0_CLIENT_DELETE_QA_FIXTURE_DENIED');
}
const QA_TRANSIENT_AUTH_STATUSES=new Set([502,503,504,520,521,522,523,524]);
const auth=async(email,password)=>{
  for(let attempt=0;attempt<2;attempt++){
    const r=await request('/auth/v1/token?grant_type=password',{
      method:'POST',headers,body:JSON.stringify({email,password}),
    });
    if(r.status===200&&r.payload?.access_token&&r.payload?.user?.id){
      const actual=String(r.payload.user.email||'').trim().toLowerCase();
      const token=r.payload.access_token;
      if(actual!==String(email).trim().toLowerCase()||!fixtureEmails.has(actual)||
         typeof token!=='string'||token.length<100||token.length>16384||
         !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)){
        throw Error('P0_CLIENT_DELETE_QA_FIXTURE_IDENTITY_MISMATCH');
      }
      issuedSessions.push({email:actual,token});
      return token;
    }
    if(attempt===0&&QA_TRANSIENT_AUTH_STATUSES.has(r.status)){
      // Exactly one bounded retry for gateway errors. Never retry bad credentials,
      // revoked accounts or 429, and never log identifiers or bearer tokens.
      await new Promise(resolve=>setTimeout(resolve,800));
      continue;
    }
    throw new Error('P0_CLIENT_DELETE_QA_LOGIN_FAILED_HTTP_'+r.status);
  }
  throw new Error('P0_CLIENT_DELETE_QA_LOGIN_UNCONFIRMED');
};
const attempt=async(roleName,token)=>{
  const r=await request('/rest/v1/clients?id=eq.'+NONEXISTENT_ID,{
    method:'DELETE',
    headers:{...headers,Authorization:'Bearer '+token,'Prefer':'return=minimal'},
  });
  // 403 + PostgreSQL 42501 proves an authenticated user was rejected
  // by SQL privileges, not merely by an RLS filter that matched no row.
  if(r.status!==403||r.payload?.code!=='42501'){
    throw new Error('P0_CLIENT_DELETE_QA_DIRECT_DELETE_NOT_DENIED:'+roleName+':'+r.status);
  }
  return {roleName,status:r.status,sqlstate:r.payload.code,denied:true};
};
async function runDenial(){
const coachToken=await auth(process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD);
const clientToken=await auth(process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD);
const outcome=[
  await attempt('coach',coachToken),
  await attempt('client',clientToken),
];
const evidence=Object.freeze({
  schema:'iberfit.p0.client-delete-command-only.v1',
  qaOnly:true,
  project:QA_REF,
  syntheticId:NONEXISTENT_ID,
  passed:outcome.every(x=>x.denied),
  checks:outcome,
});
await mkdir('recovery/p0-client-delete-boundary',{recursive:true});
await writeFile('recovery/p0-client-delete-boundary/qa-denial.json',JSON.stringify(evidence,null,2)+'\n');
console.log('P0_CLIENT_DIRECT_DELETE_QA_DENIED:'+JSON.stringify(evidence));

}
async function releaseIssuedSessions(){
  if(issuedSessions.length===0)return;
  const result=await releaseQaAuthSessions({sessions:issuedSessions,base:QA_ORIGIN,key:apiKey,projectRef:QA_REF,qaOnly:process.env.M26_QA_ONLY});
  console.log('P0_CLIENT_DELETE_QA_AUTH_RELEASE='+result.released+'/'+issuedSessions.length);
  if(result.released!==issuedSessions.length||result.failed!==0||result.skipped!==0)
    throw Error('P0_CLIENT_DELETE_QA_AUTH_CLEANUP_INCOMPLETE');
}
await runQaStageWithCleanup(runDenial,releaseIssuedSessions,()=>console.error('P0_CLIENT_DELETE_QA_AUTH_CLEANUP_FAILED_AFTER_STAGE_FAILURE'));
