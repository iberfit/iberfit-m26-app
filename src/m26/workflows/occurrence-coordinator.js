// SIGNATURE U40 · opt-in occurrence-specific coordination. NOT UI-wired.
// U36 RPC grants are still revoked. Never fall back to V26 when an RPC,
// network, JWT refresh, or device reconciliation fails.
import {buildOccurrenceScopedCommand} from '../domain/occurrence-commands.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const LOCAL_DATE=/^\d{4}-\d{2}-\d{2}$/u;
const CLIENT_ROLES=new Set(['cliente','client']);
const COACH_ROLES=new Set(['coach']);
const COMMAND_TYPES=new Set([
  'OCURRENCIA_CONFIRMAR','OCURRENCIA_INICIAR',
  'OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR',
  'OCURRENCIA_CANCELAR','OCURRENCIA_REPROGRAMAR',
]);
const READ_STATUSES=new Set(['planificada','confirmada','en_curso','completada','cancelada']);
const uuid=value=>{
  const id=String(value||'').toLowerCase();
  if(!UUID.test(id))throw new Error('U40_INVALID_UUID');
  return id;
};
const error=code=>new Error('U40_'+code);
const keys=(obj,allowed)=>Object.keys(obj).every(key=>allowed.includes(key));
const preciseDate=value=>{
  const d=String(value||'');
  if(!LOCAL_DATE.test(d))throw error('INVALID_CALENDAR_DATE');
  const [year,month,day]=d.split('-').map(Number);
  const t=new Date(Date.UTC(year,month-1,day));
  if(t.getUTCFullYear()!==year||t.getUTCMonth()+1!==month||t.getUTCDate()!==day)
    throw error('INVALID_CALENDAR_DATE');
  return d;
};
const immutable=(obj)=>{
  if(obj&&typeof obj==='object'&&!Object.isFrozen(obj)){
    for(const v of Object.values(obj))immutable(v);
    Object.freeze(obj);
  }
  return obj;
};
function canonicalCommand(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    !keys(value,['type','operationId','clientId','entityId','baseRevision','payload']))
    throw error('INVALID_COMMAND_FIELDS');
  if(!COMMAND_TYPES.has(value.type))throw error('LEGACY_COMMAND_FORBIDDEN');
  const payload=value.payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
    throw error('INVALID_COMMAND_PAYLOAD');
  const expected=({
    OCURRENCIA_CONFIRMAR:[],
    OCURRENCIA_INICIAR:['executionId'],
    OCURRENCIA_GUARDAR_PROGRESO:['executionId','executionBaseRevision','results','skippedSets'],
    OCURRENCIA_COMPLETAR:['executionId','executionBaseRevision','results','skippedSets','feedback'],
    OCURRENCIA_CANCELAR:[],
    OCURRENCIA_REPROGRAMAR:['newOperationId','replacement'],
  })[value.type];
  if(!keys(payload,expected)||expected.some(k=>!Object.hasOwn(payload,k)))
    throw error('INVALID_COMMAND_PAYLOAD');
  const command=buildOccurrenceScopedCommand({
    type:value.type,operationId:value.operationId,
    clientId:value.clientId,occurrenceId:value.entityId,
    baseRevision:value.baseRevision,
    ...payload,
  });
  // Reject tampering with any ignored fields, mutated commands or loosened
  // operation identifiers: server receipts must see the exact same command.
  if(JSON.stringify(value)!==JSON.stringify(command))
    throw error('NONCANONICAL_COMMAND');
  return command;
}
function actorContext(raw){
  if(!raw||typeof raw!=='object')throw error('AUTH_REQUIRED');
  const userId=uuid(raw.userId);
  const role=String(raw.role||'').trim().toLowerCase();
  if(!CLIENT_ROLES.has(role)&&!COACH_ROLES.has(role))
    throw error('ROLE_FORBIDDEN');
  const token=String(raw.accessToken||'');
  if(!token||token.length>16384)throw error('AUTH_REQUIRED');
  const clientId=CLIENT_ROLES.has(role)?uuid(raw.clientId):null;
  return immutable({userId,role,accessToken:token,clientId});
}
function assertOwner(before,after){
  if(before.userId!==after.userId||before.role!==after.role||
    before.clientId!==after.clientId)throw error('AUTH_IDENTITY_CHANGED');
}
const isClient=role=>CLIENT_ROLES.has(role);
function verifyCalendarRow(row,owner,start,end,role){
  if(!row||typeof row!=='object'||Array.isArray(row)||
    uuid(row.clientId)!==owner||!UUID.test(String(row.id||''))||
    !UUID.test(String(row.sessionId||'')))
    throw error('CALENDAR_SCOPE_MISMATCH');
  const date=preciseDate(row.localDate);
  if(date<start||date>end||!READ_STATUSES.has(row.status)||
    !Number.isSafeInteger(row.revision)||row.revision<0)
    throw error('CALENDAR_ROW_INVALID');
  if(isClient(role)&&(
    row.status==='planificada'||!UUID.test(String(row.appointmentId||''))
  ))throw error('CLIENT_CALENDAR_PRIVACY_DRIFT');
  // U33 must never provide private prescription snapshots or queued writes.
  if(Object.keys(row).some(key=>[
    'prescriptionSnapshot','prescription_snapshot','queue',
    'requestHash','events','results','skippedSets','sourceSnapshot',
  ].includes(key)))throw error('CALENDAR_PRIVATE_DATA');
  return row;
}
function verifiedResponse(reply,cmd){
  if(!reply||typeof reply!=='object'||Array.isArray(reply)||
    !['ack','conflict','rejected'].includes(reply.kind)||
    (reply.operationId!=null&&String(reply.operationId).toLowerCase()!==cmd.operationId)||
    (reply.entityId!=null&&String(reply.entityId).toLowerCase()!==cmd.entityId)||
    (reply.clientId!=null&&String(reply.clientId).toLowerCase()!==cmd.clientId))
    throw error('COMMAND_RESPONSE_MISMATCH');
  if(reply.kind==='ack'&&(
    String(reply.operationId||'').toLowerCase()!==cmd.operationId||
    String(reply.entityId||'').toLowerCase()!==cmd.entityId||
    !Number.isSafeInteger(reply.remoteRevision)||reply.remoteRevision<cmd.baseRevision
  ))throw error('COMMAND_ACK_UNVERIFIED');
  if(reply.kind!=='ack'&&typeof reply.reason!=='string')
    throw error('COMMAND_REJECTION_UNVERIFIED');
  if(reply.kind==='ack'&&
    ['OCURRENCIA_INICIAR','OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR'].includes(cmd.type)&&
    (!Number.isSafeInteger(reply.executionRevision)||reply.executionRevision<1))
    throw error('EXECUTION_REVISION_UNVERIFIED');
  return immutable({...reply});
}

