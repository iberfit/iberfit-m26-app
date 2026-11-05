/**
 * U68 QA-only hosted JWT U60 positive owner-scope and cross-client negative gate.
 * NO training writes: query own empty/date calendar, invalid private detail,
 * reject cross-owner, anon, malicious filter and wrong-role command.
 * Success is not proof that Coach->Client workout execution is certified.
 */
import {mkdir,writeFile} from 'node:fs/promises';

export const REF='gjztkdwfmunnzhtvxrsu';
const BASE='https://'+REF+'.supabase.co';
const RPC='iberfit_occurrence_api_u60_v1';
const DETAIL='iberfit_occurrence_detail_v1';
function check(v,code){if(!v)throw Error('U68_'+code);}
function settings(){
 const e=process.env;
 for(const k of ['M26_SUPABASE_URL','M26_QA_ONLY','M26_PROJECT_REF',
  'M26_SUPABASE_PUBLISHABLE_KEY','M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD'])
   check(e[k],'ENV_MISSING_'+k);
 check(e.M26_QA_ONLY==='true'&&e.M26_PROJECT_REF===REF,'QA_ONLY');
 check(new URL(e.M26_SUPABASE_URL).origin===BASE,'BAD_HOST');
 const key=e.M26_SUPABASE_PUBLISHABLE_KEY;
 check(key.length>20&&!/service[_-]?role|sb_secret/i.test(key),'KEY_FORBIDDEN');
 return {e,key};
}
async function call(key,path,{jwt=null,body={}}={}){
 const url=new URL(path,BASE);
 check(url.origin===BASE&&!url.username&&!url.password,'REMOTE_ESCAPE');
 const headers={apikey:key,'content-type':'application/json',
  origin:'https://m26-canary.iberfit.cl'};
 if(jwt)headers.authorization='Bearer '+jwt;
 const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),
  redirect:'error',signal:AbortSignal.timeout(17000)});
 return {status:r.status,body:await r.json().catch(()=>null)};
}
async function login(key,email,password){
 const r=await call(key,'/auth/v1/token?grant_type=password',{body:{email,password}});
 check(r.status===200&&typeof r.body?.access_token==='string'&&
   typeof r.body?.user?.id==='string','AUTHENTICATION');
 return {id:r.body.user.id,jwt:r.body.access_token};
}
async function rpc(key,jwt,name,body){
 return call(key,'/rest/v1/rpc/'+name,{jwt,body});
}
async function identity(key,jwt,name){
 const r=await rpc(key,jwt,name,{});
 check(r.status===200,'IDENTITY_'+name.toUpperCase()+'_HTTP_'+r.status);
 return r.body;
}
export function calendarShape(response){
 return response?.status===200&&response.body?.kind==='calendar'
   &&Array.isArray(response.body?.occurrences)
   &&Number.isInteger(Number(response.body.count))
   &&!/(?:prescriptionSnapshot|publishedSnapshot|requestHash|coachPrivateNote)/i.test(
     JSON.stringify(response.body));
}
export function isDenied(result){
 if([400,401,403,404].includes(result?.status))return true;
 if(result?.status===200&&['rejected','conflict'].includes(result.body?.kind)&&
   /(DENIED|FORBIDDEN|UNAUTHORIZED|ACCESS|ROLE|OWNER|NOT_FOUND|NOT_ALLOWED)/i.test(
    result.body?.reason||''))return true;
 return false;
}
const action=(clientId,payload={})=>({p_action:'CALENDARIO',
 p_payload:{clientId,startDate:'2026-10-29',endDate:'2026-11-16',limit:4,...payload}});
