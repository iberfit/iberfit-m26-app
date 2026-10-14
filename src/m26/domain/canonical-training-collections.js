// Canonical V26 commands persist in domain_entities_v26; legacy training_cycles
// sessions and session executions may not have matching rows. Unify those records before role
// projection, never fabricate an ACK or leak a Coach draft to a Client.
const COLLECTION_FOR_ENTITY=Object.freeze({
  planning:'trainingCycles',
  session:'sessions',
  // EXECUCION_COMPLETAR persists in domain_entities_v26 even without a
  // legacy session_executions row. Client history must reconcile that ACK.
  session_execution:'sessionExecutions',
});
const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
const nonnegativeRevision=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const ownedBody=entity=>entity?.body&&typeof entity.body==='object'&&!Array.isArray(entity.body)?entity.body:null;

export function reconcileCanonicalTrainingCollections(collections={}){
  const result={...collections};
  const entities=Array.isArray(collections.m26Entities)?collections.m26Entities:[];
  for(const [type,key] of Object.entries(COLLECTION_FOR_ENTITY)){
    const existing=Array.isArray(collections[key])?collections[key]:[];
    const byId=new Map();
    for(const record of existing){
      const id=String(record?.id||'').trim();
      if(id)byId.set(id,record);
    }
    for(const entity of entities){
      if(String(entity?.entityType||'')!==type)continue;
      const id=String(entity?.entityId||'').trim();
      const clientId=String(entity?.clientId||'').trim();
      const status=String(entity?.status||'').trim().toLowerCase();
      const revision=nonnegativeRevision(entity?.revision);
      const body=ownedBody(entity);
      if(!validId(id)||!validId(clientId)||!body||!status||revision===null)continue;
      // Reject forged or corrupted cross-client/wrong-ID envelope/body pairs.
      const bodyId=String(body.id??id).trim();
      const bodyClient=String(body.clientId??body.client_id??clientId).trim();
      if(bodyId!==id||bodyClient!==clientId)continue;
      const previous=byId.get(id);
      const previousClient=String(previous?.clientId??previous?.client_id??previous?.body?.clientId??previous?.body?.client_id??clientId).trim();
      if(previous&&previousClient!==clientId)continue;
      // Revision in the V26 envelope is authoritative; do not downgrade newer
      // historical records with a lower canonical revision.
      if(previous&&nonnegativeRevision(previous.revision)>revision)continue;
      const updatedAt=String(entity.updatedAt||body.updatedAt||'').trim();
      const canonicalBody={...body,id,clientId,status,revision};
      const projected={...previous,...canonicalBody,id,clientId,status,revision,
        body:canonicalBody,...(updatedAt?{updatedAt}:{})};
      byId.set(id,projected);
    }
    result[key]=[...byId.values()];
  }
  return result;
}
