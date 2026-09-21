import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { M26_EXTENDED_COMMAND_REGISTRY, validateCommandCatalog, normalizeRegistryRole } from '../../src/m26/command-catalog.js';
import { RC29_QA_CLIENTS_NOT_DISTINCT, assertDistinctQaClientIds } from './readonly-gate-client-isolation.mjs';
import { inspectClientBootstrap } from './readonly-gate-bootstrap-privacy.mjs';
// Privacy contract includes private.?notes?; empty containers are allowed, populated ones fail closed.

const PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const EXPECTED_COACH_CERT_EMAIL='qa.rc74.coach@iberfit.cl';
const required=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
];
const missing=required.filter((name)=>!process.env[name]);
if(missing.length)throw new Error(`RC74_4_REMOTE_ENV_MISSING:${missing.join(',')}`);
if(process.env.M26_PROJECT_REF!==PROJECT_REF)throw new Error('RC74_4_REMOTE_PROJECT_REF_MISMATCH');
if(String(process.env.M26_QA_ONLY).toLowerCase()!=='true')throw new Error('RC74_4_REMOTE_QA_ONLY_REQUIRED');
if(String(process.env.M26_QA_COACH_EMAIL||'').trim().toLowerCase()!==EXPECTED_COACH_CERT_EMAIL)throw new Error('RC74_4_REMOTE_COACH_CERT_IDENTITY_MISMATCH');
const base=process.env.M26_SUPABASE_URL.replace(/\/$/,'');
if(new URL(base).hostname!==`${PROJECT_REF}.supabase.co`)throw new Error('RC74_4_REMOTE_PROJECT_MISMATCH');
const key=process.env.M26_SUPABASE_PUBLISHABLE_KEY;
if(/service[_-]?role/i.test(key))throw new Error('RC74_4_SERVICE_ROLE_FORBIDDEN');
const fingerprint=(value)=>value?createHash('sha256').update(`${PROJECT_REF}:${String(value)}`).digest('hex').slice(0,16):null;

