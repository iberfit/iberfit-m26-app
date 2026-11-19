// Read-only LIVE backend attestation. This does not authorize a backend mutation
// or certify full Hosted Auth/JWT/Vault disaster recovery.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const PROJECT='pjhmrhejsoofmouedavw';
export const EDGE_DIGEST='c847ac0732966de086e82a4b4a5570719a18a9159b75a141305b3e136efc0e5d';
export const HASHES=Object.freeze({
 u72:'1270cf1db8c9a162ccc5736207a258e1',
 gateway:'944aaac897289954a9c589292d8faf87',
 detail:'00b8ee39c85fd92f593732c055902cf2',
 privateDetail:'dd1027122e0843b44529cf87dad746b5',
 receipt:'65e675f56c67aa8f9ddc4b36f3a9a73d',
 coachPrepare:'c6ce72f2333fbc369b66792b735dc8ef',
 coachBind:'c8bbd63ace0634a4b1ad5f444fdd0d98',
 coachFinalize:'168dc6bd262169a58a6d9ff12558078d',
});
const FUNCTIONS=[
 ['u72','private.iberfit_u72_occurrence_pause_resume_v1(jsonb)',false],
 ['gateway','public.iberfit_occurrence_api_u60_v1(text,jsonb)',true],
 ['detail','public.iberfit_occurrence_detail_v1(uuid,uuid)',true],
 ['privateDetail','private.iberfit_u60_occurrence_detail_v1(uuid,uuid)',false],
 ['receipt','private.iberfit_u60_dated_mirror_receipt_guard_v1()',false],
 ['coachPrepare','public.iberfit_admin_client_invitation_prepare_v26(uuid,text)',true],
 ['coachBind','public.iberfit_admin_client_invitation_bind_v26(uuid,uuid)',true],
 ['coachFinalize','public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)',true],
];
const VALUES=FUNCTIONS.map(([key,signature,allowed])=>
 "('"+key+"','"+signature+"','"+HASHES[key]+"',"+allowed+")").join(',\n');
export const SQL=`WITH expected(name,signature,hash,auth_allowed) AS (VALUES ${VALUES}),
procs AS (
 SELECT e.name,p.oid is not null as present,
   coalesce(md5(pg_get_functiondef(p.oid))=e.hash,false) as hash_ok,
   coalesce(p.prosecdef,false) as security_definer,
   coalesce(pg_get_userbyid(p.proowner)='postgres',false) as owner_ok,
   coalesce(p.proconfig @> ARRAY['search_path=""']::text[],false) as safe_path,
   coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE')=e.auth_allowed,false) as auth_acl_ok,
   coalesce(not has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_denied
 FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
)
SELECT jsonb_build_object(
 'environment',(SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment'),
 'realData',(SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='real_data_allowed'),
 'productionBlocked',(SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='production_blocked'),
 'functions',(SELECT jsonb_agg(to_jsonb(procs) ORDER BY name) FROM procs),
 'coachGuard',(SELECT to_regprocedure('private.iberfit_coach_invite_source_guard_v1()') IS NOT NULL),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.training_session_occurrences_v1'::regclass),
 'directAuth',(SELECT has_table_privilege('authenticated','public.training_session_occurrences_v1','SELECT,INSERT,UPDATE,DELETE')),
 'directAnon',(SELECT has_table_privilege('anon','public.training_session_occurrences_v1','SELECT,INSERT,UPDATE,DELETE')),
 'fences',(SELECT count(*) FROM pg_trigger WHERE tgrelid='public.session_executions'::regclass AND tgname IN ('u60_dated_execution_update_receipt','u60_typed_execution_fence') AND tgenabled<>'D'),
 'legacyAuth',has_function_privilege('authenticated','public.iberfit_occurrence_api_v1(text,jsonb)','EXECUTE'),
 'legacyAnon',has_function_privilege('anon','public.iberfit_occurrence_api_v1(text,jsonb)','EXECUTE')
) AS report`;
export function certifyAlreadyActiveBackend(raw,edge){
 const rows=Array.isArray(raw)?raw:raw?.result;
 if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.report)
   throw Error('CUTOVER_SQL_READBACK_INVALID');
 const x=rows[0].report;
 if(x.environment!=='PRODUCTION'||x.realData!=='true'||x.productionBlocked!=='false'||
   x.coachGuard!==true||x.rls!==true||x.directAuth!==false||x.directAnon!==false||
   x.fences!==2||x.legacyAuth!==false||x.legacyAnon!==false)
   throw Error('CUTOVER_PROD_RLS_OR_ENVIRONMENT_DRIFT');
 if(!Array.isArray(x.functions)||x.functions.length!==FUNCTIONS.length||
   new Set(x.functions.map(f=>f.name)).size!==FUNCTIONS.length)
   throw Error('CUTOVER_FUNCTION_SET_DRIFT');
 for(const f of x.functions){
   if(!Object.hasOwn(HASHES,f.name)||![
     'present','hash_ok','security_definer','owner_ok','safe_path',
     'auth_acl_ok','anon_denied'].every(k=>f[k]===true))
      throw Error('CUTOVER_FUNCTION_SIGNATURE_ACL_DRIFT:'+String(f.name||''));
 }
 const functions=Array.isArray(edge)?edge:edge?.functions;
 const invite=functions?.find(f=>f.slug==='iberfit-admin-client-invite-v1');
 if(!invite||invite.status!=='ACTIVE'||invite.verify_jwt!==false||
   invite.ezbr_sha256!==EDGE_DIGEST||!Number.isInteger(invite.version)||invite.version<10)
   throw Error('CUTOVER_EDGE_BUNDLE_DRIFT');
 return Object.freeze({ok:true,readOnly:true,functionsVerified:FUNCTIONS.length,
   edgeVerified:true,backendWrites:0,hostedAuthWrites:0,fullPlatformRecoveryCertified:false});
}
async function management(url,token,method,body){
 const res=await fetch(url,{method,redirect:'error',
  headers:{Authorization:'Bearer '+token,Accept:'application/json',
    ...(method==='POST'?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error('CUTOVER_MANAGEMENT_API_HTTP_'+res.status);
 const result=await res.json();
 if(!result||typeof result!=='object')throw Error('CUTOVER_API_SHAPE_INVALID');
 return result;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const token=process.env.SUPABASE_ACCESS_TOKEN;
 if(!token||token.length<16||process.env.PROD_SUPABASE_REF!==PROJECT||
    process.env.U60_RELEASE_ACTIVE!=='true'){
   console.error('CUTOVER_ENV_OR_TOKEN_REQUIRED');process.exitCode=1;
 }else{
  try{
   const [sql,edge]=await Promise.all([
    management('https://api.supabase.com/v1/projects/'+PROJECT+'/database/query/read-only',
      token,'POST',{query:SQL}),
    management('https://api.supabase.com/v1/projects/'+PROJECT+'/functions',token,'GET'),
   ]);
   const proof=certifyAlreadyActiveBackend(sql,edge);
   process.stdout.write('IBERFIT_CUTOVER_BACKEND_CERTIFIED_READONLY functions='+
     proof.functionsVerified+' edge='+proof.edgeVerified+' writes=0\n');
  }catch(error){
   console.error(String(error?.message||'CUTOVER_BACKEND_NOT_CERTIFIED'));
   process.exitCode=1;
  }
 }
}
