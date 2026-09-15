import {mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';

const PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const required=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
];
const missing=required.filter((name)=>!process.env[name]);
if(missing.length)throw new Error(`QA_WRITE_ENV_MISSING:${missing.join(',')}`);
if(process.env.M26_PROJECT_REF!==PROJECT_REF)throw new Error('QA_WRITE_PROJECT_REF_MISMATCH');
if(String(process.env.M26_QA_ONLY).toLowerCase()!=='true')throw new Error('QA_WRITE_QA_ONLY_REQUIRED');

const base=String(process.env.M26_SUPABASE_URL||'').replace(/\/$/u,'');
if(new URL(base).hostname!==`${PROJECT_REF}.supabase.co`)throw new Error('QA_WRITE_PROJECT_MISMATCH');
const key=String(process.env.M26_SUPABASE_PUBLISHABLE_KEY||'');
if(!key||/service[_-]?role/i.test(key))throw new Error('QA_WRITE_SERVICE_ROLE_FORBIDDEN');

const fingerprint=(value)=>value
  ? createHash('sha256').update(`${PROJECT_REF}:${String(value)}`).digest('hex').slice(0,16)
  : null;

function options(url,init={}){
  const target=new URL(url);
  if(target.origin!==`https://${PROJECT_REF}.supabase.co`||target.username||target.password){
    throw new Error('QA_WRITE_EGRESS_DENIED');
  }
  return {...init,redirect:'error',signal:AbortSignal.timeout(20_000)};
}

async function requestResult(url,init={}){
  const response=await fetch(url,options(url,init));
  const body=await response.json().catch(()=>null);
  return Object.freeze({ok:response.ok,status:Number(response.status)||0,body});
}

