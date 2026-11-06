// UNIVERSAL — owner-scoped, single-pass projection for the Coach directory.
// This is a read-performance optimization, NEVER an authorization decision.
// Backend RLS, route guard and each canonical evidence engine remain authoritative.
export const FOLLOWUP_SCOPE_COLLECTIONS=Object.freeze([
  'appointments','sessionExecutions','checkins',
  'wearableDailySummaries','iriAssessments','trainingCycles',
]);
const OWNER_FIELDS=Object.freeze(['clientId','client_id','clienteId','cliente_id']);
function ownerHints(record){
  if(!record||typeof record!=='object')return [];
  const result=new Set();
  for(const row of [record,record.body]){
    if(!row||typeof row!=='object'||Array.isArray(row))continue;
    for(const name of OWNER_FIELDS){
      const value=row[name];
      if(typeof value!=='string'&&typeof value!=='number')continue;
      const id=String(value).trim();
      if(id)result.add(id);
    }
  }
  // Keep both hints if a malformed envelope contradicts its body. The
  // original selector must still decide which, if any, is really owned.
  return [...result];
}
export function buildFollowUpClientScopeIndex(state,clientIds=[]){
  const source=state?.collections||{};
  const ids=[...new Set((Array.isArray(clientIds)?clientIds:[])
    .map(value=>String(value||'').trim()).filter(Boolean))];
  const scoped=new Map(ids.map(id=>[id,Object.fromEntries(
    FOLLOWUP_SCOPE_COLLECTIONS.map(key=>[key,[]]),
  )]));
  if(!scoped.size)return new Map();
  for(const key of FOLLOWUP_SCOPE_COLLECTIONS){
    for(const record of Array.isArray(source[key])?source[key]:[]){
      for(const id of ownerHints(record)){
        const bucket=scoped.get(id);
        if(bucket)bucket[key].push(record);
      }
    }
  }
  return new Map(ids.map(id=>{
    const indexed=Object.fromEntries(FOLLOWUP_SCOPE_COLLECTIONS.map(key=>[
      key,Object.freeze(scoped.get(id)[key]),
    ]));
    // Preserve all other canonical collections, operation fences and identity.
    // Frozen array views prevent accidental mutations of the archive.
    return [id,Object.freeze({...state,
      collections:Object.freeze({...source,...indexed}),
    })];
  }));
}
