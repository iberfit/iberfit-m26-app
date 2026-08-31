import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { M26_EXTENDED_COMMAND_REGISTRY, validateCommandCatalog, normalizeRegistryRole } from '../../src/m26/command-catalog.js';
import { RC29_QA_CLIENTS_NOT_DISTINCT, assertDistinctQaClientIds } from './readonly-gate-client-isolation.mjs';
import { inspectClientBootstrap } from './readonly-gate-bootstrap-privacy.mjs';
// Privacy contract includes private.?notes?; empty containers are allowed, populated ones fail closed.

const PROJECT_REF='gjztkdwfmunnzhtvxrsu';
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
const base=process.env.M26_SUPABASE_URL.replace(/\/$/,'');
if(new URL(base).hostname!==`${PROJECT_REF}.supabase.co`)throw new Error('RC74_4_REMOTE_PROJECT_MISMATCH');
const key=process.env.M26_SUPABASE_PUBLISHABLE_KEY;
if(/service[_-]?role/i.test(key))throw new Error('RC74_4_SERVICE_ROLE_FORBIDDEN');
const fingerprint=(value)=>value?createHash('sha256').update(`${PROJECT_REF}:${String(value)}`).digest('hex').slice(0,16):null;

async function requestJson(url,options={}){
  const response=await fetch(url,options);
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(`RC74_4_REMOTE_REQUEST_FAILED:${response.status}:${new URL(url).pathname}`);
  return body;
}
async function requestResult(url,options={}){
  const response=await fetch(url,options);
  const body=await response.json().catch(()=>null);
  return Object.freeze({
    ok:response.ok,
    status:Number(response.status)||0,
    body,
  });
}
async function login(email,password){
  const body=await requestJson(`${base}/auth/v1/token?grant_type=password`,{
    method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({email,password}),
  });
  if(!body?.access_token||!body?.user?.id)throw new Error(`RC74_4_AUTH_FAILED:${email}`);
  return {token:body.access_token,userId:body.user.id};
}
async function rpc(name,token,payload={}){
  return requestJson(`${base}/rest/v1/rpc/${name}`,{
    method:'POST',headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload),
  });
}
async function rpcResult(name,token,payload={}){
  return requestResult(`${base}/rest/v1/rpc/${name}`,{
    method:'POST',headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload),
  });
}
async function registry(token){
  const select='command_type,entity_type,event_name,allowed_roles,requires_reason,requires_preview,snapshot_on_apply,conflict_sensitive,bootstrap_allowed,enabled';
  return requestJson(`${base}/rest/v1/domain_command_registry_v26?select=${encodeURIComponent(select)}&order=command_type.asc`,{
    method:'GET',headers:{apikey:key,authorization:`Bearer ${token}`},
  });
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
const registryValidation=validateCommandCatalog(remoteRegistry,M26_EXTENDED_COMMAND_REGISTRY,{strict:true});
if(!registryValidation.ok||remoteRegistry.length!==52)throw new Error(`RC74_4_REGISTRY_MISMATCH:${JSON.stringify(registryValidation)}`);

const roles=[];
const qaClientIds=[];
for(const session of sessions){
  const expectedRole=normalizeRegistryRole(session.expectedRole);

  if(expectedRole==='coach'){
    const assurance=await rpc('iberfit_privileged_assurance_context_v65d',session.token,{});
    const reportedRole=normalizeRegistryRole(assurance?.privilegedRole);
    if(
      assurance?.ok!==true||
      assurance?.privileged!==true||
      assurance?.mfaRequired!==true||
      assurance?.webauthnRequired!==true||
      assurance?.credentialEnrolled!==true||
      assurance?.iberfitAssurance!=='required'||
      assurance?.supabaseAal!=='aal1'||
      reportedRole!=='coach'
    ){
      throw new Error('RC65_C2_REMOTE_COACH_ASSURANCE_CONTRACT_FAILED');
    }

    const blocked=await rpcResult('iberfit_bootstrap_v26',session.token,{});
    const blockedMessage=String(blocked?.body?.message||'');
    const blockedCode=String(blocked?.body?.code||'');
    if(
      blocked?.status!==403||
      blockedMessage!=='IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED'
    ){
      throw new Error(`RC65_C2_REMOTE_COACH_FAIL_CLOSED_MISMATCH:status=${blocked?.status||0}:message=${blockedMessage.slice(0,80)}`);
    }

    roles.push({
      name:session.name,
      userFingerprint:fingerprint(session.userId),
      reportedRole,
      clientFingerprint:null,
      canaryActive:null,
      environmentName:null,
      privacy:null,
      privilegedGate:{
        ok:true,
        status:403,
        code:/^[A-Z0-9]{3,16}$/u.test(blockedCode)?blockedCode:'NONE',
        message:'IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED',
        iberfitAssurance:'required',
        credentialEnrolled:true,
        webauthnRequired:true,
      },
    });
    continue;
  }

  const bootstrap=await rpc('iberfit_bootstrap_v26',session.token,{});
  const reportedRole=normalizeRegistryRole(bootstrap?.user?.role);
  if(reportedRole!==expectedRole)throw new Error(`RC74_4_ROLE_MISMATCH:${session.name}:${reportedRole}`);
  const clientId=bootstrap?.user?.clientId||bootstrap?.user?.client_id||null;
  if(expectedRole==='client'&&!clientId)throw new Error(`RC74_4_CLIENT_ID_MISSING:${session.name}`);
  const privacy=expectedRole==='client'?inspectClientBootstrap(bootstrap,clientId):null;
  if(privacy&&!privacy.ok)throw new Error(`RC74_4_CLIENT_BOOTSTRAP_LEAK:${session.name}:forbidden=${privacy.forbiddenKeys.length}:foreign=${privacy.foreignClientIds.length}`);
  if(expectedRole==='client')qaClientIds.push(clientId);
  roles.push({
    name:session.name,
    userFingerprint:fingerprint(session.userId),
    reportedRole,
    clientFingerprint:fingerprint(clientId),
    canaryActive:bootstrap?.canary?.active===true,
    environmentName:bootstrap?.environment?.name||bootstrap?.environment||null,
    privacy:privacy?{
      ok:privacy.ok,
      forbiddenKeys:privacy.forbiddenKeys,
      clientFingerprints:privacy.clientIds.map(fingerprint),
      foreignClientFingerprints:privacy.foreignClientIds.map(fingerprint),
    }:null,
  });
}
assertDistinctQaClientIds(qaClientIds,RC29_QA_CLIENTS_NOT_DISTINCT);
const evidence={
  release:'IBERFIT_M26_CANARY_RC74_4_PHASE_A',generatedAt:new Date().toISOString(),project:PROJECT_REF,
  mode:'authenticated-readonly',mutationsPerformed:false,expectedCommands:52,remoteCommands:remoteRegistry.length,
  environment:{environment:environment.environment,realDataAllowed:environment.realDataAllowed,productionBlocked:environment.productionBlocked},
  registryValidation,roles,
};
await mkdir('recovery',{recursive:true});
await writeFile('recovery/RC74_4_REMOTE_AUTH_EVIDENCE.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