export function evidence(steps){
 return {schema:'iberfit.u68.qa-hosted-jwt-authorized-calendar.v1',
  qaOnly:true,productionTouched:false,writeAttempted:false,
  source:'hosted-real-jwt',checks:steps,passed:true};
}
async function main(){
 const {e,key}=settings();
 const steps=[];
 const [coach,a,b]=await Promise.all([
  login(key,e.M26_QA_COACH_EMAIL,e.M26_QA_COACH_PASSWORD),
  login(key,e.M26_QA_CLIENT_A_EMAIL,e.M26_QA_CLIENT_A_PASSWORD),
  login(key,e.M26_QA_CLIENT_B_EMAIL,e.M26_QA_CLIENT_B_PASSWORD),
 ]);
 check(new Set([coach.id,a.id,b.id]).size===3,'AUTH_PRINCIPALS_DISTINCT');
 steps.push('hosted_three_distinct_jwts');
 const [roleCoach,roleA,roleB,clientA,clientB,env]=await Promise.all([
  identity(key,coach.jwt,'iberfit_current_role_v26'),
  identity(key,a.jwt,'iberfit_current_role_v26'),
  identity(key,b.jwt,'iberfit_current_role_v26'),
  identity(key,a.jwt,'iberfit_client_id'),
  identity(key,b.jwt,'iberfit_client_id'),
  identity(key,a.jwt,'iberfit_environment'),
 ]);
 check(roleCoach==='coach'&&['client','cliente'].includes(roleA)
  &&['client','cliente'].includes(roleB),'ROLES');
 check(typeof clientA==='string'&&typeof clientB==='string'
  &&clientA!==clientB,'OWNER_SCOPES');
 check(env?.environment==='QA'&&env.realDataAllowed===false&&
  env.productionBlocked===true,'ENV_QA_ONLY');
 steps.push('QA_roles_and_isolation_proven');
 const ownA=await rpc(key,a.jwt,RPC,action(clientA));
 check(calendarShape(ownA),'CLIENT_A_SELF_CALENDAR_HTTP_'+ownA.status);
 steps.push('A_self_calendar');
 const ownB=await rpc(key,b.jwt,RPC,action(clientB));
 check(calendarShape(ownB),'CLIENT_B_SELF_CALENDAR_HTTP_'+ownB.status);
 steps.push('B_self_calendar');
 const coachA=await rpc(key,coach.jwt,RPC,action(clientA));
 check(calendarShape(coachA),'COACH_ASSIGNED_A_CALENDAR_HTTP_'+coachA.status);
 steps.push('coach_assigned_A_calendar');
 const cross=await rpc(key,b.jwt,RPC,action(clientA));
 check(isDenied(cross),'CROSS_CLIENT_B_TO_A_EXPOSED_HTTP_'+cross.status);
 steps.push('cross_owner_B_to_A_denied');
 const unknown=await rpc(key,a.jwt,RPC,action('11111111-1111-4111-8111-111111111111'));
 check(isDenied(unknown),'UNRELATED_CLIENT_ALLOWED_HTTP_'+unknown.status);
 steps.push('unknown_owner_denied');
 const roleFilter=await rpc(key,coach.jwt,RPC,action(clientA,{role:'admin'}));
 check(isDenied(roleFilter),'ARBITRARY_ROLE_FILTER_ALLOWED_HTTP_'+roleFilter.status);
 steps.push('untrusted_filter_denied');
 const noAuth=await rpc(key,null,RPC,action(clientA));
 check(isDenied(noAuth),'ANON_CALENDAR_ALLOWED_HTTP_'+noAuth.status);
 steps.push('anonymous_calendar_denied');
 const missing=await rpc(key,a.jwt,DETAIL,{p_client_id:clientA,
   p_occurrence_id:'11111111-1111-4111-8111-111111111111'});
 check(isDenied(missing),'MISSING_PRIVATE_DETAIL_EXPOSED_HTTP_'+missing.status);
 steps.push('missing_private_read_denied');
 const crossDetail=await rpc(key,b.jwt,DETAIL,{p_client_id:clientA,
   p_occurrence_id:'11111111-1111-4111-8111-111111111111'});
 check(isDenied(crossDetail),'CROSS_CLIENT_DETAIL_EXPOSED_HTTP_'+crossDetail.status);
 steps.push('cross_private_read_denied');
 await mkdir('recovery/u68-qa-jwt',{recursive:true});
 await writeFile('recovery/u68-qa-jwt/gate.json',
   JSON.stringify(evidence(steps),null,2)+'\n',{mode:0o600});
 process.stdout.write('IBERFIT_U68_REAL_JWT_QA_OWNER_SCOPE_POSITIVE_AND_IDOR_NEGATIVE_PASS\n');
}
if(process.argv[1]?.endsWith('/qa_u60_authorized_jwt_gate.mjs')){
 main().catch(err=>{
   process.stderr.write('IBERFIT_U68_FAIL_CLOSED:'+String(err?.message||'UNKNOWN').replace(/[^A-Za-z0-9_:]/g,'').slice(0,95)+'\n');
   process.exitCode=1;
 });
}