async function json(url,init={}){
  const target=new URL(url);
  const authTokenRequest=target.pathname==='/auth/v1/token'&&init?.method==='POST';
  for(let attempt=0;attempt<(authTokenRequest?2:1);attempt+=1){
    try{
      const result=await requestResult(url,init);
      if(result.ok)return result.body;
      if(authTokenRequest&&attempt===0&&[502,503,504].includes(result.status)){
        await new Promise((resolve)=>setTimeout(resolve,220));
        continue;
      }
      throw new Error(`QA_WRITE_HTTP_${result.status}:${target.pathname}`);
    }catch(error){
      const transient=error?.name==='TypeError'||/Failed to fetch|NetworkError|network request failed/iu.test(String(error?.message||error||''));
      if(authTokenRequest&&attempt===0&&transient){
        await new Promise((resolve)=>setTimeout(resolve,220));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`QA_WRITE_HTTP_RETRY_EXHAUSTED:${target.pathname}`);
}

async function login(email,password){
  const body=await json(`${base}/auth/v1/token?grant_type=password`,{
    method:'POST',
    headers:{apikey:key,'content-type':'application/json'},
    body:JSON.stringify({email,password}),
  });
  if(!body?.access_token||!body?.user?.id)throw new Error('QA_WRITE_AUTH_FAILED');
  return {token:body.access_token,userId:body.user.id};
}

function headers(token){
  return {
    apikey:key,
    authorization:`Bearer ${token}`,
    'content-type':'application/json',
    origin:CANARY_ORIGIN,
  };
}

async function rpc(name,token,payload={}){
  return json(`${base}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:headers(token),
    body:JSON.stringify(payload),
  });
}

async function rpcResult(name,token,payload={}){
  return requestResult(`${base}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:headers(token),
    body:JSON.stringify(payload),
  });
}

function assertForbidden(result,label){
  if(result?.status!==403)throw new Error(`${label}_EXPECTED_403:${result?.status||0}`);
}

function assertAck(result,label,revision,{duplicate=false}={}){
  if(
    String(result?.kind||'').toLowerCase()!=='ack'||
    Number(result?.remoteRevision)!==Number(revision)||
    Boolean(result?.duplicate)!==Boolean(duplicate)
  ){
    throw new Error(`${label}_ACK_MISMATCH:${String(result?.kind||'unknown')}:${String(result?.remoteRevision||'null')}:${String(result?.duplicate)}`);
  }
}

function assertRejected(result,label,reason){
  if(
    String(result?.kind||'').toLowerCase()!=='rejected'||
    String(result?.reason||'')!==reason
  ){
    throw new Error(`${label}_REJECTION_MISMATCH:${String(result?.kind||'unknown')}:${String(result?.reason||'unknown')}`);
  }
}

async function bootstrapClient(session,label){
  const bootstrap=await rpc('iberfit_bootstrap_v26',session.token,{});
  const role=String(bootstrap?.user?.role||'').trim().toLowerCase();
  const clientId=String(bootstrap?.user?.clientId||bootstrap?.user?.client_id||'').trim();
  if(!['client','cliente'].includes(role)||!/^[0-9a-f-]{36}$/iu.test(clientId)){
    throw new Error(`${label}_CLIENT_CONTEXT_INVALID`);
  }
  if(bootstrap?.environment?.name==='production'||bootstrap?.environment==='production'){
    throw new Error(`${label}_PRODUCTION_FORBIDDEN`);
  }
  return {bootstrap,clientId};
}

async function selectCheckin(token,entityId,clientId){
  const select='id,client_id,energy,sleep,stress,pain,fatigue,motivation,notes,status,revision,recorded_at,created_by';
  const clientFilter=clientId?`&client_id=eq.${encodeURIComponent(clientId)}`:'';
  return json(
    `${base}/rest/v1/client_checkins_v26?select=${encodeURIComponent(select)}&id=eq.${encodeURIComponent(entityId)}${clientFilter}`,
    {method:'GET',headers:{apikey:key,authorization:`Bearer ${token}`,origin:CANARY_ORIGIN}},
  );
}

try{
const [coach,clientA,clientB]=await Promise.all([
  login(process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD),
  login(process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD),
  login(process.env.M26_QA_CLIENT_B_EMAIL,process.env.M26_QA_CLIENT_B_PASSWORD),
]);

const [{clientId:clientAId},{clientId:clientBId}]=await Promise.all([
  bootstrapClient(clientA,'QA_WRITE_CLIENT_A'),
  bootstrapClient(clientB,'QA_WRITE_CLIENT_B'),
]);
if(clientAId===clientBId)throw new Error('QA_WRITE_CLIENTS_NOT_DISTINCT');

const environment=await rpc('iberfit_environment',clientA.token,{});
if(environment?.environment!=='QA'||environment?.realDataAllowed!==false||environment?.productionBlocked!==true){
  throw new Error('QA_WRITE_ENVIRONMENT_GUARD_FAILED');
}

const entityId=randomUUID();
const operationId=randomUUID();
const recordedAt=new Date().toISOString();
const note=`IBERFIT QA write certification ${recordedAt}`;
const command={
  operationId,
  type:'CHECKIN_REGISTRAR',
  entityType:'checkin',
  entityId,
  clientId:clientAId,
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

const directInsertId=randomUUID();
const directInsertClientId=randomUUID();
const directInsert=await requestResult(`${base}/rest/v1/client_checkins_v26`,{
  method:'POST',
  headers:{...headers(clientA.token),prefer:'return=representation'},
  body:JSON.stringify({
    id:directInsertId,
    client_id:directInsertClientId,
    energy:1,
    sleep:1,
    stress:1,
    pain:0,
    fatigue:1,
    motivation:1,
    notes:'must never persist directly',
    status:'confirmado',
    revision:1,
    recorded_at:recordedAt,
    created_by:clientA.userId,
  }),
});
assertForbidden(directInsert,'QA_WRITE_DIRECT_INSERT');

const directPatch=await requestResult(
  `${base}/rest/v1/client_checkins_v26?id=eq.${encodeURIComponent(randomUUID())}`,
  {method:'PATCH',headers:headers(clientA.token),body:JSON.stringify({notes:'must never patch directly'})},
);
assertForbidden(directPatch,'QA_WRITE_DIRECT_UPDATE');

const directDelete=await requestResult(
  `${base}/rest/v1/client_checkins_v26?id=eq.${encodeURIComponent(randomUUID())}`,
  {method:'DELETE',headers:headers(clientA.token)},
);
assertForbidden(directDelete,'QA_WRITE_DIRECT_DELETE');

const preflight=await rpc('iberfit_command_preflight_v26',clientA.token,{p_command:command});
if(String(preflight?.kind||'').toLowerCase()!=='ack'){
  throw new Error(`QA_WRITE_PREFLIGHT_NOT_ACK:${String(preflight?.reason||preflight?.kind||'unknown')}`);
}

const result=await rpc('iberfit_execute_command_v26',clientA.token,{p_command:command});
assertAck(result,'QA_WRITE_CREATE',1,{duplicate:false});

let rows=await selectCheckin(clientA.token,entityId,clientAId);
if(!Array.isArray(rows)||rows.length!==1)throw new Error('QA_WRITE_PERSISTED_ROW_NOT_VISIBLE');
let row=rows[0];
if(
  String(row.id)!==entityId||
  String(row.client_id)!==clientAId||
  Number(row.energy)!==5||
  Number(row.sleep)!==5||
  Number(row.stress)!==5||
  Number(row.pain)!==0||
  Number(row.fatigue)!==5||
  Number(row.motivation)!==5||
  String(row.notes)!==note||
  String(row.status)!=='confirmado'||
  Number(row.revision)!==1||
  String(row.created_by)!==String(clientA.userId)
)throw new Error('QA_WRITE_PERSISTED_ROW_MISMATCH');

const clientBRows=await selectCheckin(clientB.token,entityId,null);
if(!Array.isArray(clientBRows)||clientBRows.length!==0)throw new Error('QA_WRITE_CROSS_CLIENT_READ_LEAK');

const crossClientCommand={
  ...command,
  operationId:randomUUID(),
  entityId:randomUUID(),
  clientId:clientAId,
  payload:{patch:{...command.payload.patch,notes:'cross-client command must be denied'}},
};
const crossClientPreflight=await rpcResult('iberfit_command_preflight_v26',clientB.token,{p_command:crossClientCommand});
assertForbidden(crossClientPreflight,'QA_WRITE_CROSS_CLIENT_COMMAND');

const replay=await rpc('iberfit_execute_command_v26',clientA.token,{p_command:command});
assertAck(replay,'QA_WRITE_IDEMPOTENT_REPLAY',1,{duplicate:true});
rows=await selectCheckin(clientA.token,entityId,clientAId);
if(!Array.isArray(rows)||rows.length!==1||String(rows[0]?.notes)!==note||Number(rows[0]?.revision)!==1){
  throw new Error('QA_WRITE_IDEMPOTENT_REPLAY_MUTATED_ROW');
}

const collisionCommand={
  ...command,
  payload:{patch:{...command.payload.patch,notes:`${note} collision`}},
};
const collisionPreflight=await rpc('iberfit_command_preflight_v26',clientA.token,{p_command:collisionCommand});
assertRejected(collisionPreflight,'QA_WRITE_COLLISION_PREFLIGHT','OPERATION_ID_COLLISION');
const collisionExecute=await rpc('iberfit_execute_command_v26',clientA.token,{p_command:collisionCommand});
assertRejected(collisionExecute,'QA_WRITE_COLLISION_EXECUTE','OPERATION_ID_COLLISION');

const clientAnnulCommand={
  operationId:randomUUID(),
  type:'CHECKIN_ANULAR',
  entityType:'checkin',
  entityId,
  clientId:clientAId,
  baseRevision:1,
  conflictSensitive:true,
  reason:'QA role boundary verification',
  previewAccepted:false,
  payload:{patch:{}},
};
const clientAnnulPreflight=await rpc('iberfit_command_preflight_v26',clientA.token,{p_command:clientAnnulCommand});
assertRejected(clientAnnulPreflight,'QA_WRITE_CLIENT_ROLE_BOUNDARY','ROLE_NOT_ALLOWED');

const coachAssurance=await rpc('iberfit_privileged_assurance_context_v65d',coach.token,{});
if(
  coachAssurance?.ok!==true||
  coachAssurance?.privileged!==true||
  coachAssurance?.mfaRequired!==true||
  coachAssurance?.webauthnRequired!==true||
  coachAssurance?.iberfitAssurance!=='required'
){
  throw new Error('QA_WRITE_COACH_ASSURANCE_CONTRACT_MISMATCH');
}

const coachAnnulCommand={
  ...clientAnnulCommand,
  operationId:randomUUID(),
  reason:'QA write certification privileged boundary',
};
const coachPreflight=await rpcResult('iberfit_command_preflight_v26',coach.token,{p_command:coachAnnulCommand});
const coachBlockedMessage=String(coachPreflight?.body?.message||'');
if(coachPreflight?.status!==403||coachBlockedMessage!=='IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED'){
  throw new Error(`QA_WRITE_COACH_ASSURANCE_FAIL_CLOSED_MISMATCH:${coachPreflight?.status||0}:${coachBlockedMessage.slice(0,80)}`);
}

rows=await selectCheckin(clientA.token,entityId,clientAId);
if(!Array.isArray(rows)||rows.length!==1)throw new Error('QA_WRITE_ROW_MISSING_AFTER_COACH_BLOCK');
row=rows[0];
if(String(row.status)!=='confirmado'||Number(row.revision)!==1||String(row.notes)!==note){
  throw new Error('QA_WRITE_COACH_BLOCK_MUTATED_ROW');
}

const clientBAfterRows=await selectCheckin(clientB.token,entityId,null);
if(!Array.isArray(clientBAfterRows)||clientBAfterRows.length!==0)throw new Error('QA_WRITE_CROSS_CLIENT_READ_LEAK_AFTER_COACH_BLOCK');

const evidence={
  schema:'iberfit.qa-real-write.v2',
  generatedAt:new Date().toISOString(),
  project:PROJECT_REF,
  origin:CANARY_ORIGIN,
  qaOnly:true,
  serviceRoleUsed:false,
  environment:{
    name:environment.environment,
    realDataAllowed:environment.realDataAllowed,
    productionBlocked:environment.productionBlocked,
  },
  mutation:'CHECKIN_REGISTRAR',
  create:{
    preflightKind:String(preflight?.kind||'unknown'),
    resultKind:String(result?.kind||'unknown'),
    remoteRevision:Number(result?.remoteRevision||0),
    persisted:true,
  },
  idempotency:{
    replayKind:String(replay?.kind||'unknown'),
    replayDuplicate:replay?.duplicate===true,
    collisionPreflightReason:String(collisionPreflight?.reason||''),
    collisionExecuteReason:String(collisionExecute?.reason||''),
  },
  authorization:{
    directInsertDenied:directInsert.status===403,
    directUpdateDenied:directPatch.status===403,
    directDeleteDenied:directDelete.status===403,
    crossClientReadDenied:true,
    crossClientCommandDenied:crossClientPreflight.status===403,
    clientAnnulDenied:String(clientAnnulPreflight?.reason||'')==='ROLE_NOT_ALLOWED',
    coachMutationRequiresPrivilegedAssurance:coachPreflight.status===403&&coachBlockedMessage==='IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED',
  },
  finalState:{
    status:String(row.status),
    revision:Number(row.revision),
    syntheticQaRecord:true,
    privilegedCleanupIntentionallyNotBypassed:true,
  },
  values:{energy:5,sleep:5,stress:5,pain:0,fatigue:5,motivation:5},
  actorFingerprints:{
    clientA:fingerprint(clientA.userId),
    clientB:fingerprint(clientB.userId),
    coach:fingerprint(coach.userId),
  },
  clientFingerprints:{
    clientA:fingerprint(clientAId),
    clientB:fingerprint(clientBId),
  },
  entityFingerprint:fingerprint(entityId),
};
await mkdir('recovery',{recursive:true});
await writeFile('recovery/P0_QA_REAL_WRITE_EVIDENCE.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
}catch(error){
  const failureEvidence={
    schema:'iberfit.qa-real-write.v2',
    generatedAt:new Date().toISOString(),
    project:PROJECT_REF,
    origin:CANARY_ORIGIN,
    qaOnly:true,
    serviceRoleUsed:false,
    passed:false,
    error:{
      name:String(error?.name||'Error').slice(0,80),
      code:String(error?.code||'').slice(0,80),
      message:String(error?.message||error||'UNKNOWN').replace(/[\r\n]+/gu,' ').slice(0,240),
    },
  };
  await mkdir('recovery',{recursive:true});
  await writeFile('recovery/P0_QA_REAL_WRITE_EVIDENCE.json',JSON.stringify(failureEvidence,null,2)+'\n');
  throw error;
}
