// UNIVERSAL — owner-scoped, single-pass projection for the Coach directory.
// This is a read-performance optimization, NEVER an authorization decision.
// Backend RLS, route guard and each canonical evidence engine remain authoritative.
export const FOLLOWUP_SCOPE_COLLECTIONS=Object.freeze([
  'appointments','sessionExecutions','sessions','checkins',
  'wearableDailySummaries','iriAssessments','trainingCycles',
  // Retention/CRM are rendered on the SAME Coach directory frame. Index their
  // source collections once rather than scanning the full U38 history N times.
  'clientProfiles','m26Entities','domainEvents',
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
      const owners=ownerHints(record);
      // The canonical plan/execution engine intentionally accepts shared,
      // ownerless session templates when reconciling a confirmed execution.
      // Preserve these for every scoped client; all other records stay owned.
      if(key==='sessions'&&owners.length===0){
        for(const bucket of scoped.values())bucket.sessions.push(record);
        continue;
      }
      for(const id of owners){
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
