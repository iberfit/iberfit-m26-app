import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { M26_EXTENDED_COMMAND_REGISTRY, validateCommandCatalog, normalizeRegistryRole } from '../../src/m26/command-catalog.js';
import { RC29_QA_CLIENTS_NOT_DISTINCT, assertDistinctQaClientIds } from './readonly-gate-client-isolation.mjs';
import { inspectClientBootstrap } from './readonly-gate-bootstrap-privacy.mjs';
// Privacy contract includes private.?notes?; empty containers are allowed, populated ones fail closed.

const PROJECT_REF='pjhmrhejsoofmouedavw';
const required=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
];
const missing=required.filter((name)=>!process.env[name]);
if(missing.length)throw new Error(`RC29_REMOTE_ENV_MISSING:${missing.join(',')}`);
const base=process.env.M26_SUPABASE_URL.replace(/\/$/,'');
if(new URL(base).hostname!==`${PROJECT_REF}.supabase.co`)throw new Error('RC29_REMOTE_PROJECT_MISMATCH');
const key=process.env.M26_SUPABASE_PUBLISHABLE_KEY;
if(/service[_-]?role/i.test(key))throw new Error('RC29_SERVICE_ROLE_FORBIDDEN');
const fingerprint=(value)=>value?createHash('sha256').update(`${PROJECT_REF}:${String(value)}`).digest('hex').slice(0,16):null;

async function requestJson(url,options={}){
  const response=await fetch(url,options);
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(`RC29_REMOTE_REQUEST_FAILED:${response.status}:${new URL(url).pathname}`);
  return body;
}
async function login(email,password){
  const body=await requestJson(`${base}/auth/v1/token?grant_type=password`,{
    method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({email,password}),
  });
  if(!body?.access_token||!body?.user?.id)throw new Error(`RC29_AUTH_FAILED:${email}`);
  return {token:body.access_token,userId:body.user.id};
}
async function rpc(name,token,payload={}){
  return requestJson(`${base}/rest/v1/rpc/${name}`,{
    method:'POST',headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload),
  });
}
async function registry(token){
  const select='command_type,entity_type,event_name,allowed_roles,requires_reason,requires_preview,enabled';
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
const remoteRegistry=await registry(sessions[0].token);
const registryValidation=validateCommandCatalog(remoteRegistry,M26_EXTENDED_COMMAND_REGISTRY,{strict:true});
if(!registryValidation.ok||remoteRegistry.length!==52)throw new Error(`RC29_REGISTRY_MISMATCH:${JSON.stringify(registryValidation)}`);

const roles=[];
const qaClientIds=[];
for(const session of sessions){
  const bootstrap=await rpc('iberfit_bootstrap_v26',session.token,{});
  const reportedRole=normalizeRegistryRole(bootstrap?.user?.role);
  const expectedRole=normalizeRegistryRole(session.expectedRole);
  if(reportedRole!==expectedRole)throw new Error(`RC29_ROLE_MISMATCH:${session.name}:${reportedRole}`);
  const clientId=bootstrap?.user?.clientId||bootstrap?.user?.client_id||null;
  if(session.expectedRole==='client'&&!clientId)throw new Error(`RC29_CLIENT_ID_MISSING:${session.name}`);
  const privacy=session.expectedRole==='client'?inspectClientBootstrap(bootstrap,clientId):null;
  if(privacy&&!privacy.ok)throw new Error(`RC29_CLIENT_BOOTSTRAP_LEAK:${session.name}:forbidden=${privacy.forbiddenKeys.length}:foreign=${privacy.foreignClientIds.length}`);
  if(session.expectedRole==='client')qaClientIds.push(clientId);
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
  release:'IBERFIT_M26_PREPUBLICACION_INFRA_RC29',generatedAt:new Date().toISOString(),project:PROJECT_REF,
  mode:'authenticated-readonly',mutationsPerformed:false,expectedCommands:52,remoteCommands:remoteRegistry.length,
  registryValidation,roles,
};
await mkdir('recovery',{recursive:true});
await writeFile('recovery/RC29_REMOTE_AUTH_EVIDENCE.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
