// #1209 QA-only owner projection: server executes original authenticated bootstrap.
// Never infer success from a missing/failed RPC or untrusted projection.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SCHEMA='iberfit.qa.m43.owner-projection.v1';
const own=(x)=>x&&typeof x==='object'&&!Array.isArray(x);
export function assertQaM43OwnerProjection(response,{entityType,entityId,clientId}={}){
  if(!own(response)||Object.keys(response).sort((a,b)=>a.localeCompare(b)).join(',')!==
    'canonical,canonicalVisible,legacyVisible,schema'
    ||response.schema!==SCHEMA
    ||typeof response.canonicalVisible!=='boolean'
    ||typeof response.legacyVisible!=='boolean'
    ||!['planning','session'].includes(entityType)
    ||!UUID.test(String(entityId||''))
    ||!UUID.test(String(clientId||'')))
    throw Error('M43_QA_OWNER_PROJECTION_INVALID');
  const entry=response.canonical;
  if(entityType==='planning'||!response.canonicalVisible){
    if(entry!==null)throw Error('M43_QA_OWNER_PROJECTION_INVALID');
  }else if(!own(entry)
    ||Object.keys(entry).sort((a,b)=>a.localeCompare(b)).join(',')!=='clientId,entityId,entityType,revision,status'
    ||entry.entityType!=='session'
    ||entry.entityId!==entityId
    ||entry.clientId!==clientId
    ||typeof entry.status!=='string'||!entry.status.trim()
    ||!Number.isSafeInteger(entry.revision)||entry.revision<0)
    throw Error('M43_QA_OWNER_PROJECTION_INVALID');
  return Object.freeze({canonicalVisible:response.canonicalVisible,
    legacyVisible:response.legacyVisible,canonical:entry});
}
export async function readQaM43OwnerProjection({rpc,session,entityType,entityId,clientId}={}){
  if(typeof rpc!=='function'||!own(session)
    ||typeof session.token!=='string'||!session.token
    ||!['planning','session'].includes(entityType)
    ||!UUID.test(String(entityId||''))
    ||!UUID.test(String(clientId||'')))
    throw Error('M43_QA_OWNER_PROJECTION_INPUT_INVALID');
  const payload=await rpc('iberfit_qa_m43_owner_projection_v1',session,{
    p_entity_type:entityType,p_entity_id:entityId});
  return assertQaM43OwnerProjection(payload,{entityType,entityId,clientId});
}
