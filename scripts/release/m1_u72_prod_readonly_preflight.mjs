// IBERFIT M1 U72: protected operator read-only database preflight.
// This is evidence of a CLOSED, compatible DB baseline; NEVER release authority.
// No DB connector, secret, user content, write operation or hosted Auth assertion.
export const U72_READONLY_SCHEMA='iberfit.prod.u72.preflight-readonly.v1';
export const REQUIRED_VERSIONS=Object.freeze([
 '20261025182000','20261025194000','20261025203500',
 '20261025210500','20261025223000','20261025231500',
 '20261025235500','20261104150000',
]);
export const FUNCTIONS=Object.freeze({
 u60_gateway:Object.freeze({signature:'public.iberfit_occurrence_api_u60_v1(text,jsonb)',
   hash:'5914acf371015a6bbeeaf95f99e056e3'}),
 u60_detail_private:Object.freeze({signature:'private.iberfit_u60_occurrence_detail_v1(uuid,uuid)',
   hash:'35862b8e4977fcf0c3d611937fe83126'}),
 u60_receipt:Object.freeze({signature:'private.iberfit_u60_dated_mirror_receipt_guard_v1()',
   hash:'f97d7df4fdd510b63ac1249352273927'}),
 u60_detail_public:Object.freeze({signature:'public.iberfit_occurrence_detail_v1(uuid,uuid)',
   hash:'00b8ee39c85fd92f593732c055902cf2'}),
});
const sqlLiteral=value=>"'"+String(value).replaceAll("'","''")+"'";
const defs=Object.entries(FUNCTIONS).map(([k,x])=>
 '('+[k,x.signature,x.hash].map(sqlLiteral).join(',')+')').join(',\n');
