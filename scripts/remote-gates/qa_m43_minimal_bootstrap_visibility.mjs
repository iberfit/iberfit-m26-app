// #1209 · QA-only transport for exact canonical-bootstrap boolean visibility.
// The SQL function executes the REAL canonical bootstrap as the same JWT.
// Never infer "not visible" from a failed/malformed response.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SCHEMA='iberfit.qa.m43.bootstrap-visibility.v1';
export function assertQaM43MinimalVisibility(response){
  const keys=response&&typeof response==='object'&&!Array.isArray(response)
    ?Object.keys(response).sort():[];
  if(keys.join(',')!=='canonicalVisible,legacyVisible,schema'
    ||response.schema!==SCHEMA
    ||typeof response.canonicalVisible!=='boolean'
    ||typeof response.legacyVisible!=='boolean')
    throw Error('M43_QA_MINIMAL_VISIBILITY_RESPONSE_INVALID');
  return Object.freeze({
    canonicalVisible:response.canonicalVisible,
    legacyVisible:response.legacyVisible,
  });
}
export async function readQaM43MinimalVisibility({rpc,session,entityType,entityId}={}){
  if(typeof rpc!=='function'||!session
    ||!['session','session_execution'].includes(entityType)
    ||!UUID.test(String(entityId||'')))
    throw Error('M43_QA_MINIMAL_VISIBILITY_INPUT_INVALID');
  const response=await rpc('iberfit_qa_m43_bootstrap_visibility_v1',session,{
    p_entity_type:entityType,p_entity_id:entityId,
  });
  return assertQaM43MinimalVisibility(response);
}
