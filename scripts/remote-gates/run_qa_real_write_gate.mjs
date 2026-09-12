import {mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';

const PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const required=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
];
const missing=required.filter((name)=>!process.env[name]);
if(missing.length)throw new Error(`QA_WRITE_ENV_MISSING:${missing.join(',')}`);
if(process.env.M26_PROJECT_REF!==PROJECT_REF)throw new Error('QA_WRITE_PROJECT_REF_MISMATCH');
if(String(process.env.M26_QA_ONLY).toLowerCase()!=='true')throw new Error('QA_WRITE_QA_ONLY_REQUIRED');

const base=String(process.env.M26_SUPABASE_URL||'').replace(/\/$/u,'');
if(new URL(base).hostname!==`${PROJECT_REF}.supabase.co`)throw new Error('QA_WRITE_PROJECT_MISMATCH');
const key=String(process.env.M26_SUPABASE_PUBLISHABLE_KEY||'');
if(!key||/service[_-]?role/i.test(key))throw new Error('QA_WRITE_SERVICE_ROLE_FORBIDDEN');

const fingerprint=(value)=>value?createHash('sha256').update(`${PROJECT_REF}:${String(value)}`).digest('hex').slice(0,16):null;
function options(url,init={}){
  const target=new URL(url);
  if(target.origin!==`https://${PROJECT_REF}.supabase.co`||target.username||target.password)throw new Error('QA_WRITE_EGRESS_DENIED');
  return {...init,redirect:'error',signal:AbortSignal.timeout(20_000)};
}
async function json(url,init={}){
  const response=await fetch(url,options(url,init));
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(`QA_WRITE_HTTP_${response.status}:${new URL(url).pathname}`);
  return body;
}
async function login(){
  const body=await json(`${base}/auth/v1/token?grant_type=password`,{
    method:'POST',
    headers:{apikey:key,'content-type':'application/json'},
    body:JSON.stringify({email:process.env.M26_QA_CLIENT_A_EMAIL,password:process.env.M26_QA_CLIENT_A_PASSWORD}),
  });
  if(!body?.access_token||!body?.user?.id)throw new Error('QA_WRITE_AUTH_FAILED');
  return {token:body.access_token,userId:body.user.id};
}
function headers(token){
  return {apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json',origin:CANARY_ORIGIN};
}
async function rpc(name,token,payload={}){
  return json(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:headers(token),body:JSON.stringify(payload)});
}

const session=await login();
const bootstrap=await rpc('iberfit_bootstrap_v26',session.token,{});
const role=String(bootstrap?.user?.role||'').trim().toLowerCase();
const clientId=String(bootstrap?.user?.clientId||bootstrap?.user?.client_id||'').trim();
if(!['client','cliente'].includes(role)||!/^[0-9a-f-]{36}$/iu.test(clientId))throw new Error('QA_WRITE_CLIENT_CONTEXT_INVALID');
if(bootstrap?.environment?.name==='production'||bootstrap?.environment==='production')throw new Error('QA_WRITE_PRODUCTION_FORBIDDEN');

const entityId=randomUUID();
const operationId=randomUUID();
const recordedAt=new Date().toISOString();
const note=`IBERFIT QA write certification ${recordedAt}`;
const command={
  operationId,
  type:'CHECKIN_REGISTRAR',
  entityType:'checkin',
  entityId,
  clientId,
  baseRevision:0,
  conflictSensitive:false,
  reason:null,
  previewAccepted:false,
  payload:{
    patch:{
      energy:5,
      sleep:5,
      stress:5,
      pain:0,
      fatigue:5,
      motivation:5,
      notes:note,
      recordedAt,
    },
  },
};

const preflight=await rpc('iberfit_command_preflight_v26',session.token,{p_command:command});
if(String(preflight?.kind||'').toLowerCase()==='rejected')throw new Error(`QA_WRITE_PREFLIGHT_REJECTED:${String(preflight?.reason||'unknown')}`);

const result=await rpc('iberfit_execute_command_v26',session.token,{p_command:command});
if(String(result?.kind||'').toLowerCase()!=='ack'||Number(result?.remoteRevision)!==1)throw new Error(`QA_WRITE_EXECUTE_NOT_ACK:${String(result?.reason||result?.kind||'unknown')}`);

const select='id,client_id,energy,sleep,stress,pain,fatigue,motivation,notes,status,revision,recorded_at,created_by';
const rows=await json(`${base}/rest/v1/client_checkins_v26?select=${encodeURIComponent(select)}&id=eq.${encodeURIComponent(entityId)}&client_id=eq.${encodeURIComponent(clientId)}`,{
  method:'GET',
  headers:{apikey:key,authorization:`Bearer ${session.token}`,origin:CANARY_ORIGIN},
});
if(!Array.isArray(rows)||rows.length!==1)throw new Error('QA_WRITE_PERSISTED_ROW_NOT_VISIBLE');
const row=rows[0];
if(
  String(row.id)!==entityId||
  String(row.client_id)!==clientId||
  Number(row.energy)!==5||
  Number(row.sleep)!==5||
  Number(row.stress)!==5||
  Number(row.pain)!==0||
  Number(row.fatigue)!==5||
  Number(row.motivation)!==5||
  String(row.notes)!==note||
  String(row.status)!=='confirmado'||
  Number(row.revision)!==1||
  String(row.created_by)!==String(session.userId)
)throw new Error('QA_WRITE_PERSISTED_ROW_MISMATCH');

const evidence={
  schema:'iberfit.qa-real-write.v1',
  generatedAt:new Date().toISOString(),
  project:PROJECT_REF,
  origin:CANARY_ORIGIN,
  qaOnly:true,
  serviceRoleUsed:false,
  mutation:'CHECKIN_REGISTRAR',
  preflightKind:String(preflight?.kind||'unknown'),
  resultKind:String(result?.kind||'unknown'),
  remoteRevision:Number(result?.remoteRevision||0),
  persisted:true,
  status:String(row.status),
  values:{energy:5,sleep:5,stress:5,pain:0,fatigue:5,motivation:5},
  actorFingerprint:fingerprint(session.userId),
  clientFingerprint:fingerprint(clientId),
  entityFingerprint:fingerprint(entityId),
};
await mkdir('recovery',{recursive:true});
await writeFile('recovery/P0_QA_REAL_WRITE_EVIDENCE.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
