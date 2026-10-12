// Release-time, read-only production database compatibility gate.
// Intentionally never applies migrations or reads user health measurements.
export const REQUIRED = Object.freeze([
  'daily_table','consent_table','authorize_rpc','import_rpc','read_rpc',
  'daily_rls','consent_rls','daily_no_direct_access','consent_no_direct_access',
  'anon_auth_blocked','anon_import_blocked','anon_read_blocked','cleanup_ready',
]);
export const QUERY = [
  "SELECT",
  "  to_regclass('public.m26_wearable_daily_health_v47') IS NOT NULL AS daily_table,",
  "  to_regclass('public.m26_wearable_v47_consents_prod') IS NOT NULL AS consent_table,",
  "  to_regprocedure('public.m26_wearable_v47_authorize_prod_v1(uuid,bigint,text[])') IS NOT NULL AS authorize_rpc,",
  "  to_regprocedure('public.m26_wearable_v47_import_daily_prod_v1(uuid,jsonb)') IS NOT NULL AS import_rpc,",
  "  to_regprocedure('public.m26_wearable_v47_my_daily_prod_v1()') IS NOT NULL AS read_rpc,",
  "  EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public.m26_wearable_daily_health_v47') AND c.relrowsecurity AND c.relforcerowsecurity) AS daily_rls,",
  "  EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public.m26_wearable_v47_consents_prod') AND c.relrowsecurity AND c.relforcerowsecurity) AS consent_rls,",
  "  has_table_privilege('authenticated',to_regclass('public.m26_wearable_daily_health_v47'),'SELECT,INSERT,UPDATE,DELETE') IS FALSE AS daily_no_direct_access,",
  "  has_table_privilege('authenticated',to_regclass('public.m26_wearable_v47_consents_prod'),'SELECT,INSERT,UPDATE,DELETE') IS FALSE AS consent_no_direct_access,",
  "  has_function_privilege('anon',to_regprocedure('public.m26_wearable_v47_authorize_prod_v1(uuid,bigint,text[])'),'EXECUTE') IS FALSE AS anon_auth_blocked,",
  "  has_function_privilege('anon',to_regprocedure('public.m26_wearable_v47_import_daily_prod_v1(uuid,jsonb)'),'EXECUTE') IS FALSE AS anon_import_blocked,",
  "  has_function_privilege('anon',to_regprocedure('public.m26_wearable_v47_my_daily_prod_v1()'),'EXECUTE') IS FALSE AS anon_read_blocked,",
  "  pg_catalog.pg_get_functiondef(to_regprocedure('public.m26_wearable_v46_cleanup_prod_v1()')) LIKE '%m26_wearable_daily_health_v47%' IS TRUE AS cleanup_ready",
].join('\n');
export function certify(payload) {
  const rows=Array.isArray(payload)?payload:Array.isArray(payload?.result)?payload.result:null;
  if(!rows||rows.length!==1||!rows[0]||typeof rows[0]!=='object'||Array.isArray(rows[0]))
    throw new Error('CONNECTED360_V47_PRODUCTION_RESPONSE_INVALID');
  const failed=REQUIRED.filter(k=>rows[0][k]!==true);
  if(failed.length) throw new Error('CONNECTED360_V47_PRODUCTION_SCHEMA_INCOMPATIBLE:'+failed.join(','));
  return Object.freeze({ready:true,checks:REQUIRED.length});
}
export async function verify({projectRef,accessToken,fetchImpl=globalThis.fetch}={}){
  if(typeof projectRef!=='string'||!/^[a-z]{20}$/.test(projectRef))
    throw new Error('CONNECTED360_V47_PRODUCTION_PROJECT_INVALID');
  if(typeof accessToken!=='string'||accessToken.length<16)
    throw new Error('CONNECTED360_V47_PRODUCTION_ACCESS_TOKEN_MISSING');
  if(typeof fetchImpl!=='function')throw new Error('CONNECTED360_V47_PRODUCTION_FETCH_UNAVAILABLE');
  let response;
  try {
    response=await fetchImpl('https://api.supabase.com/v1/projects/'+projectRef+'/database/query/read-only',{
      method:'POST',
      headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
      body:JSON.stringify({query:QUERY}),
      signal:AbortSignal.timeout(18000),
    });
  } catch {
    throw new Error('CONNECTED360_V47_PRODUCTION_DATABASE_UNREACHABLE');
  }
  if(!response?.ok)
    throw new Error('CONNECTED360_V47_PRODUCTION_QUERY_HTTP_'+(Number.isInteger(response?.status)?response.status:'UNKNOWN'));
  let payload;
  try { payload=await response.json(); }
  catch { throw new Error('CONNECTED360_V47_PRODUCTION_RESPONSE_NOT_JSON'); }
  return certify(payload);
}
if(process.argv[1]?.endsWith('/verify_connected360_v47_prod_schema.mjs')){
  verify({projectRef:process.env.PROD_SUPABASE_REF,accessToken:process.env.SUPABASE_ACCESS_TOKEN})
    .then(x=>{process.stdout.write('CONNECTED360_V47_PRODUCTION_SCHEMA_CERTIFIED:'+x.checks+'\\n');})
    .catch(e=>{process.stderr.write(String(e?.message||'CONNECTED360_V47_PRODUCTION_GATE_FAILED')+'\\n');process.exitCode=1;});
}
