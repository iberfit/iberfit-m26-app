/**
 * IBERFIT U66 QA-only real hosted JWT / PostgREST negative-authorization gate.
 * No session writes, no schema/data changes, no tokens/IDs/emails in evidence.
 * Both public U60 entrypoints MUST remain closed to all app roles here.
 */
import {mkdir,writeFile} from 'node:fs/promises';

export const REF='gjztkdwfmunnzhtvxrsu';
export const BASE='https://gjztkdwfmunnzhtvxrsu.supabase.co';
export const PROHIBITED=new Set(['sb_secret','service_role']);
export const RPCS=Object.freeze([
  'iberfit_occurrence_api_u60_v1',
  'iberfit_occurrence_detail_v1',
]);

function assert(value,reason){if(!value)throw Error('U66_'+reason);}
export function denied(status,payload){
  if([401,403,404].includes(status)){
    // PostgREST returns 404/PGRST202 for a function with no granted USAGE.
    if(status===404&&payload?.code&&!['PGRST202','PGRST203','PGRST106'].includes(payload.code))
      throw Error('U66_UNEXPECTED_NOT_FOUND');
    return true;
  }
  throw Error('U66_CLOSED_RPC_EXPOSED_OR_UNEXPECTED_HTTP_'+status);
}
export function safeEvidence(steps){
  return Object.freeze({
    schema:'iberfit.u66.qa-hosted-jwt-closed.v1',
    target:'QA',qaOnly:true,prodTouched:false,userRowsTouched:false,
    u60GrantsOpened:false,tests:Object.freeze([...steps]),passed:true,
  });
}
function settings(){
  const e=process.env;
  const names=[
    'M26_QA_ONLY','M26_PROJECT_REF','M26_SUPABASE_URL',
    'M26_SUPABASE_PUBLISHABLE_KEY','M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
    'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
    'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
  ];
  for(const n of names)assert(e[n], 'MISSING_ENV_'+n);
  assert(e.M26_QA_ONLY==='true'&&e.M26_PROJECT_REF===REF,'NOT_QA');
  assert(new URL(e.M26_SUPABASE_URL).origin===BASE,'EXTERNAL_TARGET');
  const key=e.M26_SUPABASE_PUBLISHABLE_KEY.trim();
  assert(key.length>20&&!/service.?role|sb_secret/i.test(key),'UNSAFE_PUBLISHABLE_KEY');
  return {e,key};
}
async function call(path,key,{jwt=null,body={},method='POST'}={}){
  const url=new URL(path,BASE);
  assert(url.origin===BASE&&!url.username&&!url.password,'HOST_ESCAPE');
  const headers={apikey:key,origin:'https://m26-canary.iberfit.cl'};
  if(jwt)headers.authorization='Bearer '+jwt;
  if(method==='POST')headers['content-type']='application/json';
  const res=await fetch(url,{method,headers,redirect:'error',
    signal:AbortSignal.timeout(18000),
    ...(method==='POST'?{body:JSON.stringify(body)}:{})});
  const data=await res.json().catch(()=>null);
  return {status:res.status,body:data};
}
async function login(key,email,password){
  const r=await call('/auth/v1/token?grant_type=password',key,{body:{email,password}});
  assert(r.status===200&&typeof r.body?.access_token==='string'&&
    typeof r.body?.user?.id==='string','QA_AUTH_FAILED');
  return {token:r.body.access_token,id:r.body.user.id};
}
async function rpc(key,token,name,payload){
  return call('/rest/v1/rpc/'+name,key,{jwt:token,body:payload});
}
async function allowed(key,token,name,payload){
  const res=await rpc(key,token,name,payload);
  assert(res.status===200,'IDENTITY_RPC_FAILED');
  return res.body;
}
async function run(){
  const {e,key}=settings();
  const steps=[];
  const [coach,a,b]=await Promise.all([
    login(key,e.M26_QA_COACH_EMAIL,e.M26_QA_COACH_PASSWORD),
    login(key,e.M26_QA_CLIENT_A_EMAIL,e.M26_QA_CLIENT_A_PASSWORD),
    login(key,e.M26_QA_CLIENT_B_EMAIL,e.M26_QA_CLIENT_B_PASSWORD),
  ]);
  assert(new Set([coach.id,a.id,b.id]).size===3,'IDENTITY_NOT_DISTINCT');
  steps.push('three_separate_hosted_auth_jwts');
  const [coachRole,roleA,roleB,clientA,clientB,environment]=await Promise.all([
    allowed(key,coach.token,'iberfit_current_role_v26',{}),
    allowed(key,a.token,'iberfit_current_role_v26',{}),
    allowed(key,b.token,'iberfit_current_role_v26',{}),
    allowed(key,a.token,'iberfit_client_id',{}),
    allowed(key,b.token,'iberfit_client_id',{}),
    allowed(key,a.token,'iberfit_environment',{}),
  ]);
  assert(coachRole==='coach','COACH_ROLE_INVALID');
  assert(['client','cliente'].includes(roleA)&&['client','cliente'].includes(roleB),'CLIENT_ROLE_INVALID');
  assert(typeof clientA==='string'&&typeof clientB==='string'&&clientA!==clientB,'CLIENT_SCOPE_INVALID');
  assert(environment?.environment==='QA'&&environment.realDataAllowed===false&&
    environment.productionBlocked===true,'ENVIRONMENT_GUARD_FAILED');
  steps.push('client_a_b_coach_roles_and_qa_isolation');
  const uuid='11111111-1111-4111-8111-111111111111';
  const payloads=Object.freeze({
    iberfit_occurrence_api_u60_v1:{p_action:'CALENDARIO',p_payload:{
      clientId:clientA,startDate:'2026-11-04',endDate:'2026-11-11',limit:1}},
    iberfit_occurrence_detail_v1:{p_client_id:clientA,p_occurrence_id:uuid},
  });
  for(const name of RPCS){
    for(const [actor,token] of [['anon',null],['client-a',a.token],
      ['client-b',b.token],['coach',coach.token]]){
      const res=await rpc(key,token,name,payloads[name]);
      denied(res.status,res.body);
      steps.push(name+':'+actor+':closed');
    }
  }
  steps.push('no_real_data_readback_no_mutation');
  await mkdir('recovery/u66-qa-jwt',{recursive:true});
  await writeFile('recovery/u66-qa-jwt/gate.json',
    JSON.stringify(safeEvidence(steps),null,2)+'\n',{mode:0o600});
  process.stdout.write('IBERFIT_U66_QA_HOSTED_JWT_CLOSED_8_OF_8_AND_ROLE_SCOPE_PASS\n');
}
if(process.argv[1]?.endsWith('/qa_u60_closed_hosted_jwt_gate.mjs')){
  run().catch(err=>{
    // Suppress all response bodies and details; logs may not carry identities.
    process.stderr.write('IBERFIT_U66_FAIL_CLOSED:'+String(err?.message||'ERROR').replace(/[^A-Za-z0-9_:]/g,'').slice(0,90)+'\n');
    process.exitCode=1;
  });
}
