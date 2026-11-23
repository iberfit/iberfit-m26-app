// IBERFIT REAL TRAINING 360 · catalog-only ACTIVE PROD evidence, never a rollout grant.
// Exact ledger refreshed after certified 2026-11-23 M1 U72/U60 atomic migration.
// This read-only job rejects a missing active backend or widened ACL;
// green NO-GO evidence never authorizes another release or full DR.
// The Supabase Management read-only role cannot see RLS-protected business rows
// or EXECUTE the private environment RPC. DO NOT broaden database permissions
// to make this job green. This observes pg_catalog and migration metadata only.
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {HASHES as ACTIVE_BACKEND_HASHES} from '../release/verify_backend_preactivated.mjs';
export const PROD_REF='pjhmrhejsoofmouedavw';
export const EXACT_LEDGER_SHA256='7ac3c83cd710606e939159da21a08e6313e508b707868c7ae486a96faee7de56';
export const EXACT_LEDGER_TOTAL=228;
export const EXACT_LEDGER_LATEST='20261123150735';
export const REQUIRED_VERSIONS=Object.freeze([
 '20260831163404','20260831164756','20260831164829','20260831170443',
 '20260901012307','20261017003320','20261025182000','20261025194000',
 '20261025203500','20261025210500','20261025223000','20261025231500',
 '20261025235500','20261104150000',
]);
// No CTE, no RLS-protected table rows, no direct user-record query, no
// application function calls (including public.iberfit_environment()).
// pg_catalog references are metadata only; grants are INSPECTED, never changed.
export const QUERY=[
 'SELECT',
 ' (SELECT count(*)::int FROM supabase_migrations.schema_migrations WHERE version IN ('+
 REQUIRED_VERSIONS.map(x=>"'"+x+"'").join(',')+')) AS applied_migrations,',
 ' (SELECT count(*)::int FROM supabase_migrations.schema_migrations) AS migration_total,',
 ' (SELECT max(version) FROM supabase_migrations.schema_migrations) AS migration_latest,',
 " (SELECT encode(sha256(convert_to(string_agg(version||':'||coalesce(name,''),E'\\n' ORDER BY version),'UTF8')),'hex') FROM supabase_migrations.schema_migrations) AS migration_ledger_sha256,",
 " (to_regclass('public.iberfit_webauthn_credentials_v1') IS NOT NULL AND to_regclass('public.iberfit_webauthn_challenges_v1') IS NOT NULL AND to_regprocedure('public.iberfit_privileged_assurance_context_v65d()') IS NOT NULL AND to_regprocedure('public.iberfit_require_privileged_assurance_v65d()') IS NOT NULL) AS existing_webauthn,",
 " (to_regclass('public.command_operation_identities_v26') IS NOT NULL AND to_regprocedure('public.iberfit_operation_identity_guard_v26(jsonb,boolean)') IS NOT NULL) AS existing_rc74,",
 " (to_regclass('public.training_session_occurrences_v1') IS NOT NULL AND to_regprocedure('public.iberfit_occurrence_api_u60_v1(text,jsonb)') IS NOT NULL) AS staged_u60,",
 " to_regclass('public.iberfit_evolution_report_issuances_v1') IS NOT NULL AS existing_m44,",
 " to_regprocedure('public.m26_wearable_v47_my_daily_prod_v1()') IS NOT NULL AS existing_connected360,",
 " coalesce(has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE'),false) AS u60_auth_execute,",
 " coalesce(has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE'),false) AS u60_anon_execute,",
 " coalesce(has_function_privilege('authenticated','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE'),false) AS u60_detail_auth_execute,",
 " coalesce(has_function_privilege('anon','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE'),false) AS u60_detail_anon_execute,",
 " coalesce(has_function_privilege('authenticated','private.iberfit_u72_occurrence_pause_resume_v1(jsonb)','EXECUTE'),false) AS u72_private_auth_execute,",
 " coalesce(has_function_privilege('anon','private.iberfit_u72_occurrence_pause_resume_v1(jsonb)','EXECUTE'),false) AS u72_private_anon_execute,",
 " coalesce(has_table_privilege('authenticated','public.training_session_occurrences_v1','SELECT,INSERT,UPDATE,DELETE'),false) AS occurrence_direct_auth,",
 " coalesce(has_table_privilege('anon','public.training_session_occurrences_v1','SELECT,INSERT,UPDATE,DELETE'),false) AS occurrence_direct_anon,",
 " (to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NOT NULL) AS u72_installed,",
 " (to_regprocedure('private.iberfit_coach_invite_source_guard_v1()') IS NOT NULL) AS coach_guard_installed,",
 " md5(pg_get_functiondef('public.iberfit_admin_client_invitation_prepare_v26(uuid,text)'::regprocedure)) AS coach_prepare_md5,",
 " md5(pg_get_functiondef('public.iberfit_admin_client_invitation_bind_v26(uuid,uuid)'::regprocedure)) AS coach_bind_md5,",
 " md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure)) AS coach_finalize_md5,",
 " (has_function_privilege('authenticated','public.iberfit_admin_client_invitation_prepare_v26(uuid,text)','EXECUTE') AND NOT has_function_privilege('anon','public.iberfit_admin_client_invitation_prepare_v26(uuid,text)','EXECUTE')) AS coach_prepare_acl,",
 " (has_function_privilege('authenticated','public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)','EXECUTE') AND NOT has_function_privilege('anon','public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)','EXECUTE')) AS coach_finalize_acl,",
 " md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure)) AS u72_source_gateway_md5,",
 " md5(pg_get_functiondef('private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'::regprocedure)) AS u72_source_detail_md5,",
 " md5(pg_get_functiondef('private.iberfit_u60_dated_mirror_receipt_guard_v1()'::regprocedure)) AS u72_source_receipt_md5,",
 " md5(pg_get_functiondef('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)'::regprocedure)) AS u72_pause_md5,",
 " md5(pg_get_functiondef('private.iberfit_u31_occurrence_transition_v1(jsonb)'::regprocedure)) AS autonomous_start_md5,",
 " md5(pg_get_functiondef('private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)'::regprocedure)) AS autonomous_calendar_md5,",
 " md5(pg_get_functiondef('public.iberfit_occurrence_detail_v1(uuid,uuid)'::regprocedure)) AS u60_public_detail_md5,",
 " (SELECT count(*)::int FROM pg_catalog.pg_trigger t WHERE t.tgrelid=to_regclass('public.session_executions') AND t.tgname IN ('u60_dated_execution_update_receipt','u60_typed_execution_fence') AND t.tgenabled<>'D') AS u60_fences,",
 " EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public.domain_command_registry_v26') AND c.relrowsecurity) AS registry_rls,",
 " EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public.active_execution_locks_v26') AND c.relrowsecurity) AS locks_rls,",
 " EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public.domain_entities_v26') AND c.relrowsecurity) AS entities_rls,",
 " EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public.training_session_occurrences_v1') AND c.relrowsecurity) AS occurrences_rls,",
 " (to_regprocedure('public.iberfit_environment()') IS NOT NULL AND has_function_privilege('authenticated','public.iberfit_environment()','EXECUTE') AND NOT has_function_privilege('anon','public.iberfit_environment()','EXECUTE')) AS environment_rpc_acl",
].join('\n');
const rowsFor=x=>Array.isArray(x)?x:Array.isArray(x?.result)?x.result:null;
export function certifyCurrentProductionBaseline(input,{sourceSha}={}){
 const rows=rowsFor(input),d=rows?.length===1?rows[0]:null;
 if(!d||typeof d!=='object'||Array.isArray(d))throw Error('PROD_BASELINE_RESPONSE_INVALID');
 const booleans=['existing_webauthn','existing_rc74','staged_u60','existing_m44',
  'existing_connected360','u72_installed','coach_guard_installed',
  'coach_prepare_acl','coach_finalize_acl','registry_rls','locks_rls',
  'entities_rls','occurrences_rls','environment_rpc_acl'];
 for(const key of booleans)if(d[key]!==true)
  throw Error('PROD_BASELINE_MISSING_'+key.toUpperCase());
 for(const key of ['applied_migrations','migration_total','u60_fences'])
  if(!Number.isInteger(d[key])||d[key]<0||d[key]>100000000)
   throw Error('PROD_BASELINE_NUMBER_INVALID_'+key.toUpperCase());
 if(d.applied_migrations!==REQUIRED_VERSIONS.length)
  throw Error('PROD_BASELINE_MIGRATION_DRIFT');
 if(d.migration_total!==EXACT_LEDGER_TOTAL||d.migration_latest!==EXACT_LEDGER_LATEST||
   d.migration_ledger_sha256!==EXACT_LEDGER_SHA256)
  throw Error('PROD_BASELINE_FULL_LEDGER_DRIFT');
 if(d.u60_auth_execute!==true||d.u60_detail_auth_execute!==true||
   d.u60_anon_execute!==false||d.u60_detail_anon_execute!==false||
   d.u72_private_auth_execute!==false||d.u72_private_anon_execute!==false||
   d.occurrence_direct_auth!==false||d.occurrence_direct_anon!==false)
  throw Error('PROD_BASELINE_ACTIVE_U60_ACL_DRIFT');
 if(d.u60_fences!==2)throw Error('PROD_BASELINE_U60_FENCE_DRIFT');
 if(d.u72_source_gateway_md5!==ACTIVE_BACKEND_HASHES.gateway
  ||d.u72_source_detail_md5!==ACTIVE_BACKEND_HASHES.privateDetail
  ||d.u72_source_receipt_md5!==ACTIVE_BACKEND_HASHES.receipt
  ||d.u72_pause_md5!==ACTIVE_BACKEND_HASHES.u72
  ||d.autonomous_start_md5!==ACTIVE_BACKEND_HASHES.autonomousStart
  ||d.autonomous_calendar_md5!==ACTIVE_BACKEND_HASHES.autonomousCalendar
  ||d.u60_public_detail_md5!==ACTIVE_BACKEND_HASHES.detail)
  throw Error('PROD_BASELINE_ACTIVE_U72_U60_SOURCE_DRIFT');
 if(d.coach_prepare_md5!=='c6ce72f2333fbc369b66792b735dc8ef'
  ||d.coach_bind_md5!=='c8bbd63ace0634a4b1ad5f444fdd0d98'
  ||d.coach_finalize_md5!=='168dc6bd262169a58a6d9ff12558078d')
  throw Error('PROD_BASELINE_COACH_INVITATION_SOURCE_DRIFT');
 if(!/^[0-9a-f]{40}$/u.test(sourceSha||''))throw Error('PROD_BASELINE_SHA_INVALID');
 return Object.freeze({
  schema:'iberfit.production.catalog-only-no-go.v3',
  sourceSha,sourceBranch:'canary/rc74-4',projectRef:PROD_REF,
  observedState:'RC74_WEBAUTHN_U72_U60_ACTIVE_COACH_INVITE_INSTALLED',readOnly:true,
  migrationsVerified:d.applied_migrations,ledgerVersionsVerified:EXACT_LEDGER_TOTAL,
  fullMigrationLedgerVerified:true,legacyPromotionSqlRejected:true,
  u72ReviewedSourceCompatible:true,u72Installed:true,u60Authenticated:true,
  registryCountVerified:false,activeTrainingState:'UNVERIFIED_PROTECTED_RLS',
  productionSettingsVerified:false,
  requiresPrivilegedActiveTrainingRead:true,
  requiresPrivilegedRegistryCountRead:true,
  hostedAuthVaultSecretsRestored:false,platformAclRestored:false,
  backendPromotionAuthorized:false,productionReady:false,
 });
}
export function safeManagementErrorClass(payload){
 const code=String(payload?.code||payload?.error_code||'').trim();
 if(/^[A-Za-z0-9_]{2,24}$/u.test(code))return code.toUpperCase();
 const description=String(payload?.message||payload?.error||'').toLowerCase().slice(0,500);
 if(description.includes('permission denied'))return 'PERMISSION_DENIED';
 if(description.includes('read-only')||description.includes('read only'))return 'READ_ONLY_VIOLATION';
 if(description.includes('syntax error')||description.includes('parse error'))return 'SQL_SYNTAX';
 if(description.includes('does not exist'))return 'MISSING_CATALOG_OBJECT';
 return 'UNCLASSIFIED';
}
export async function inspectCurrentProduction({projectRef,sourceSha,accessToken,fetchImpl=globalThis.fetch}={}){
 if(projectRef!==PROD_REF)throw Error('PROD_BASELINE_PROJECT_DENIED');
 if(!/^[a-f0-9]{40}$/u.test(sourceSha||''))throw Error('PROD_BASELINE_SHA_DENIED');
 if(typeof accessToken!=='string'||accessToken.length<16)throw Error('PROD_BASELINE_TOKEN_MISSING');
 if(typeof fetchImpl!=='function')throw Error('PROD_BASELINE_FETCH_MISSING');
 let response;
 try{
  response=await fetchImpl('https://api.supabase.com/v1/projects/'+PROD_REF+'/database/query/read-only',{
   method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
   body:JSON.stringify({query:QUERY}),
   redirect:'error',signal:AbortSignal.timeout(18000),
  });
 }catch{throw Error('PROD_BASELINE_READ_FAILED');}
 if(!response?.ok){
  // A management error may contain SQL/private values: log only an allowlisted
  // SQLSTATE (or one coarse fixed class), never server message/SQL/identity.
  const error=await response?.json?.().catch(()=>null);
  throw Error('PROD_BASELINE_HTTP_'+String(response?.status||'UNKNOWN').slice(0,3)+'_'+
   safeManagementErrorClass(error));
 }
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
 process.stdout.write('IBERFIT_PROD_ACTIVE_U72_U60_CATALOG_ONLY_NO_GO_CERTIFIED\n');
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 main().catch(e=>{process.stderr.write(String(e?.message||'PROD_BASELINE_FAILED').slice(0,100)+'\n');process.exitCode=1;});
}