/**
 * A gated service for a future authenticated Trainer/Client workspace.
 * It is intentionally NOT attached to current V26 session-controller.
 * Failures after a command is dispatched remain "uncertain", blocking all
 * new operation IDs on that occurrence. Recovery resends the IDENTICAL
 * command ID/payload. U41 requires an owner-scoped encrypted recovery journal
 * BEFORE making any write; a reload must recover the original receipt first.
 */
export function createOccurrenceCoordinator({
  enabled=false,transport,getAuthContext,maxPages=12,journal=null,
}={}){
  if(!transport||typeof transport.occurrenceCalendar!=='function'||
    typeof transport.occurrenceCommand!=='function'||
    typeof getAuthContext!=='function')
    throw error('DEPENDENCIES_REQUIRED');
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>30)
    throw error('MAX_PAGES_INVALID');
  if(journal!==null&&(
    journal?.capability!=='encrypted-owner-bound'||
    typeof journal.readPending!=='function'||
    typeof journal.writePending!=='function'||
    typeof journal.clearPending!=='function'
  ))throw error('PRIVATE_JOURNAL_INVALID');
  const requireJournal=()=>{
    if(!journal)throw error('DURABLE_JOURNAL_REQUIRED');
  };
  const inFlight=new Set(),uncertain=new Map(),usedIds=new Map();
  const requireEnabled=()=>{if(enabled!==true)throw error('API_NOT_ENABLED');};
  const authenticate=async()=>actorContext(await getAuthContext());
  const canAccess=(auth,clientId,type=null)=>{
    if(isClient(auth.role)&&auth.clientId!==clientId)throw error('CLIENT_SCOPE_FORBIDDEN');
    if(type&&(
      ['OCURRENCIA_CONFIRMAR','OCURRENCIA_CANCELAR','OCURRENCIA_REPROGRAMAR'].includes(type)
      &&!COACH_ROLES.has(auth.role)
    ))throw error('ACTOR_NOT_ALLOWED');
  };
  const scope=(auth,cmd)=>auth.userId+'|'+cmd.clientId+'|'+cmd.entityId;
  async function calendar({clientId,startDate,endDate,limit=50}={}){
    requireEnabled();
    const owner=uuid(clientId),start=preciseDate(startDate),end=preciseDate(endDate);
    const days=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000;
    if(days<0||days>92||!Number.isSafeInteger(limit)||limit<1||limit>100)
      throw error('CALENDAR_RANGE_INVALID');
    const actor=await authenticate();canAccess(actor,owner);
    const all=[],seen=new Set(),cursors=new Set();
    let afterDate=null,afterId=null,lastKey='';
    for(let page=0;page<maxPages;page++){
      const query={clientId:owner,startDate:start,endDate:end,limit,
        ...(afterDate?{afterDate,afterId}:{})};
      const response=await transport.occurrenceCalendar(actor.accessToken,query);
      assertOwner(actor,await authenticate());
      if(!response||response.kind!=='calendar'||
        uuid(response.clientId)!==owner||
        !Array.isArray(response.occurrences)||response.occurrences.length>limit||
        response.count!==response.occurrences.length||
        typeof response.hasMore!=='boolean')
        throw error('CALENDAR_RESPONSE_INVALID');
      for(const row of response.occurrences){
        verifyCalendarRow(row,owner,start,end,actor.role);
        const key=row.localDate+'|'+String(row.id).toLowerCase();
        if(key<=lastKey||seen.has(row.id.toLowerCase()))
          throw error('CALENDAR_CURSOR_INVALID');
        seen.add(row.id.toLowerCase());lastKey=key;
        all.push(immutable({...row}));
      }
      if(!response.hasMore)
        return immutable({clientId:owner,timeZone:'America/Santiago',
          startDate:start,endDate:end,count:all.length,occurrences:all});
      const cursor=response.nextCursor;
      if(!cursor||!response.occurrences.length||
        cursor.localDate!==response.occurrences.at(-1).localDate||
        String(cursor.id||'').toLowerCase()!==
          String(response.occurrences.at(-1).id).toLowerCase()||
        cursors.has(cursor.localDate+'|'+cursor.id))
        throw error('CALENDAR_CURSOR_INVALID');
      afterDate=preciseDate(cursor.localDate);afterId=uuid(cursor.id);
      cursors.add(afterDate+'|'+afterId);
    }
    // Never return partial results as a complete calendar.
    throw error('CALENDAR_PAGINATION_LIMIT');
  }
  // The journal adapter must be user-authenticated, encrypted and recoverable
  // independently from this in-memory controller. Never silently substitute
  // localStorage or optimistic RAM for confirmed durable storage.
  async function pendingRecord(scopeKey){
    requireJournal();
    const raw=await journal.readPending(scopeKey);
    if(raw==null)return uncertain.get(scopeKey)||null;
    const cmd=canonicalCommand(raw);
    if(scopeKey.split('|').slice(-2).join('|')!==
      cmd.clientId+'|'+cmd.entityId)
      throw error('JOURNAL_OWNER_MISMATCH');
    const signature=JSON.stringify(cmd);
    const cached=uncertain.get(scopeKey);
    if(cached&&cached.signature!==signature)
      throw error('JOURNAL_CONFLICT');
    return {cmd,signature};
  }
  async function doSend(cmd,actor,scopeKey,signature,{recovery=false}={}){
    if(inFlight.has(scopeKey))throw error('COMMAND_IN_FLIGHT');
    inFlight.add(scopeKey);
    let dispatched=false,confirmed=null;
    try{
      const pending=await pendingRecord(scopeKey);
      if(recovery){
        if(!pending)throw error('NO_PENDING_COMMAND');
        if(pending.signature!==signature)
          throw error('JOURNAL_CONFLICT');
      }else{
        if(pending)throw error('UNCERTAIN_COMMAND_REQUIRES_RECONCILIATION');
        // Durable recovery first, network dispatch second. A storage failure
        // must never create a remote operation that a reload cannot identify.
        await journal.writePending(scopeKey,cmd);
        uncertain.set(scopeKey,{cmd,signature});
      }
      assertOwner(actor,await authenticate());
      dispatched=true;
      const reply=await transport.occurrenceCommand(actor.accessToken,cmd);
      assertOwner(actor,await authenticate());
      confirmed=verifiedResponse(reply,cmd);
      try{
        await journal.clearPending(scopeKey,cmd.operationId);
        uncertain.delete(scopeKey);
        return confirmed;
      }catch{
        // A remote ACK remains an ACK even if cleanup is unavailable.
        // No second command ID is permitted until recovery is reconciled.
        uncertain.set(scopeKey,{cmd,signature});
        return immutable({...confirmed,localRecoveryPending:true});
      }
    }catch(cause){
      if(dispatched&&confirmed===null)uncertain.set(scopeKey,{cmd,signature});
      throw cause;
    }finally{inFlight.delete(scopeKey);}
  }
  async function send(command){
    requireEnabled();requireJournal();
    const cmd=canonicalCommand(command),actor=await authenticate();
    canAccess(actor,cmd.clientId,cmd.type);
    const key=scope(actor,cmd),signature=JSON.stringify(cmd);
    const prior=usedIds.get(actor.userId+'|'+cmd.operationId);
    if(prior&&prior!==signature)throw error('OPERATION_ID_REUSED');
    usedIds.set(actor.userId+'|'+cmd.operationId,signature);
    return doSend(cmd,actor,key,signature);
  }
  async function retryUncertain({clientId,occurrenceId}={}){
    requireEnabled();requireJournal();
    const owner=uuid(clientId),id=uuid(occurrenceId),actor=await authenticate();
    canAccess(actor,owner);
    const key=actor.userId+'|'+owner+'|'+id;
    const pending=await pendingRecord(key);
    if(!pending)throw error('NO_PENDING_COMMAND');
    canAccess(actor,owner,pending.cmd.type);
    return doSend(pending.cmd,actor,key,pending.signature,{recovery:true});
  }
  async function hasUncertain({clientId,occurrenceId}={}){
    requireEnabled();requireJournal();
    const owner=uuid(clientId),id=uuid(occurrenceId),actor=await authenticate();
    canAccess(actor,owner);
    return Boolean(await pendingRecord(actor.userId+'|'+owner+'|'+id));
  }
  return Object.freeze({calendar,send,retryUncertain,hasUncertain});
}
