/**
 * QA-ONLY: synthetic-client authentication + real RPC persistence fence for V45.
 * No service role, no physical watch data, no production egress and no output
 * of tokens, email, IDs or raw metrics. This is NOT native E2E certification.
 */
import {mkdir,writeFile} from 'node:fs/promises';

const REF='gjztkdwfmunnzhtvxrsu';
const ORIGIN='https://m26-canary.iberfit.cl';
const URL_BASE='https://'+REF+'.supabase.co';
const required=[
  'M26_PROJECT_REF','M26_QA_ONLY','M26_SUPABASE_URL',
  'M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
];
for(const name of required){
  if(!process.env[name])throw new Error('V45_QA_MISSING_ENV:'+name);
}
if(process.env.M26_PROJECT_REF!==REF
  ||String(process.env.M26_QA_ONLY).toLowerCase()!=='true'
  ||new URL(process.env.M26_SUPABASE_URL).origin!==URL_BASE)
  throw new Error('V45_QA_PRODUCTION_ORIGIN_DENIED');
const KEY=process.env.M26_SUPABASE_PUBLISHABLE_KEY;
if(/service[_-]?role|supabase_secret/iu.test(KEY))
  throw new Error('V45_QA_SERVICE_ROLE_DENIED');
let createdAuthorization=false;
let sessionA=null;
let completed=false;
const checks=[];

