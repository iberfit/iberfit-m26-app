import {actorCanExecuteSession,normalizeDeliveryOwnership} from '../rc39/session-policy.js';
import {createExecution} from './session-execution.js';

// M42 · A delayed local recovery must never open a withdrawn, replaced or
// reassigned remote session using the snapshot captured when the user clicked.
// This is an optimistic local check; server preflight/RLS remain authoritative.
const READY=new Set(['published','publicado','publicada','disponible','active','activo','enabled','habilitado']);
// An already-started session can be en_curso; this never authorizes a NEW start.
const IN_PROGRESS='en_curso';
const REOPENABLE_EXECUTIONS=new Set(['active','paused','awaiting_feedback','completed','cancelled']);
const RECOVERABLE_EXECUTIONS=new Set(['ready',...REOPENABLE_EXECUTIONS]);
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
export function resolveCurrentSessionForEntry({state,requested,clientId,allowInProgress=false}={}){
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
  const status=clean(of(latest,'status','estado')).toLowerCase();
  if(!READY.has(status)&&!(allowInProgress===true&&status===IN_PROGRESS))
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
  const executionStatus=clean(execution.status).toLowerCase();
  if(!RECOVERABLE_EXECUTIONS.has(executionStatus))throw Error('M42_RECOVERY_SNAPSHOT_SCOPE_INVALID');
  const normalizedRole=clean(role).toLowerCase();
  if(!['client','cliente','coach','entrenador'].includes(normalizedRole))
    throw Error('M42_RECOVERY_ROLE_FORBIDDEN');
  const latest=resolveCurrentSessionForEntry({
    state,requested:saved,clientId,allowInProgress:REOPENABLE_EXECUTIONS.has(executionStatus),
  });
  if(['client','cliente'].includes(normalizedRole)){
    const explicitOwnership=of(latest,'deliveryOwnership','delivery_ownership','executionMode','execution_mode');
    // Unknown explicit delivery is never interpreted as autonomous during recovery.
    if((explicitOwnership!==null&&!normalizeDeliveryOwnership(explicitOwnership))||
       !actorCanExecuteSession({role:'client',session:latest}))
      throw Error('M42_RECOVERY_NO_LONGER_EXECUTABLE');
  }
  return latest;
}

/**
 * M48: recover the exact already ACKed server execution, never start again.
 * Callers must obtain the raw row using the authenticated, client-scoped RLS GET,
 * and match it to a separate current bootstrap session and execution identity.
 * Ambiguous or partially persisted progress is not permission to manufacture data.
 */
