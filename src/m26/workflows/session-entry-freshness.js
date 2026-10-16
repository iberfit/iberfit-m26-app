// M42 · A delayed local recovery must never open a withdrawn, replaced or
// reassigned remote session using the snapshot captured when the user clicked.
// This is an optimistic local check; server preflight/RLS remain authoritative.
const READY=new Set(['published','publicado','publicada','disponible','active','activo','enabled','habilitado']);
const clean=value=>String(value||'').trim();
const of=(r,...keys)=>{
  for(const key of keys){
    const found=r?.[key]??r?.body?.[key];
    if(found!==null&&found!==undefined&&found!=='')return found;
  }
  return null;
};
function revision(r){
  const raw=of(r,'revision','version');
  const n=Number(raw);
  return raw===null||!Number.isSafeInteger(n)||n<0?null:n;
}
export function resolveCurrentSessionForEntry({state,requested,clientId}={}){
  const target=clean(of(requested,'id','entityId','entity_id'));
  const owner=clean(clientId);
  if(!target||!owner)throw Error('M42_SESSION_ENTRY_TARGET_INVALID');
  if(clean(of(requested,'clientId','client_id','clienteId','cliente_id'))!==owner)
    throw Error('M26_SESSION_CLIENT_MISMATCH');
  const available=Array.isArray(state?.collections?.sessions)?state.collections.sessions:[];
  const candidates=available.filter(item=>clean(of(item,'id','entityId','entity_id'))===target);
  if(candidates.length!==1)throw Error('M42_SESSION_NO_LONGER_VISIBLE');
  const latest=candidates[0];
  if(clean(of(latest,'clientId','client_id','clienteId','cliente_id'))!==owner)
    throw Error('M26_SESSION_CLIENT_MISMATCH');
  if(!READY.has(clean(of(latest,'status','estado')).toLowerCase()))
    throw Error('M42_SESSION_NO_LONGER_AVAILABLE');
  const previousRevision=revision(requested),latestRevision=revision(latest);
  if(previousRevision!==null&&latestRevision!==null&&previousRevision!==latestRevision)
    throw Error('M42_SESSION_UPDATED_REOPEN');
  return latest;
}

/** Prevent an old local execution from re-opening a withdrawn or replaced
 * session. Does not delete recovery data: conflicts remain available for review.
 */
export function resolveRecoveredSessionForEntry({state,snapshot,clientId,requestedId=null,role='client'}={}){
  const saved=snapshot?.session;
  const execution=snapshot?.execution;
  const sessionId=clean(of(saved,'id','entityId','entity_id'));
  if(!saved||!execution||!sessionId||clean(execution.sessionId)!==sessionId||
     clean(execution.clientId)!==clean(clientId))
    throw Error('M42_RECOVERY_SNAPSHOT_SCOPE_INVALID');
  if(requestedId!==null&&clean(requestedId)!==sessionId)
    throw Error('M42_RECOVERY_OTHER_SESSION_ACTIVE');
  const latest=resolveCurrentSessionForEntry({state,requested:saved,clientId});
  if(role==='client'){
    const ownership=clean(of(latest,'deliveryOwnership','delivery_ownership'));
    const modality=clean(of(latest,'deliveryModality','delivery_modality'));
    const visibility=clean(of(latest,'clientVisibilityLevel','client_visibility_level'));
    if(visibility==='hidden'||visibility==='summary_only'||ownership==='coach_led'||
       ownership==='live_online'||modality==='presencial'||of(latest,'visibleToClient')===false)
      throw Error('M42_RECOVERY_NO_LONGER_EXECUTABLE');
  }
  return latest;
}