function assert(condition,code){
  if(!condition)throw new Error('V45_QA_'+code);
  checks.push(code);
}
async function request(path,{token=null,method='POST',payload={}}={}){
  const url=new URL(path,URL_BASE);
  if(url.origin!==URL_BASE||url.username||url.password)
    throw new Error('V45_QA_EGRESS_DENIED');
  const headers={
    apikey:KEY,origin:ORIGIN,'content-type':'application/json',
  };
  if(token)headers.authorization='Bearer '+token;
  const res=await fetch(url,{
    method,headers,redirect:'error',signal:AbortSignal.timeout(18_000),
    ...(method==='POST'?{body:JSON.stringify(payload)}:{}),
  });
  const json=await res.json().catch(()=>null);
  return {status:res.status,body:json};
}
async function rpc(name,token,payload={}){
  return request('/rest/v1/rpc/'+name,{token,payload});
}
async function success(name,token,payload={}){
  const result=await rpc(name,token,payload);
  if(result.status<200||result.status>=300)
    throw new Error('V45_QA_RPC_FAILED_'+name.toUpperCase().slice(0,35)+'_'+result.status);
  return result.body;
}
function errorIsForbidden(res){
  return [400,401,403].includes(res?.status)
    && (res?.body?.code==='42501'
      ||res?.status===401||res?.status===403
      ||/M26_CONNECTED360_V45_/u.test(String(res?.body?.message||'')));
}
async function login(email,password){
  const res=await request('/auth/v1/token?grant_type=password',{
    payload:{email,password},
  });
  if(res.status!==200||typeof res.body?.access_token!=='string'
    ||typeof res.body?.user?.id!=='string')
    throw new Error('V45_QA_AUTHENTICATION_REQUIRED');
  return {token:res.body.access_token,userId:res.body.user.id};
}
async function currentClient(session){
  const state=await success('iberfit_bootstrap_v26',session.token);
  const role=String(state?.user?.role||'').toLowerCase();
  const id=state?.user?.clientId??state?.user?.client_id;
  assert(role==='client'||role==='cliente','ROLE_CLIENT');
  assert(typeof id==='string'&&/^[0-9a-f-]{36}$/iu.test(id),'CLIENT_ID_VALID');
  const environment=await success('iberfit_environment',session.token);
  assert(environment?.environment==='QA'
    &&environment.realDataAllowed===false
    &&environment.productionBlocked===true,'ISOLATED_QA_ONLY');
  return id;
}
function civilDate(now){
  const parts=Intl.DateTimeFormat('en-US',{
    timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(now);
  const get=k=>parts.find(p=>p.type===k)?.value;
  const date=get('year')+'-'+get('month')+'-'+get('day');
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(date))
    throw new Error('V45_QA_CIVIL_DATE_INVALID');
  return date;
}
function evidence(obj){return {
  schema:'iberfit.connected360.v45.synthetic-write-gate.v1',
  project:REF,qaOnly:true,synthetic:true,realPersonData:false,
  serviceRoleUsed:false,automaticSyncCertified:false,hardwareCertified:false,
  checks:[...new Set(checks)],...obj,
};}
async function save(obj){
  await mkdir('recovery/connected360-v45',{recursive:true});
  await writeFile('recovery/connected360-v45/qa-real-write.json',
    JSON.stringify(evidence(obj),null,2)+'\n');
}

try{
  const [a,b]=await Promise.all([
    login(process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD),
    login(process.env.M26_QA_CLIENT_B_EMAIL,process.env.M26_QA_CLIENT_B_PASSWORD),
  ]);
  sessionA=a;
  assert(a.userId!==b.userId,'OWNERS_DIFFER');
  const [clientA,clientB]=await Promise.all([currentClient(a),currentClient(b)]);
  assert(clientA!==clientB,'CLIENTS_DIFFER');
  const name='m26_wearable_v45_import_explicit_qa_v1';
  const status=await success('m26_wearable_authorization_status_v2',
    a.token,{p_provider:'health_connect'});
  assert(Number.isSafeInteger(status?.revocationCursor),'CURSOR_VALID');
  // Never reuse or revoke a grant owned by another test/run.
  assert(status?.authorized!==true,'NO_PREEXISTING_HC_CONSENT');

  const invalid=await rpc(name,a.token,{p_grant_id:null,p_payload:{records:[]}});
  assert(errorIsForbidden(invalid),'REJECT_EMPTY_GRANT');
  const anon=await rpc(name,null,{p_grant_id:null,p_payload:{records:[]}});
  assert([401,403].includes(anon.status)||
    (anon.status===404&&anon.body?.code==='PGRST202'),'ANON_EXECUTE_DENIED');

  const dbRead=await request('/rest/v1/m26_wearable_source_daily_v45?select=id&limit=1',
    {token:a.token,method:'GET'});
  assert(dbRead.status===403,'NO_DIRECT_HEALTH_DATA_READ');

  const grant=await success('m26_wearable_reauthorize_v2',a.token,{
    p_provider:'health_connect',
    p_expected_cursor:status.revocationCursor,
    p_expected_grant:status.grantId??null,
    p_scopes:['steps'],
  });
  assert(typeof grant?.grantId==='string'&&
    /^[0-9a-f-]{36}$/iu.test(grant.grantId),'SYNTHETIC_GRANT_CREATED');
  createdAuthorization=true;

  const at=new Date();
  const data={records:[{
    clientId:clientA,provider:'health_connect',
    date:civilDate(at),quality:'limitada',
    sourceRecordCount:1,metrics:{steps:7319},
    provenance:{
      schema:'iberfit.connected360.qa.provenance.v45.preview',
      acquiredAt:at.toISOString(),measuredAt:null,sourceUpdatedAt:null,
      sourceIdentity:null,timeZone:null,aggregationTimeZone:'America/Santiago',
      aggregation:'daily',sourceTimestampVerified:false,
      automaticSyncCertified:false,
    },
  }]};
  const wrong=await rpc(name,b.token,{p_grant_id:grant.grantId,p_payload:data});
  assert(errorIsForbidden(wrong),'CROSS_CLIENT_WRITE_DENIED');
  const forged={records:[{...data.records[0],clientId:clientB}]};
  const otherClient=await rpc(name,a.token,{
    p_grant_id:grant.grantId,p_payload:forged,
  });
  assert(errorIsForbidden(otherClient),'CROSS_CLIENT_PAYLOAD_DENIED');

  const forgedTimestamp={records:[{
    ...data.records[0],
    provenance:{...data.records[0].provenance,
      sourceUpdatedAt:at.toISOString(),sourceTimestampVerified:true},
  }]};
  const illegalSource=await rpc(name,a.token,{
    p_grant_id:grant.grantId,p_payload:forgedTimestamp,
  });
  assert(errorIsForbidden(illegalSource),'FABRICATED_SOURCE_TIMESTAMP_DENIED');

  const first=await success(name,a.token,{
    p_grant_id:grant.grantId,p_payload:data,
  });
  assert(first?.ok===true&&first?.persisted===true
    &&first?.automatic===false&&first?.inserted===1
    &&first?.count===1&&first?.legacyAccepted===1
    &&first?.sourceTimeVerified===false,'ATOMIC_V45_V44_INITIAL_INSERT');

  const replay=await success(name,a.token,{
    p_grant_id:grant.grantId,p_payload:data,
  });
  assert(replay?.ok===true&&replay?.unchanged===1
    &&replay?.inserted===0&&replay?.updated===0
    &&replay?.legacyAccepted===1&&replay?.legacyStale===0,'IDEMPOTENT_EXACT_REPLAY');

  const collision={records:[{
    ...data.records[0],metrics:{steps:8001},
  }]};
  const rejectCollision=await rpc(name,a.token,{
    p_grant_id:grant.grantId,p_payload:collision,
  });
  assert(errorIsForbidden(rejectCollision),'SAME_TIMESTAMP_CONFLICT_DENIED');

  const bootstrap=await success('m26_wearable_bootstrap_v44',a.token);
  const summary=(bootstrap?.dailySummaries||[]).find(row=>
    row?.clientId===clientA
      &&row?.provider==='health_connect'
      &&(row?.date===data.records[0].date||row?.recordDate===data.records[0].date));
  assert(Boolean(summary),'V44_COMPATIBILITY_SUMMARY_VISIBLE');

  const revoked=await success('m26_wearable_revoke_v44',a.token,{
    p_provider:'health_connect',p_delete_data:true,
  });
  assert(revoked?.ok===true&&revoked?.revoked===true,'CONSENT_REVOKED_AND_ERASED');
  createdAuthorization=false;

  const oldGrant=await rpc(name,a.token,{
    p_grant_id:grant.grantId,p_payload:data,
  });
  assert(errorIsForbidden(oldGrant),'REVOKED_GENERATION_WRITE_DENIED');

  const after=await success('m26_wearable_bootstrap_v44',a.token);
  const retained=(after?.dailySummaries||[]).some(row=>
    row?.clientId===clientA&&row?.provider==='health_connect');
  assert(!retained,'ERASURE_V44_CONFIRMED');
  completed=true;
  await save({passed:true,cleanup:'source-revoked-and-erased'});
  console.log('IBERFIT_V45_QA_SYNTHETIC_WRITE_GATE=PASS');
}catch(error){
  await save({passed:false,
    errorCode:String(error?.message||error||'V45_QA_FAILED')
      .replace(/[^A-Za-z0-9_:.-]/gu,'').slice(0,130),
  });
  throw new Error('IBERFIT_V45_QA_GATE_FAILED_CHECK_EVIDENCE');
}finally{
  if(createdAuthorization&&sessionA){
    // Only a grant created by this test can be revoked automatically.
    try{
      await success('m26_wearable_revoke_v44',sessionA.token,{
        p_provider:'health_connect',p_delete_data:true,
      });
      if(!completed)console.log('IBERFIT_V45_QA_SYNTHETIC_CLEANUP=PASS');
    }catch{
      console.error('IBERFIT_V45_QA_SYNTHETIC_CLEANUP_MANUAL_REVIEW_REQUIRED');
    }
  }
}
