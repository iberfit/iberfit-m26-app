// M44: read-only managed runtime inventory. No secret values are retained or printed.
// Presence does NOT certify credential recoverability, hosted failover, or PROD cutover.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {validateAuthConfigRecord} from './m44_hosted_auth_config_archive.mjs';
import {attestM44ExternalEscrow} from './m44_external_escrow_digest_parity.mjs';

const PROJECT='pjhmrhejsoofmouedavw',REPO='iberfit/iberfit-m26-app';
const SHA=/^[a-f0-9]{40}$/u,HEX=/^[a-f0-9]{64}$/u,KEY=/^[A-Z][A-Z0-9_]{2,100}$/u;
const fail=code=>{throw Error('M44_RUNTIME_PRESENCE_'+code);};
const unique=values=>new Set(values).size===values.length;
export function assessM44RuntimePresence({source,inventory,functions,secrets,authConfig}){
  if(!source||source.source_project_ref!==PROJECT||!Array.isArray(source.sources)||
    source.sources.length!==16||!unique(source.sources.map(x=>x.slug)))
    fail('SOURCE_INVENTORY_INVALID');
  if(!inventory||inventory.project_ref!==PROJECT||!Array.isArray(inventory.functions)||
    !inventory.classes||!Array.isArray(inventory.classes.external_or_operator_provided)||
    inventory.functions.length!==16)fail('RUNTIME_INVENTORY_INVALID');
  if(!Array.isArray(functions)||functions.length!==16||!unique(functions.map(x=>x.slug)))
    fail('DEPLOYED_FUNCTIONS_INVALID');
  const deployed=new Map(functions.map(x=>[x.slug,x]));
  for(const entry of source.sources){
    if(typeof entry.slug!=='string'||!HEX.test(entry.live_bundle_sha256||'')||
      typeof entry.verify_jwt!=='boolean')fail('SOURCE_ENTRY_INVALID');
    const actual=deployed.get(entry.slug);
    if(!actual||actual.status!=='ACTIVE'||actual.verify_jwt!==entry.verify_jwt||
      actual.ezbr_sha256!==entry.live_bundle_sha256)fail('DEPLOYMENT_IDENTITY_DRIFT');
  }
  const configured=new Set();
  if(!Array.isArray(secrets)||secrets.length>500)fail('SECRET_METADATA_INVALID');
  for(const item of secrets){
    // Management API may include value-bearing fields in metadata responses.
    // Deliberately read ONLY the name; never inspect, copy, log or return values.
    if(!item||typeof item!=='object'||Array.isArray(item)||
      !Object.hasOwn(item,'name')||typeof item.name!=='string'||!KEY.test(item.name))
      fail('SECRET_METADATA_UNSAFE');
    if(configured.has(item.name))fail('SECRET_METADATA_DUPLICATE');
    configured.add(item.name);
  }
  const required=inventory.classes.external_or_operator_provided;
  if(!unique(required)||required.some(x=>!KEY.test(x)))fail('REQUIRED_NAMES_INVALID');
  const ai=['GEMINI_API_KEY','GOOGLE_API_KEY'].some(x=>configured.has(x));
  const vapid=['IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY',
    'IBERFIT_WEB_PUSH_VAPID_PUBLIC_KEY','IBERFIT_WEB_PUSH_VAPID_SUBJECT']
    .every(x=>configured.has(x));
  for(const name of ['GEMINI_API_KEY','GOOGLE_API_KEY',
    'IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY','IBERFIT_WEB_PUSH_VAPID_PUBLIC_KEY',
    'IBERFIT_WEB_PUSH_VAPID_SUBJECT'])
    if(!required.includes(name))fail('RUNTIME_INVENTORY_DRIFT');
  if(!inventory.functions.every(item=>source.sources.some(src=>src.slug===item.slug)))
    fail('INVENTORY_SOURCE_MISMATCH');
  try{validateAuthConfigRecord({
    schema:'iberfit.m44.hosted-auth-config-archive.v1',project_ref:PROJECT,config:authConfig
  });}catch{fail('HOSTED_AUTH_CONFIGURATION_DRIFT');}
  return Object.freeze({
    deployedFunctionsVerified:16,runtimeNamesInspected:configured.size,
    aiConfigured:ai,pushConfigured:vapid,hostedAuthConfigurationValid:true,
    runtimeNamesPresent:ai&&vapid,credentialValuesRecovered:false,
    remoteIntegrationsProbed:false,hostedAuthRecovered:false,
    fullPlatformRecoveryCertified:false,productionActivationAuthorized:false
  });
}
async function management(path,token){
  const response=await fetch('https://api.supabase.com/v1/projects/'+PROJECT+path,{
    method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(20000)});
  if(!response.ok)fail('MANAGEMENT_READ_DENIED');
  const body=await response.text();
  if(!body||body.length>1024*1024)fail('MANAGEMENT_RESPONSE_INVALID');
  try{return JSON.parse(body);}catch{fail('MANAGEMENT_JSON_INVALID');}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    if(process.argv.length!==2||process.env.GITHUB_ACTIONS!=='true'||
      process.env.GITHUB_EVENT_NAME!=='push'||process.env.GITHUB_REPOSITORY!==REPO||
      process.env.GITHUB_REF!=='refs/heads/canary/rc74-4'||
      !SHA.test(process.env.GITHUB_SHA||'')||
      process.env.M44_RUNTIME_PRESENCE_READONLY!=='true'||
      (process.env.SUPABASE_ACCESS_TOKEN||'').length<20)fail('PROTECTED_CONTEXT_REQUIRED');
    const root=new URL('../../',import.meta.url);
    const source=JSON.parse(readFileSync(new URL('scripts/ops/m44_prod_edge_recovery_sources.json',root),'utf8'));
    const inventory=JSON.parse(readFileSync(new URL('scripts/ops/m44_edge_runtime_config_inventory.json',root),'utf8'));
    const token=process.env.SUPABASE_ACCESS_TOKEN;
    const [functions,secrets,authConfig]=await Promise.all([
      management('/functions',token),management('/secrets',token),management('/config/auth',token)]);
    const result=assessM44RuntimePresence({source,inventory,functions,secrets,authConfig});
    // Optional operator escrow candidates exist only in this protected GitHub
    // environment, never in the repo, logs, backup artifact, or returned proof.
    const escrow=attestM44ExternalEscrow({
      managedSecrets:secrets,
      candidates:{
        GEMINI_API_KEY:process.env.IBERFIT_M44_RECOVERY_GEMINI_API_KEY,
        GOOGLE_API_KEY:process.env.IBERFIT_M44_RECOVERY_GOOGLE_API_KEY,
        IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY:
          process.env.IBERFIT_M44_RECOVERY_WEB_PUSH_VAPID_PRIVATE_KEY,
        IBERFIT_WEB_PUSH_VAPID_PUBLIC_KEY:
          process.env.IBERFIT_M44_RECOVERY_WEB_PUSH_VAPID_PUBLIC_KEY,
        IBERFIT_WEB_PUSH_VAPID_SUBJECT:
          process.env.IBERFIT_M44_RECOVERY_WEB_PUSH_VAPID_SUBJECT
      },
      smtpCandidate:process.env.IBERFIT_M44_RECOVERY_SMTP_PASSWORD
    });
    console.log('M44_RUNTIME_READONLY_CHECK:edge='+result.deployedFunctionsVerified+
      ':names='+result.runtimeNamesInspected+':ai='+Number(result.aiConfigured)+
      ':push='+Number(result.pushConfigured)+':hosted_config=1:prod_writes=0');
    console.log('M44_EXTERNAL_ESCROW_READONLY:configured='+escrow.managedExternalNames+
      ':source_sha256='+Number(escrow.digestMetadataCompatible)+
      ':external_exact_matches='+escrow.matchingIndependentCandidates+
      ':ai_match='+Number(escrow.aiCandidateMatched)+
      ':vapid_match='+Number(escrow.vapidCandidateMatched)+
      ':smtp_candidate_present='+Number(escrow.smtpCandidatePresent)+
      ':smtp_match_verified=0:production_writes=0');
    console.log('M44_PLATFORM_RECOVERY_NOT_CERTIFIED:independent_live_restore=0:external_providers_unverified=1');
    if(!result.runtimeNamesPresent)fail('EXTERNAL_SECRET_NAMES_MISSING');
  }catch(error){
    const message=String(error?.message||'');
    console.error(message.startsWith('M44_RUNTIME_PRESENCE_')?message:
      'M44_RUNTIME_PRESENCE_CHECK_FAILED');
    process.exitCode=1;
  }
}