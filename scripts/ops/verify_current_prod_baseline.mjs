// IBERFIT REAL TRAINING 360: current PROD catalog, READ-ONLY only.
// A green result is NOT permission to deploy a legacy SQL bundle.
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const PROD_REF='pjhmrhejsoofmouedavw';
export const REQUIRED_VERSIONS=Object.freeze([
 '20260831163404','20260831164756','20260831164829','20260831170443',
 '20260901012307','20261017003320','20261025182000','20261025194000',
 '20261025203500','20261025210500','20261025223000','20261025231500',
 '20261025235500','20261104150000',
]);
export const QUERY=[
 'WITH required(version) AS (VALUES '+REQUIRED_VERSIONS.map(x=>"('"+x+"')").join(',')+')',
 'SELECT',
 ' (SELECT count(*)::int FROM required e WHERE EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version=e.version)) AS applied_migrations,',
 " (to_regclass('public.iberfit_webauthn_credentials_v1') IS NOT NULL AND to_regclass('public.iberfit_webauthn_challenges_v1') IS NOT NULL AND to_regprocedure('public.iberfit_privileged_assurance_context_v65d()') IS NOT NULL AND to_regprocedure('public.iberfit_require_privileged_assurance_v65d()') IS NOT NULL) AS existing_webauthn,",
 " (to_regclass('public.command_operation_identities_v26') IS NOT NULL AND to_regprocedure('public.iberfit_operation_identity_guard_v26(jsonb,boolean)') IS NOT NULL) AS existing_rc74,",
 " (to_regclass('public.training_session_occurrences_v1') IS NOT NULL AND to_regprocedure('public.iberfit_occurrence_api_u60_v1(text,jsonb)') IS NOT NULL) AS staged_u60,",
 " to_regclass('public.iberfit_evolution_report_issuances_v1') IS NOT NULL AS existing_m44,",
 " to_regprocedure('public.m26_wearable_v47_my_daily_prod_v1()') IS NOT NULL AS existing_connected360,",
 " (SELECT count(*)::int FROM public.domain_command_registry_v26 WHERE enabled=true) AS enabled_commands,",
 " coalesce(has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE'),false) AS u60_auth_execute,",
 " coalesce(has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE'),false) AS u60_anon_execute,",
 " (SELECT count(*)::int FROM public.active_execution_locks_v26) AS active_locks,",
 " (SELECT count(*)::int FROM public.domain_entities_v26 WHERE entity_type='session_execution' AND status IN ('en_curso','pausada')) AS active_legacy_executions,",
 " (public.iberfit_environment()->>'environment'='PRODUCTION') AS prod_environment",
].join('\n');
const rowsFor=x=>Array.isArray(x)?x:Array.isArray(x?.result)?x.result:null;
export function certifyCurrentProductionBaseline(input,{sourceSha}={}){
 const a=rowsFor(input);const d=a?.length===1?a[0]:null;
 if(!d||typeof d!=='object'||Array.isArray(d))
  throw Error('PROD_BASELINE_RESPONSE_INVALID');
 for(const key of ['existing_webauthn','existing_rc74','staged_u60','existing_m44','existing_connected360','prod_environment'])
  if(d[key]!==true)throw Error('PROD_BASELINE_MISSING_'+key.toUpperCase());
 for(const key of ['applied_migrations','enabled_commands','active_locks','active_legacy_executions'])
  if(!Number.isInteger(d[key])||d[key]<0||d[key]>100000000)
   throw Error('PROD_BASELINE_NUMBER_INVALID_'+key.toUpperCase());
 if(d.applied_migrations!==REQUIRED_VERSIONS.length)
  throw Error('PROD_BASELINE_MIGRATION_DRIFT');
 if(d.enabled_commands!==58)throw Error('PROD_BASELINE_REGISTRY_DRIFT');
 if(d.u60_auth_execute!==false||d.u60_anon_execute!==false)
  throw Error('PROD_BASELINE_U60_GRANT_DRIFT');
 if(!/^[0-9a-f]{40}$/u.test(sourceSha||''))throw Error('PROD_BASELINE_SHA_INVALID');
 return Object.freeze({
  schema:'iberfit.production.current-baseline-observation.v1',
  sourceSha,sourceBranch:'canary/rc74-4',projectRef:PROD_REF,
  observedState:'RC74_WEBAUTHN_U60_STAGED',readOnly:true,
  migrationsVerified:d.applied_migrations,legacyPromotionSqlRejected:true,
  activeTraining:d.active_locks>0||d.active_legacy_executions>0,
  hostedAuthVaultSecretsRestored:false,platformAclRestored:false,
  backendPromotionAuthorized:false,productionReady:false,
 });
}
export async function inspectCurrentProduction({projectRef,sourceSha,accessToken,fetchImpl=globalThis.fetch}={}){
 if(projectRef!==PROD_REF)throw Error('PROD_BASELINE_PROJECT_DENIED');
 if(!/^[0-9a-f]{40}$/u.test(sourceSha||''))throw Error('PROD_BASELINE_SHA_DENIED');
 if(typeof accessToken!=='string'||accessToken.length<16)throw Error('PROD_BASELINE_TOKEN_MISSING');
 if(typeof fetchImpl!=='function')throw Error('PROD_BASELINE_FETCH_MISSING');
 let response;
 try{
  response=await fetchImpl('https://api.supabase.com/v1/projects/'+PROD_REF+'/database/query/read-only',{
   method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
   body:JSON.stringify({query:QUERY}),redirect:'error',signal:AbortSignal.timeout(18000),
  });
 }catch{throw Error('PROD_BASELINE_READ_FAILED');}
 if(!response?.ok)throw Error('PROD_BASELINE_HTTP_'+String(response?.status||'UNKNOWN').slice(0,3));
 let result;
 try{result=await response.json()}catch{throw Error('PROD_BASELINE_JSON_INVALID');}
 return certifyCurrentProductionBaseline(result,{sourceSha});
}
async function main(){
 const e=process.env;
 if(e.GITHUB_ACTIONS!=='true'||e.GITHUB_REPOSITORY!=='iberfit/iberfit-m26-app'
  ||e.GITHUB_REF!=='refs/heads/canary/rc74-4'||e.GITHUB_EVENT_NAME!=='push')
  throw Error('PROD_BASELINE_PROTECTED_CANARY_PUSH_ONLY');
 const result=await inspectCurrentProduction({
  projectRef:e.PROD_SUPABASE_REF,sourceSha:e.GITHUB_SHA,
  accessToken:e.SUPABASE_ACCESS_TOKEN,
 });
 await mkdir('recovery',{recursive:true});
 await writeFile('recovery/PROD_CURRENT_BASELINE_READONLY.json',
  JSON.stringify({...result,observedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
 process.stdout.write('IBERFIT_PROD_LEGACY_SQL_RETIRED_CURRENT_BASELINE_VERIFIED_NON_PROMOTABLE\n');
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 main().catch(e=>{process.stderr.write(String(e?.message||'PROD_BASELINE_FAILED').slice(0,100)+'\n');process.exitCode=1;});
}
