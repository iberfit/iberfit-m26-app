// Production release gate: read-only schema and authorization verification.
// Fails closed before deploying M44 Edge or any new frontend in production.
// Never reads client data, writes migrations or exposes server-side tokens.
export const PROD_REF='pjhmrhejsoofmouedavw';
export const REQUIRED=Object.freeze([
  'reports_present','reports_rls','reports_no_direct_writes',
  'issuance_ledger','issuance_rls','issuance_no_direct_access',
  'issuance_columns','pdf_private_bucket',
  'draft_rpc','prepare_rpc','history_rpc','authorize_rpc','withdraw_rpc',
  'authenticated_rpc_grants','anon_rpc_denied',
  'finalizer_exists','finalizer_modern_role','finalizer_service_only',
  'immutable_guard','privileged_assurance',
]);
const proc=(name,args)=>"to_regprocedure('public."+name+"("+args+")')";
const rpcNames=[
 ['draft','iberfit_m44_create_report_draft_v1','uuid,uuid,jsonb'],
 ['prepare','iberfit_m44_prepare_evolution_report_issue_v1','uuid'],
 ['history','iberfit_m44_report_issued_pdf_history_v1','uuid'],
 ['authorize','iberfit_m44_authorize_evolution_report_pdf_v1','uuid'],
 ['withdraw','iberfit_m44_withdraw_evolution_report_pdf_v1','uuid,text'],
];
const finalizer=proc('iberfit_m44_finalize_evolution_report_issue_v1','uuid,uuid,bigint,text,text,text,bigint,text,text,uuid');
const access=(role,sig)=>"has_function_privilege('"+role+"',"+sig+",'EXECUTE')";
export const QUERY=[
  'SELECT',
  " to_regclass('public.reports') IS NOT NULL AS reports_present,",
  " EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=to_regclass('public.reports') AND relrowsecurity) AS reports_rls,",
  " (has_table_privilege('authenticated',to_regclass('public.reports'),'INSERT,UPDATE,DELETE') IS FALSE) AS reports_no_direct_writes,",
  " to_regclass('public.iberfit_evolution_report_issuances_v1') IS NOT NULL AS issuance_ledger,",
  " EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=to_regclass('public.iberfit_evolution_report_issuances_v1') AND relrowsecurity) AS issuance_rls,",
  " (has_table_privilege('authenticated',to_regclass('public.iberfit_evolution_report_issuances_v1'),'SELECT,INSERT,UPDATE,DELETE') IS FALSE AND has_table_privilege('anon',to_regclass('public.iberfit_evolution_report_issuances_v1'),'SELECT,INSERT,UPDATE,DELETE') IS FALSE) AS issuance_no_direct_access,",
  " (SELECT count(*)=5 FROM information_schema.columns WHERE table_schema='public' AND table_name='iberfit_evolution_report_issuances_v1' AND column_name IN ('report_id','report_revision','source_sha256','artifact_sha256','status')) AS issuance_columns,",
  " EXISTS(SELECT 1 FROM storage.buckets WHERE id='iberfit-evolution-issued-reports' AND public IS FALSE) AS pdf_private_bucket,",
  ...rpcNames.map(([alias,name,args])=>" ("+proc(name,args)+" IS NOT NULL) AS "+alias+"_rpc,"),
  " ("+rpcNames.map(([,name,args])=>access('authenticated',proc(name,args))+" IS TRUE").join(' AND ')+") AS authenticated_rpc_grants,",
  " ("+rpcNames.map(([,name,args])=>access('anon',proc(name,args))+" IS FALSE").join(' AND ')+") AS anon_rpc_denied,",
  " ("+finalizer+" IS NOT NULL) AS finalizer_exists,",
  " (position('current_setting(''role'',true)' in pg_get_functiondef("+finalizer+")) > 0) IS TRUE AS finalizer_modern_role,",
  " ("+access('service_role',finalizer)+" IS TRUE AND "+access('authenticated',finalizer)+" IS FALSE AND "+access('anon',finalizer)+" IS FALSE) AS finalizer_service_only,",
  " ("+proc('iberfit_m44_issued_pdf_immutability_guard_v1','')+" IS NOT NULL) AS immutable_guard,",
  " ("+proc('iberfit_m44_require_privileged_assurance_v1','')+" IS NOT NULL) AS privileged_assurance",
].join('\n');
export function certify(payload){
 const rows=Array.isArray(payload)?payload:Array.isArray(payload?.result)?payload.result:null;
 if(!rows||rows.length!==1||!rows[0]||typeof rows[0]!=='object'||Array.isArray(rows[0]))
  throw Error('M44_PROD_SCHEMA_RESPONSE_INVALID');
 const missing=REQUIRED.filter(name=>rows[0][name]!==true);
 if(missing.length)throw Error('M44_PROD_SCHEMA_NOT_READY:'+missing.join(','));
 return Object.freeze({ready:true,checks:REQUIRED.length});
}
export async function verify({projectRef,accessToken,fetchImpl=globalThis.fetch}={}){
 if(projectRef!==PROD_REF)throw Error('M44_PROD_TARGET_MISMATCH');
 if(typeof accessToken!=='string'||accessToken.length<16)
  throw Error('M44_PROD_ACCESS_TOKEN_MISSING');
 if(typeof fetchImpl!=='function')throw Error('M44_PROD_FETCH_MISSING');
 let response;
 try{
  response=await fetchImpl('https://api.supabase.com/v1/projects/'+PROD_REF+'/database/query/read-only',{
   method:'POST',
   headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
   body:JSON.stringify({query:QUERY}),
   signal:AbortSignal.timeout(18000),
  });
 }catch{throw Error('M44_PROD_DATABASE_UNREACHABLE');}
 if(!response?.ok)throw Error('M44_PROD_QUERY_HTTP_'+(Number.isInteger(response?.status)?response.status:'UNKNOWN'));
 let payload;
 try{payload=await response.json();}catch{throw Error('M44_PROD_RESPONSE_NOT_JSON');}
 return certify(payload);
}
if(process.argv[1]?.endsWith('/verify_m44_prod_schema.mjs')){
 verify({projectRef:process.env.PROD_SUPABASE_REF,accessToken:process.env.SUPABASE_ACCESS_TOKEN})
  .then(result=>process.stdout.write('M44_PROD_SCHEMA_CERTIFIED:'+result.checks+'\n'))
  .catch(error=>{process.stderr.write(String(error?.message||'M44_PROD_SCHEMA_CHECK_FAILED')+'\n');process.exitCode=1;});
}