export function recoverAuthenticatedRemoteExecution({
  session,clientId,executionRow,visibleExecutions=[],canonicalExecutions=[],
}={}){
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  const id=clean(session?.id),owner=clean(clientId),body=executionRow?.summary;
  const remoteId=clean(executionRow?.id);
  if(!uuid.test(id)||!uuid.test(owner)||!uuid.test(remoteId)||
     clean(session?.clientId)!==owner||
     clean(session?.status).toLowerCase()!=='en_curso'||
     !actorCanExecuteSession({role:'client',session})||
     clean(executionRow?.session_id)!==id||
     clean(executionRow?.client_id)!==owner||
     !['activa','en_curso'].includes(clean(executionRow?.execution_status).toLowerCase())||
     !body||typeof body!=='object'||Array.isArray(body))
    throw Error('M48_RECOVERY_SCOPE_INVALID');

  const revision=Number(executionRow.revision);
  if(!Number.isSafeInteger(revision)||revision<1||
     clean(body.id)!==remoteId||clean(body.sessionId)!==id||
     clean(body.clientId)!==owner||
     Number(body.revision)!==revision)
    throw Error('M48_RECOVERY_CAS_INVALID');

  // A sanitized bootstrap must independently show one single active execution.
  // Do not infer authorization from a raw table response alone.
  const forSession=(r)=>clean(r?.sessionId??r?.session_id??r?.body?.sessionId)===id &&
    clean(r?.clientId??r?.client_id??r?.body?.clientId)===owner;
  const active=(r)=>['activa','en_curso','active'].includes(
    clean(r?.executionStatus??r?.execution_status??r?.status??r?.body?.status).toLowerCase());
  const matching=(Array.isArray(visibleExecutions)?visibleExecutions:[]).filter(r=>forSession(r)&&active(r));
  if(matching.length!==1||clean(matching[0].id??matching[0].executionId??matching[0].entityId)!==remoteId)
    throw Error('M48_RECOVERY_BOOTSTRAP_CONFLICT');
  if(Array.isArray(canonicalExecutions)&&canonicalExecutions.length){
    const canonical=canonicalExecutions.filter(r=>forSession(r)&&active(r));
    if(canonical.length!==1||
      clean(canonical[0].entityId??canonical[0].id)!==remoteId)
      throw Error('M48_RECOVERY_CANONICAL_CONFLICT');
  }
  const startedAt=Date.parse(body.startedAt||'');
  if(!Number.isFinite(startedAt)||startedAt>Date.now()+120000)
    throw Error('M48_RECOVERY_CLOCK_INVALID');
  const source=Array.isArray(body.sourceSnapshot)?body.sourceSnapshot:null;
  const items=Array.isArray(body.items)?body.items:null;
  const blocks=Array.isArray(session.blocks)?session.blocks:null;
  const signature=(b)=>JSON.stringify({
    id:clean(b?.id),type:clean(b?.type),exerciseId:clean(b?.exerciseId),
    sets:Number(b?.sets??0),rounds:Number(b?.rounds??0),
    exerciseIds:Array.isArray(b?.exerciseIds)?b.exerciseIds.map(clean):[],
  });
  if(!source||!items||!blocks||!blocks.length||source.length!==blocks.length||
     items.length!==blocks.length||
     blocks.some((b,i)=>!clean(b.id)||signature(b)!==signature(source[i])||
       signature(b)!==signature(items[i])))
    throw Error('M48_RECOVERY_PRESCRIPTION_DRIFT');

  const execution=createExecution({session,clientId:owner,executionId:remoteId});
  if(Array.isArray(body.queue)||body.results!==undefined){
    if(!Array.isArray(body.queue)||!body.queue.length||
       !body.results||typeof body.results!=='object'||Array.isArray(body.results)||
       body.queue.length!==execution.queue.length||
       body.queue.some((q,i)=>clean(q.blockId)!==clean(execution.queue[i].blockId)||
         clean(q.exerciseId)!==clean(execution.queue[i].exerciseId)||
         Number(q.sets)!==Number(execution.queue[i].sets))||
       !['active','paused','awaiting_feedback'].includes(body.status)||
       !Number.isSafeInteger(Number(body.index))||Number(body.index)<0||
       Number(body.index)>execution.queue.length||
       !Number.isSafeInteger(Number(body.setIndex))||Number(body.setIndex)<0)
      throw Error('M48_RECOVERY_PROGRESS_AMBIGUOUS');
    Object.assign(execution,{
      queue:structuredClone(body.queue),results:structuredClone(body.results),
      events:Array.isArray(body.events)?structuredClone(body.events):[],
      status:body.status,index:Number(body.index),setIndex:Number(body.setIndex),
      planSnapshot:body.planSnapshot&&typeof body.planSnapshot==='object'
        ?structuredClone(body.planSnapshot):execution.planSnapshot,
      accumulatedActiveMs:Number.isFinite(Number(body.accumulatedActiveMs))
        ?Math.max(0,Number(body.accumulatedActiveMs)):0,
      activeSince:body.status==='active'?new Date().toISOString():null,
      restUntil:body.restUntil||null,feedback:body.feedback||null,
    });
  }else{
    // Server start acknowledgment precedes the first progress snapshot.
    // The only safe reconstruction is a zero-progress execution.
    const cursor=body.cursor||{};
    if(clean(body.status)!=='en_curso'||Number(cursor.itemIndex)!==0||
       Number(cursor.setIndex)!==0||body.progressSavedAt||body.results)
      throw Error('M48_RECOVERY_START_NOT_PRISTINE');
    execution.status='active';
    execution.activeSince=new Date().toISOString();
    execution.accumulatedActiveMs=0;
  }
  execution.startedAt=new Date(startedAt).toISOString();
  execution.revision=revision;
  execution.syncStatus='clean';
  execution.pendingOperationIds=[];
  execution.lastSyncError=null;
  return Object.freeze({execution,session,sessionRevision:Number(session.revision||0)});
}