const versions=REQUIRED_VERSIONS.map(x=>'('+sqlLiteral(x)+')').join(',');
export const QUERY=`WITH expected_functions(key,sig,expected_hash) AS (
 VALUES ${defs}
), funcs AS (
 SELECT e.key,
  p.oid IS NOT NULL AS present,
  coalesce(md5(pg_get_functiondef(p.oid))=e.expected_hash,false) AS "hashOK",
  coalesce(p.prosecdef,false) AS "securityDefiner",
  coalesce(pg_get_userbyid(p.proowner)='postgres',false) AS "postgresOwner",
  coalesce(p.proconfig @> ARRAY['search_path=""']::text[],false) AS "emptySearchPath",
  coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) AS "authCanExecute",
  coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) AS "anonCanExecute",
  coalesce(has_function_privilege('service_role',p.oid,'EXECUTE'),false) AS "serviceCanExecute"
 FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.sig)
), versions(v) AS (VALUES ${versions}),
 settings AS (
 SELECT jsonb_object_agg(key,value #>> '{}') AS k
 FROM public.iberfit_system_settings
 WHERE key IN ('environment','real_data_allowed','production_blocked')
), active AS (
 SELECT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
               WHERE status='en_curso') AS active_dates,
 EXISTS(SELECT 1 FROM public.domain_entities_v26
        WHERE entity_type='session_execution' AND status='pausada') AS paused_executions
), fences AS (
 SELECT EXISTS(SELECT 1 FROM pg_trigger
    WHERE tgrelid=to_regclass('public.session_executions')
      AND tgname='u60_dated_execution_update_receipt' AND tgenabled<>'D'
      AND NOT tgisinternal) AS receipt_guard_on,
 EXISTS(SELECT 1 FROM pg_trigger
    WHERE tgrelid=to_regclass('public.session_executions')
      AND tgname='u60_typed_execution_fence' AND tgenabled<>'D'
      AND NOT tgisinternal) AS typed_fence_on
), old_entry AS (
 SELECT coalesce(has_function_privilege('authenticated',
        to_regprocedure('public.iberfit_occurrence_api_v1(text,jsonb)'),'EXECUTE'),false) AS legacy_auth,
 coalesce(has_function_privilege('anon',
        to_regprocedure('public.iberfit_occurrence_api_v1(text,jsonb)'),'EXECUTE'),false) AS legacy_anon
), occurrences AS (
 SELECT relrowsecurity AS rls_enabled,
 has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') AS auth_direct_all,
 has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_direct_all
 FROM pg_class WHERE oid=to_regclass('public.training_session_occurrences_v1')
)
SELECT jsonb_build_object(
 'schema','iberfit.prod.u72.preflight-readonly.v1',
 'environment',(SELECT k FROM settings),
 'functionBaselines',(SELECT jsonb_object_agg(key,jsonb_build_object(
  'present',present,'hashOK',"hashOK",
  'securityDefiner',"securityDefiner",'postgresOwner',"postgresOwner",
  'emptySearchPath',"emptySearchPath",'authCanExecute',"authCanExecute",
  'anonCanExecute',"anonCanExecute",'serviceCanExecute',"serviceCanExecute"))
  FROM funcs),
 'missingRequiredMigrations',(SELECT count(*) FROM versions v WHERE NOT EXISTS
   (SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version=v.v)),
 'occurrence',(SELECT to_jsonb(occurrences) FROM occurrences),
 'fences',(SELECT to_jsonb(fences) FROM fences),
 'activity',(SELECT to_jsonb(active) FROM active),
 'legacyEntry',(SELECT to_jsonb(old_entry) FROM old_entry),
 'u72AlreadyInstalled',
   to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NOT NULL
) AS report`;
const guard=(ok,label)=>{if(!ok)throw Error('M1_U72_PROD_PREFLIGHT_'+label);};
function exactBooleans(object,expected,label){
 guard(object&&typeof object==='object'&&!Array.isArray(object),label+'_INVALID');
 for(const [k,v] of Object.entries(expected))guard(object[k]===v,label+'_'+k.toUpperCase());
}
export function evaluateProdU72ReadOnlyPreflight(input){
 const data=Array.isArray(input)?input.length===1?input[0]?.report:null:
  Array.isArray(input?.result)?input.result.length===1?input.result[0]?.report:null:
  input?.report??input;
 guard(data&&typeof data==='object'&&!Array.isArray(data),'RESPONSE_INVALID');
 guard(data.schema===U72_READONLY_SCHEMA,'SCHEMA_INVALID');
 exactBooleans(data.environment,{
  environment:'PRODUCTION',real_data_allowed:'true',production_blocked:'false'
 },'ENVIRONMENT');
 guard(data.missingRequiredMigrations===0,'MIGRATION_DRIFT');
 exactBooleans(data.activity,{active_dates:false,paused_executions:false},'ACTIVE_TRAINING');
 exactBooleans(data.fences,{receipt_guard_on:true,typed_fence_on:true},'FENCES');
 exactBooleans(data.legacyEntry,{legacy_auth:false,legacy_anon:false},'LEGACY_GRANTS');
 exactBooleans(data.occurrence,{rls_enabled:true,anon_direct_all:false,auth_direct_all:false},'RLS');
 guard(data.u72AlreadyInstalled===false,'U72_STATE_DRIFT');
 guard(data.functionBaselines&&typeof data.functionBaselines==='object'&&
  !Array.isArray(data.functionBaselines)&&
  Object.keys(data.functionBaselines).sort().join(',')===
   Object.keys(FUNCTIONS).sort().join(','),'FUNCTION_SET_DRIFT');
 for(const name of Object.keys(FUNCTIONS)){
  exactBooleans(data.functionBaselines[name],{
   present:true,hashOK:true,securityDefiner:true,postgresOwner:true,
   emptySearchPath:true,authCanExecute:false,
   anonCanExecute:false,serviceCanExecute:false
  },'FUNCTION_'+name.toUpperCase());
 }
 return Object.freeze({
  dbInstallPreflightReady:true,readOnly:true,
  checks:4+8+2+2,
  databaseWrites:0,productionReleaseAuthorized:false,
  platformRecoveryVerified:false,hostedAuthRecoveryVerified:false,
  billedEgressVerified:false,liveCoachClientAcceptanceVerified:false,
 });
}
