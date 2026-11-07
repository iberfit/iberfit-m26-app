import {mkdir,writeFile} from 'node:fs/promises';

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
const auth=async(email,password)=>{
  const r=await request('/auth/v1/token?grant_type=password',{
    method:'POST',headers,body:JSON.stringify({email,password}),
  });
  if(r.status!==200||!r.payload?.access_token||!r.payload?.user?.id){
    throw new Error('P0_CLIENT_DELETE_QA_LOGIN_FAILED');
  }
  return r.payload.access_token;
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
