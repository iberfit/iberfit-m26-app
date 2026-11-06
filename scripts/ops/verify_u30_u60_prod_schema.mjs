// READ-ONLY PROD promotion guard for SIGNATURE U30–U60 dated training.
// Compatibility preflights (U78) are not evidence of installed migrations.
// Do not read Client records, infer QA from PROD, or apply SQL from this tool.
export const PROD_REF='pjhmrhejsoofmouedavw';
export const REQUIRED_VERSIONS=Object.freeze([
  '20261025182000','20261025194000','20261025203500',
  '20261025210500','20261025223000','20261025231500',
  '20261025235500','20261104150000',
]);
export const REQUIRED=Object.freeze([
  'all_eight_installed',
  'occurrences_present','occurrences_rls',
  'occurrences_auth_deny_direct','occurrences_anon_deny_direct',
  'u36_api_present','u60_api_present','u60_detail_present',
  'u60_anon_denied','u60_receipt_guard','u60_legacy_fence',
  'u30_composite_fk_validated',
]);
const versions=REQUIRED_VERSIONS.map(value=>"('"+value+"')").join(',');
export const QUERY=[
  'WITH required(version) AS (VALUES '+versions+')',
  'SELECT',
  ' NOT EXISTS (SELECT 1 FROM required r WHERE NOT EXISTS',
  '  (SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version=r.version)) AS all_eight_installed,',
  " to_regclass('public.training_session_occurrences_v1') IS NOT NULL AS occurrences_present,",
  " EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.training_session_occurrences_v1') AND c.relrowsecurity) AS occurrences_rls,",
  " (has_table_privilege('authenticated',to_regclass('public.training_session_occurrences_v1'),'SELECT,INSERT,UPDATE,DELETE') IS FALSE) AS occurrences_auth_deny_direct,",
  " (has_table_privilege('anon',to_regclass('public.training_session_occurrences_v1'),'SELECT,INSERT,UPDATE,DELETE') IS FALSE) AS occurrences_anon_deny_direct,",
  " to_regprocedure('public.iberfit_occurrence_api_v1(text,jsonb)') IS NOT NULL AS u36_api_present,",
  " to_regprocedure('public.iberfit_occurrence_api_u60_v1(text,jsonb)') IS NOT NULL AS u60_api_present,",
  " to_regprocedure('public.iberfit_occurrence_detail_v1(uuid,uuid)') IS NOT NULL AS u60_detail_present,",
  " (has_function_privilege('anon',to_regprocedure('public.iberfit_occurrence_api_u60_v1(text,jsonb)'),'EXECUTE') IS FALSE) AS u60_anon_denied,",
  " EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.session_executions') AND t.tgname='u60_dated_execution_update_receipt' AND NOT t.tgisinternal AND t.tgenabled<>'D') AS u60_receipt_guard,",
  " EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.session_executions') AND t.tgname='u60_typed_execution_fence' AND NOT t.tgisinternal AND t.tgenabled<>'D') AS u60_legacy_fence,",
  " EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.training_session_occurrences_v1') AND c.conname='u30_session_same_client_fk' AND c.convalidated) AS u30_composite_fk_validated",
].join('\n');

export function certify(payload){
  const rows=Array.isArray(payload)?payload:Array.isArray(payload?.result)?payload.result:null;
  if(!rows||rows.length!==1||!rows[0]||typeof rows[0]!=='object'||Array.isArray(rows[0]))
    throw new Error('U30_U60_PROD_RESPONSE_INVALID');
  const failed=REQUIRED.filter(name=>rows[0][name]!==true);
  if(failed.length)throw new Error('U30_U60_PROD_SCHEMA_NOT_READY:'+failed.join(','));
  return Object.freeze({ready:true,checks:REQUIRED.length,versions:REQUIRED_VERSIONS.length,readOnly:true});
}

export async function verify({projectRef,accessToken,fetchImpl=globalThis.fetch}={}){
  if(projectRef!==PROD_REF)throw new Error('U30_U60_PROD_TARGET_MISMATCH');
  if(typeof accessToken!=='string'||accessToken.length<16)
    throw new Error('U30_U60_PROD_ACCESS_TOKEN_MISSING');
  if(typeof fetchImpl!=='function')throw new Error('U30_U60_PROD_FETCH_MISSING');
  let response;
  try{
    response=await fetchImpl('https://api.supabase.com/v1/projects/'+PROD_REF+'/database/query/read-only',{
      method:'POST',
      headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
      body:JSON.stringify({query:QUERY}),
      signal:AbortSignal.timeout(18_000),
    });
  }catch{throw new Error('U30_U60_PROD_DATABASE_UNREACHABLE');}
  if(!response?.ok)
    throw new Error('U30_U60_PROD_QUERY_HTTP_'+(Number.isInteger(response?.status)?response.status:'UNKNOWN'));
  let payload;
  try{payload=await response.json();}
  catch{throw new Error('U30_U60_PROD_RESPONSE_NOT_JSON');}
  return certify(payload);
}
if(process.argv[1]?.endsWith('/verify_u30_u60_prod_schema.mjs')){
  verify({projectRef:process.env.PROD_SUPABASE_REF,accessToken:process.env.SUPABASE_ACCESS_TOKEN})
    .then(result=>process.stdout.write('U30_U60_PROD_OCCURRENCE_SCHEMA_CERTIFIED:'+result.checks+'\\n'))
    .catch(error=>{process.stderr.write(String(error?.message||'U30_U60_PROD_SCHEMA_GATE_FAILED')+'\\n');process.exitCode=1;});
}
