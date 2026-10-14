// M43 production compatibility: fail closed before and during frontend promotion.
// Read-only Supabase Management API. No data mutations, no client records.
export const REQUIRED=Object.freeze([
  'preflight_rpc','bootstrap_rpc','initial_plan_preflight','initial_session_preflight',
  'client_cycle_filter','client_session_filter','client_entity_filter',
  'client_revisions_filter','client_events_redacted','client_role_boundary',
  'preflight_anon_denied','bootstrap_anon_denied','bootstrap_authenticated',
  'preflight_definer_pinned','bootstrap_definer_pinned',
  'client_execution_helper','client_execution_http_projection',
  'client_legacy_execution_http_projection','client_execution_anon_denied',
  'client_execution_authenticated_denied','client_execution_no_private_keys',
]);
const definition=name=>`pg_catalog.pg_get_functiondef(to_regprocedure('public.${name}'))`;
const preflight=definition('iberfit_command_preflight_v26_pre_rc74_4h(jsonb)');
const bootstrap=definition('iberfit_bootstrap_v26()');
const fragment=(expr,needle)=>`coalesce(position('${needle.replaceAll("'","''")}' in ${expr})>0,false)`;
const pinned=name=>`EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.${name}') AND p.prosecdef AND 'search_path=""'=ANY(p.proconfig))`;
export const QUERY=[
  'SELECT',
  "  to_regprocedure('public.iberfit_command_preflight_v26_pre_rc74_4h(jsonb)') IS NOT NULL AS preflight_rpc,",
  "  to_regprocedure('public.iberfit_bootstrap_v26()') IS NOT NULL AS bootstrap_rpc,",
  `  ${fragment(preflight,"v_def.bootstrap_allowed")} AS initial_plan_preflight,`,
  `  ${fragment(preflight,"v_type='SESION_PUBLICAR'")} AS initial_session_preflight,`,
  `  ${fragment(bootstrap,"v_payload:=jsonb_set(v_payload,'{data,trainingCycles}'")} AS client_cycle_filter,`,
  `  ${fragment(bootstrap,"v_payload:=jsonb_set(v_payload,'{data,sessions}'")} AS client_session_filter,`,
  `  ${fragment(bootstrap,"v_payload:=jsonb_set(v_payload,'{data,m26Entities}'")} AS client_entity_filter,`,
  `  ${fragment(bootstrap,"v_payload:=jsonb_set(v_payload,'{remoteRevisions}'")} AS client_revisions_filter,`,
  `  ${fragment(bootstrap,"v_payload:=jsonb_set(v_payload,'{data,domainEvents}'")} AS client_events_redacted,`,
  `  ${fragment(bootstrap,"if public.iberfit_current_role_v26() in ('client','cliente') then")} AS client_role_boundary,`,
  "  has_function_privilege('anon',to_regprocedure('public.iberfit_command_preflight_v26_pre_rc74_4h(jsonb)'),'EXECUTE') IS FALSE AS preflight_anon_denied,",
  "  has_function_privilege('anon',to_regprocedure('public.iberfit_bootstrap_v26()'),'EXECUTE') IS FALSE AS bootstrap_anon_denied,",
  "  has_function_privilege('authenticated',to_regprocedure('public.iberfit_bootstrap_v26()'),'EXECUTE') IS TRUE AS bootstrap_authenticated,",
  `  ${pinned('iberfit_command_preflight_v26_pre_rc74_4h(jsonb)')} AS preflight_definer_pinned,`,
  `  ${pinned('iberfit_bootstrap_v26()')} AS bootstrap_definer_pinned,`,
  "  to_regprocedure('public.iberfit_m43_client_safe_execution_v1(jsonb)') IS NOT NULL AS client_execution_helper,",
  `  ${fragment(bootstrap,'iberfit_m43_client_safe_execution_v1')} AS client_execution_http_projection,`,
  `  ${fragment(bootstrap,'data,sessionExecutions')} AS client_legacy_execution_http_projection,`,
  "  has_function_privilege('anon',to_regprocedure('public.iberfit_m43_client_safe_execution_v1(jsonb)'),'EXECUTE') IS FALSE AS client_execution_anon_denied,",
  "  has_function_privilege('authenticated',to_regprocedure('public.iberfit_m43_client_safe_execution_v1(jsonb)'),'EXECUTE') IS FALSE AS client_execution_authenticated_denied,",
  `  coalesce(position('coachPrivateNote' in ${definition('iberfit_m43_client_safe_execution_v1(jsonb)')})=0,false) AS client_execution_no_private_keys`,
].join('\n');
export function certify(payload){
  const rows=Array.isArray(payload)?payload:Array.isArray(payload?.result)?payload.result:null;
  if(!rows||rows.length!==1||!rows[0]||typeof rows[0]!=='object'||Array.isArray(rows[0]))
    throw new Error('M43_PRODUCTION_RESPONSE_INVALID');
  const failed=REQUIRED.filter(key=>rows[0][key]!==true);
  if(failed.length)throw new Error('M43_PRODUCTION_SCHEMA_INCOMPATIBLE:'+failed.join(','));
  return Object.freeze({ready:true,checks:REQUIRED.length});
}
export async function verify({projectRef,accessToken,fetchImpl=globalThis.fetch}={}){
  if(projectRef!=='pjhmrhejsoofmouedavw')throw new Error('M43_PRODUCTION_PROJECT_INVALID');
  if(typeof accessToken!=='string'||accessToken.length<16)
    throw new Error('M43_PRODUCTION_ACCESS_TOKEN_MISSING');
  if(typeof fetchImpl!=='function')throw new Error('M43_PRODUCTION_FETCH_UNAVAILABLE');
  let response;
  try{
    response=await fetchImpl('https://api.supabase.com/v1/projects/'+projectRef+'/database/query/read-only',{
      method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
      body:JSON.stringify({query:QUERY}),signal:AbortSignal.timeout(18000),
    });
  }catch{throw new Error('M43_PRODUCTION_DATABASE_UNREACHABLE');}
  if(!response?.ok)throw new Error('M43_PRODUCTION_QUERY_HTTP_'+
    (Number.isInteger(response?.status)?response.status:'UNKNOWN'));
  let payload;
  try{payload=await response.json();}
  catch{throw new Error('M43_PRODUCTION_RESPONSE_NOT_JSON');}
  return certify(payload);
}
if(process.argv[1]?.endsWith('/verify_m43_prod_schema.mjs')){
  verify({projectRef:process.env.PROD_SUPABASE_REF,accessToken:process.env.SUPABASE_ACCESS_TOKEN})
    .then(x=>{process.stdout.write('M43_PRODUCTION_SCHEMA_CERTIFIED:'+x.checks+'\n');})
    .catch(e=>{process.stderr.write(String(e?.message||'M43_PRODUCTION_GATE_FAILED')+'\n');process.exitCode=1;});
}
