// IBERFIT A · explicit read-only activation gate for the dated workout.
// This is separate from the global production release safety guard: unrelated
// frontend-only releases MUST remain possible while U60 is intentionally closed.
import {PROD_REF,REQUIRED,QUERY as BASE_QUERY,certify as certifyBase} from './verify_u30_u60_prod_schema.mjs';
export const ACTIVATION_REQUIRED=Object.freeze([
  'u60_authenticated_execute','detail_authenticated_execute',
]);
export const ACTIVATION_QUERY=[
  'WITH baseline AS ('+BASE_QUERY+')',
  'SELECT baseline.*,',
  " has_function_privilege('authenticated',to_regprocedure('public.iberfit_occurrence_api_u60_v1(text,jsonb)'),'EXECUTE') AS u60_authenticated_execute,",
  " has_function_privilege('authenticated',to_regprocedure('public.iberfit_occurrence_detail_v1(uuid,uuid)'),'EXECUTE') AS detail_authenticated_execute",
  'FROM baseline',
].join('\n');
export function certifyActivation(rows){
  const baseline=certifyBase(rows);
  const source=Array.isArray(rows)?rows:rows?.result;
  const row=source[0];
  const missing=ACTIVATION_REQUIRED.filter(key=>row[key]!==true);
  if(missing.length)throw new Error('U60_PROD_NOT_ACTIVATED:'+missing.join(','));
  return Object.freeze({...baseline,authenticatedGrants:ACTIVATION_REQUIRED.length,activationReady:true});
}
export async function verifyActivation({projectRef,accessToken,fetchImpl=globalThis.fetch}={}){
  if(projectRef!==PROD_REF)throw new Error('U60_ACTIVATION_TARGET_MISMATCH');
  if(typeof accessToken!=='string'||accessToken.length<16)
    throw new Error('U60_ACTIVATION_ACCESS_TOKEN_MISSING');
  if(typeof fetchImpl!=='function')throw new Error('U60_ACTIVATION_FETCH_MISSING');
  let response;
  try{
    response=await fetchImpl('https://api.supabase.com/v1/projects/'+PROD_REF+'/database/query/read-only',{
      method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
      body:JSON.stringify({query:ACTIVATION_QUERY}),signal:AbortSignal.timeout(18_000),
    });
  }catch{throw new Error('U60_ACTIVATION_READONLY_UNREACHABLE');}
  if(!response?.ok)throw new Error('U60_ACTIVATION_HTTP_'+(Number.isInteger(response?.status)?response.status:'UNKNOWN'));
  let rows;
  try{rows=await response.json();}
  catch{throw new Error('U60_ACTIVATION_RESPONSE_INVALID');}
  return certifyActivation(rows);
}
if(process.argv[1]?.endsWith('/verify_u30_u60_prod_activation_readonly.mjs')){
  verifyActivation({projectRef:process.env.PROD_SUPABASE_REF,accessToken:process.env.SUPABASE_ACCESS_TOKEN})
    .then(value=>process.stdout.write('U60_PROD_AUTHENTICATED_ACTIVATION_CERTIFIED:'+value.authenticatedGrants+'\n'))
    .catch(error=>{process.stderr.write(String(error?.message||'U60_PROD_ACTIVATION_UNVERIFIED')+'\n');process.exitCode=1;});
}
