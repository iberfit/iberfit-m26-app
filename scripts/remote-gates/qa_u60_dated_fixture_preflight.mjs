/**
 * U69 QA-only authenticated READ-ONLY identification of a safe synthetic
 * published prescription eligible for a real Coach->Client dated E2E.
 * Never persist, export client IDs, email, tokens, body or personal metrics.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {expandQaClientCanonicalBodyEnvelope} from '../../src/m26/production-state.js';
export const QA='gjztkdwfmunnzhtvxrsu';
const ORIGIN='https://'+QA+'.supabase.co';
function check(v,c){if(!v)throw Error('U69_'+c);}
function localDate(date=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'America/Santiago',day:'2-digit',month:'2-digit',year:'numeric',
 }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return [parts.year,parts.month,parts.day].join('-');
}
function plusDays(day,n){
 const d=new Date(day+'T12:00:00.000Z');
 d.setUTCDate(d.getUTCDate()+n);
 return d.toISOString().slice(0,10);
}
export function candidateList(snapshot,today){
 const items=Array.isArray(snapshot?.data?.m26Entities)?snapshot.data.m26Entities:[];
 const plans=items.filter(x=>x.entityType==='planning'&&x.status==='publicado')
   .map(x=>({id:String(x.entityId||''),body:x.body||{}}));
 const out=[];
 for(const session of items){
  const body=session?.body||{};
  if(session?.entityType!=='session'||session?.status!=='disponible'
    ||body.deliveryModality!=='guiada_en_app'
    ||body.visibleToClient!==true||body.clientVisibilityLevel!=='full'
    ||!Array.isArray(body.blocks)||body.blocks.length!==1
    ||!/^[0-9]{1,2}$/.test(String(body.blocks[0]?.sets||''))
    ||Number(body.blocks[0].sets)<1||Number(body.blocks[0].sets)>15
    ||!body.blocks[0]?.exerciseId)continue;
  const planning=plans.find(p=>p.id===String(body.cycleId||''));
  if(!planning)continue;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(planning.body.startDate||''))
    ||!/^\d{4}-\d{2}-\d{2}$/.test(String(planning.body.endDate||'')))continue;
  if(planning.body.startDate>today||planning.body.endDate<plusDays(today,8))continue;
  const revision=Number(session.revision);
  const duration=Number(body.durationMinutes);
  if(!Number.isSafeInteger(revision)||revision<1
    ||!Number.isFinite(duration)||duration<10||duration>240)continue;
  out.push(Object.freeze({id:String(session.entityId||''),clientId:String(session.clientId||''),revision,
    duration,cycleId:String(body.cycleId),sets:Number(body.blocks[0].sets)}));
 }
 return out.filter(x=>/^[0-9a-f-]{36}$/i.test(x.id)&&/^[0-9a-f-]{36}$/i.test(x.clientId));
}
async function post(key,path,body,jwt=null){
 const url=new URL(path,ORIGIN);
 check(url.origin===ORIGIN,'REMOTE_TARGET');
 const headers={apikey:key,'content-type':'application/json',origin:'https://m26-canary.iberfit.cl'};
 if(jwt)headers.authorization='Bearer '+jwt;
 const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),
  redirect:'error',signal:AbortSignal.timeout(17000)});
 return {status:r.status,body:await r.json().catch(()=>null)};
}
async function login(key,email,password){
 const r=await post(key,'/auth/v1/token?grant_type=password',{email,password});
 check(r.status===200&&typeof r.body?.access_token==='string','AUTH_FAILED');
 return r.body.access_token;
}
async function rpc(key,token,name){
 const r=await post(key,'/rest/v1/rpc/'+name,{},token);
 check(r.status===200,'RPC_'+name.toUpperCase()+'_HTTP_'+r.status);
 return r.body;
}
async function main(){
 const e=process.env;
 check(e.M26_QA_ONLY==='true'&&e.M26_PROJECT_REF===QA
   &&new URL(e.M26_SUPABASE_URL||'').origin===ORIGIN,'QA_ONLY_CONTEXT');
 const key=e.M26_SUPABASE_PUBLISHABLE_KEY||'';
 check(key.length>20&&!/service.?role|sb_secret/i.test(key),'FORBIDDEN_KEY');
 const [a,b]=await Promise.all([
   login(key,e.M26_QA_CLIENT_A_EMAIL,e.M26_QA_CLIENT_A_PASSWORD),
   login(key,e.M26_QA_CLIENT_B_EMAIL,e.M26_QA_CLIENT_B_PASSWORD),
 ]);
 const [ownerA,ownerB,raw,env]=await Promise.all([
   rpc(key,a,'iberfit_client_id'),rpc(key,b,'iberfit_client_id'),
   rpc(key,a,'iberfit_bootstrap_v26'),rpc(key,a,'iberfit_environment'),
 ]);
 check(ownerA!==ownerB&&typeof ownerA==='string'&&typeof ownerB==='string','OWNERS_DISTINCT');
 check(env?.environment==='QA'&&env.realDataAllowed===false&&
   env.productionBlocked===true,'QA_ISOLATED');
 const snapshot=expandQaClientCanonicalBodyEnvelope(raw);
 const eligible=candidateList(snapshot,localDate());
 check(eligible.every(x=>x.clientId===ownerA),'SOURCE_SCOPE_DRIFT');
 check(eligible.length>0,'NO_ELIGIBLE_SAFE_QA_SINGLE_BLOCK_SESSION');
 const evidence={
  schema:'iberfit.u69.qa-real-dated-fixture-preflight.v1',qaOnly:true,
  readonly:true,prodTouched:false,customerDataTouched:false,
  authenticatedTwoOwners:true,eligibleSessionCount:eligible.length,
  confirmsAppointmentNeeded:true,
  requiresRealCoachCreateConfirm:true,requiresTwoIndependentDates:true,
  passed:true,
 };
 await mkdir('recovery/u69-qa-fixture',{recursive:true});
 await writeFile('recovery/u69-qa-fixture/preflight.json',
   JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
 process.stdout.write('IBERFIT_U69_QA_READ_ONLY_DATED_CLIENT_CANDIDATE_AVAILABLE\n');
}
if(process.argv[1]?.endsWith('/qa_u60_dated_fixture_preflight.mjs')){
 main().catch(err=>{
   process.stderr.write('IBERFIT_U69_FAIL_CLOSED:'+String(err?.message||'UNKNOWN').replace(/[^A-Za-z0-9_:]/g,'').slice(0,130)+'\n');
   process.exitCode=1;
 });
}