function qaRequestOptions(url,options){
  const target=new URL(url);
  if(target.origin!==`https://${PROJECT_REF}.supabase.co`||target.username||target.password)throw new Error('QA_GATE_EGRESS_DENIED');
  return {...options,redirect:'error',signal:AbortSignal.timeout(20000)};
}
async function requestJson(url,options={}){
  const target=new URL(url);
  const authTokenRequest=target.pathname==='/auth/v1/token'&&options?.method==='POST';
  for(let attempt=0;attempt<(authTokenRequest?2:1);attempt+=1){
    try{
      const response=await fetch(url,qaRequestOptions(url,options));
      const body=await response.json().catch(()=>null);
      if(response.ok)return body;
      if(authTokenRequest&&attempt===0&&[502,503,504].includes(Number(response.status)||0)){
        await new Promise((resolve)=>setTimeout(resolve,220));
        continue;
      }
      throw new Error(`RC74_4_REMOTE_REQUEST_FAILED:${response.status}:${target.pathname}`);
    }catch(error){
      const transientNetwork=error?.name==='TypeError'||/Failed to fetch|NetworkError|network request failed/i.test(String(error?.message||error||''));
      if(authTokenRequest&&attempt===0&&transientNetwork){
        await new Promise((resolve)=>setTimeout(resolve,220));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`RC74_4_REMOTE_REQUEST_FAILED:TRANSIENT_RETRY_EXHAUSTED:${target.pathname}`);
}
async function requestResult(url,options={}){
  const response=await fetch(url,qaRequestOptions(url,options));
  const body=await response.json().catch(()=>null);
  return Object.freeze({ok:response.ok,status:Number(response.status)||0,body});
}
async function login(email,password){
  const body=await requestJson(`${base}/auth/v1/token?grant_type=password`,{
    method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({email,password}),
  });
  if(!body?.access_token||!body?.user?.id)throw new Error(`RC74_4_AUTH_FAILED:${email}`);
  return {token:body.access_token,userId:body.user.id};
}
function restHeaders(token){
  return {apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json',origin:CANARY_ORIGIN};
}
async function rpc(name,token,payload={}){
  return requestJson(`${base}/rest/v1/rpc/${name}`,{
    method:'POST',headers:restHeaders(token),body:JSON.stringify(payload),
  });
}
async function rpcResult(name,token,payload={}){
  return requestResult(`${base}/rest/v1/rpc/${name}`,{
    method:'POST',headers:restHeaders(token),body:JSON.stringify(payload),
  });
}
async function registry(token){
  const select='command_type,entity_type,event_name,allowed_roles,requires_reason,requires_preview,snapshot_on_apply,conflict_sensitive,bootstrap_allowed,enabled';
  return requestJson(`${base}/rest/v1/domain_command_registry_v26?select=${encodeURIComponent(select)}&order=command_type.asc`,{
    method:'GET',headers:{apikey:key,authorization:`Bearer ${token}`,origin:CANARY_ORIGIN},
  });
}
function normalizedApplicationRoles(value){
  return [...new Set((Array.isArray(value)?value:[]).map((role)=>String(role||'').trim().toLowerCase()).filter(Boolean))].sort();
}
const accounts=[
  {name:'coach',expectedRole:'coach',email:process.env.M26_QA_COACH_EMAIL,password:process.env.M26_QA_COACH_PASSWORD},
  {name:'client_a',expectedRole:'client',email:process.env.M26_QA_CLIENT_A_EMAIL,password:process.env.M26_QA_CLIENT_A_PASSWORD},
  {name:'client_b',expectedRole:'client',email:process.env.M26_QA_CLIENT_B_EMAIL,password:process.env.M26_QA_CLIENT_B_PASSWORD},
];
const sessions=[];
for(const account of accounts){sessions.push({...account,...await login(account.email,account.password)});}
const environment=await rpc('iberfit_environment',sessions[0].token,{});
if(environment?.environment!=='QA'||environment?.realDataAllowed!==false||environment?.productionBlocked!==true){
  throw new Error(`RC74_QA_ENVIRONMENT_GUARD_FAILED:${JSON.stringify(environment)}`);
}
const remoteRegistry=await registry(sessions[0].token);
const expectedCommands=M26_EXTENDED_COMMAND_REGISTRY.length;
const registryValidation=validateCommandCatalog(remoteRegistry,M26_EXTENDED_COMMAND_REGISTRY,{strict:true});
if(!registryValidation.ok||remoteRegistry.length!==expectedCommands)throw new Error(`RC74_4_REGISTRY_MISMATCH:${JSON.stringify(registryValidation)}`);

const roles=[];
const qaClientIds=[];
for(const session of sessions){
  const expectedRole=normalizeRegistryRole(session.expectedRole);

  if(expectedRole==='coach'){
    const assurance=await rpc('iberfit_privileged_assurance_context_v65d',session.token,{});
    const reportedRole=normalizeRegistryRole(assurance?.privilegedRole);
    if(
      assurance?.ok!==true||assurance?.privileged!==true||assurance?.mfaRequired!==true||
      assurance?.webauthnRequired!==true||assurance?.credentialEnrolled!==false||
      assurance?.emailOtpAvailable!==true||
      assurance?.iberfitAssurance!=='required'||assurance?.supabaseAal!=='aal1'||
      assurance?.origin!==CANARY_ORIGIN||assurance?.rpId!=='m26-canary.iberfit.cl'||reportedRole!=='coach'
    ){
      throw new Error('RC65_C2_REMOTE_COACH_ASSURANCE_CONTRACT_FAILED');
    }

    const bootstrapResult=await rpcResult('iberfit_bootstrap_v26',session.token,{});
    const bootstrapRole=normalizeRegistryRole(bootstrapResult?.body?.user?.role);
    if(bootstrapResult?.status!==200||!bootstrapResult?.body||typeof bootstrapResult.body!=='object'||bootstrapRole!=='coach'){
      throw new Error(`RC65_C2_REMOTE_COACH_PRIMARY_AUTH_READ_MISMATCH:status=${bootstrapResult?.status||0}:role=${bootstrapRole||'missing'}`);
    }

    roles.push({
      name:session.name,userFingerprint:fingerprint(session.userId),reportedRole,clientFingerprint:null,
      canaryActive:bootstrapResult.body?.canary?.active===true,
      environmentName:bootstrapResult.body?.environment?.name||bootstrapResult.body?.environment||null,privacy:null,
      privilegedGate:{ok:true,iberfitAssurance:'required',credentialEnrolled:false,webauthnRequired:true,emailOtpAvailable:true,
        origin:CANARY_ORIGIN,rpId:'m26-canary.iberfit.cl'},
      primaryAuthRead:{ok:true,status:200,bootstrapRole},
    });
    continue;
  }

  const applicationContext=await rpc('iberfit_application_context_v14',session.token,{});
  const applicationRoles=normalizedApplicationRoles(applicationContext?.roles);
  if(
    applicationContext?.ok!==true||
    !applicationRoles.includes('client')||applicationRoles.includes('admin')||applicationRoles.includes('coach')
  ){
    throw new Error(`RC74_4_CLIENT_ROLE_CONTEXT_MISMATCH:${session.name}:${applicationRoles.join(',')}`);
  }

  const assurance=await rpc('iberfit_privileged_assurance_context_v65d',session.token,{});
  if(
    assurance?.ok!==true||assurance?.privileged!==false||
    assurance?.mfaRequired!==false||assurance?.webauthnRequired!==false
  ){
    throw new Error(`RC74_4_CLIENT_ASSURANCE_CONTRACT_FAILED:${session.name}`);
  }

  const bootstrap=await rpc('iberfit_bootstrap_v26',session.token,{});
  const reportedRole=normalizeRegistryRole(bootstrap?.user?.role);
  if(reportedRole!==expectedRole)throw new Error(`RC74_4_ROLE_MISMATCH:${session.name}:${reportedRole}`);
  const clientId=bootstrap?.user?.clientId||bootstrap?.user?.client_id||null;
  const appointmentChanges=await rpc('iberfit_appointment_change_requests_v13',session.token,{});
  if(!appointmentChanges||typeof appointmentChanges!=='object'||!Array.isArray(appointmentChanges.requests)){
    throw new Error(`RC74_4_APPOINTMENT_CHANGE_READ_CONTRACT_FAILED:${session.name}`);
  }
  if(expectedRole==='cliente'&&!clientId)throw new Error(`RC74_4_CLIENT_ID_MISSING:${session.name}`);
  const privacy=expectedRole==='cliente'?inspectClientBootstrap(bootstrap,clientId):null;
  if(privacy&&!privacy.ok)throw new Error(`RC74_4_CLIENT_BOOTSTRAP_LEAK:${session.name}:forbidden=${privacy.forbiddenKeys.length}:foreign=${privacy.foreignClientIds.length}`);
  if(expectedRole==='cliente')qaClientIds.push(clientId);
  roles.push({
    name:session.name,userFingerprint:fingerprint(session.userId),reportedRole,clientFingerprint:fingerprint(clientId),
    applicationRoles,canaryActive:bootstrap?.canary?.active===true,environmentName:bootstrap?.environment?.name||bootstrap?.environment||null,
    privacy:privacy?{ok:privacy.ok,forbiddenKeys:privacy.forbiddenKeys,clientFingerprints:privacy.clientIds.map(fingerprint),foreignClientFingerprints:privacy.foreignClientIds.map(fingerprint)}:null,
    privilegedGate:{ok:true,required:false,privileged:false,mfaRequired:false,webauthnRequired:false},
    appointmentChangeRead:{ok:true,requestCount:appointmentChanges.requests.length},
  });
}
assertDistinctQaClientIds(qaClientIds,RC29_QA_CLIENTS_NOT_DISTINCT);
const evidence={
  release:'IBERFIT_M26_CANARY_RC74_4_PHASE_A',generatedAt:new Date().toISOString(),project:PROJECT_REF,
  mode:'authenticated-readonly',mutationsPerformed:false,expectedCommands,remoteCommands:remoteRegistry.length,
  environment:{environment:environment.environment,realDataAllowed:environment.realDataAllowed,productionBlocked:environment.productionBlocked},
  registryValidation,roles,
};
await mkdir('recovery',{recursive:true});
await writeFile('recovery/RC74_4_REMOTE_AUTH_EVIDENCE.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
