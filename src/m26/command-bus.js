import { M26_COMMAND_REGISTRY, getCommandDefinition, validateCommandAgainstRegistry } from './command-catalog.js';
import { createM26Id } from './platform/id.js';
const COMMAND_PATTERN = /^[A-ZÁÉÍÓÚÑ0-9_]+$/u;
const ENTITY_PATTERN = /^[a-z_]+$/;
const MAX_COMMAND_PAYLOAD_BYTES=256_000;
const SAFE_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const MAX_RETRY_DELAY_MS=5*60*1000;
function deepFreeze(value,seen=new WeakSet()){if(!value||typeof value!=='object'||seen.has(value))return value;seen.add(value);for(const child of Object.values(value))deepFreeze(child,seen);return Object.freeze(value);}
function safeCreatedAt(value){if(!value)return undefined;const time=new Date(value).getTime();return Number.isFinite(time)?new Date(time).toISOString():undefined;}
function safeErrorCode(value){return String(value||'M26_COMMAND_ERROR').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,240)||'M26_COMMAND_ERROR';}
function canonicalValue(value){if(Array.isArray(value))return value.map(canonicalValue);if(value&&typeof value==='object'){return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonicalValue(value[key])]));}return value;}
function commandFingerprint(command){return JSON.stringify(canonicalValue({type:String(command?.type||''),entityType:String(command?.entityType||''),entityId:String(command?.entityId||''),clientId:command?.clientId==null?null:String(command.clientId),baseRevision:Number(command?.baseRevision||0),conflictSensitive:command?.conflictSensitive!==false,reason:command?.reason==null?null:String(command.reason),previewAccepted:command?.previewAccepted===true,payload:command?.payload&&typeof command.payload==='object'&&!Array.isArray(command.payload)?command.payload:{}}));}
function safeAttempts(value){const n=Number(value);return Number.isInteger(n)&&n>=0?Math.min(n,1000):0;}
function safeQueueOrder(value){const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;}
function retryDelayMs(attempt){return Math.min(MAX_RETRY_DELAY_MS,1000*(2**Math.min(9,Math.max(0,safeAttempts(attempt)-1))));}
function dueAt(value){const time=value?new Date(value).getTime():0;return Number.isFinite(time)?time:0;}
function queueTime(value){const time=value?.createdAt?new Date(value.createdAt).getTime():0;return Number.isFinite(time)?time:0;}
function compareQueueOrder(a,b){const ao=safeQueueOrder(a?.queueOrder),bo=safeQueueOrder(b?.queueOrder);if(ao!==null&&bo!==null&&ao!==bo)return ao-bo;const time=queueTime(a)-queueTime(b);if(time!==0)return time;return String(a?.operationId||'').localeCompare(String(b?.operationId||''));}
function executionLineage(command){
  const clientId=String(command?.clientId||'');if(!clientId)return null;
  if(command?.entityType==='session_execution'&&command?.entityId)return `${clientId}:execution:${String(command.entityId)}`;
  if(command?.type==='SESION_INICIAR'&&command?.payload?.executionId)return `${clientId}:execution:${String(command.payload.executionId)}`;
  return null;
}
function ackExecutionRevision(command,response){
  if(command?.type==='SESION_INICIAR'){
    const value=response?.receipt?.response?.executionRevision ?? response?.response?.executionRevision ?? response?.executionRevision;
    const revision=Number(value);return Number.isInteger(revision)&&revision>=0?revision:null;
  }
  if(command?.entityType==='session_execution'){
    const revision=Number(response?.remoteRevision);return Number.isInteger(revision)&&revision>=0?revision:null;
  }
  return null;
}
function canRebaseQueuedOperation(record){
  return record?.queuedOffline===true
    && record?.entityType==='session_execution'
    && record?.conflictSensitive===true
    && safeAttempts(record?.attempts)===0
    && record?.status==='pending'
    && record?.retryable!==false;
}
function blockingPredecessor(record,records){
  const lineage=executionLineage(record);if(!lineage)return null;
  return [...records].filter((candidate)=>candidate?.operationId!==record?.operationId&&executionLineage(candidate)===lineage&&compareQueueOrder(candidate,record)<0).sort(compareQueueOrder)[0]||null;
}
function isExecutionCompletionCommand(command){return command?.type==='EJECUCION_COMPLETAR'&&command?.entityType==='session_execution'&&Boolean(command?.entityId);}
function durableCompletionPatch(record,executionId){
  const id=String(executionId||'').trim(),patch=record?.payload?.patch;
  const completedAt=patch?.completedAt?new Date(patch.completedAt).getTime():NaN;
  if(
    !SAFE_ID_PATTERN.test(id)||!isExecutionCompletionCommand(record)||
    record?.operationId!==id||record?.entityId!==id||
    !patch||typeof patch!=='object'||Array.isArray(patch)||
    patch?.id!==id||patch?.clientId!==record?.clientId||patch?.status!=='completed'||
    !Number.isFinite(completedAt)
  )return null;
  return patch;
}

export function createCommand(input = {}, { registry=M26_COMMAND_REGISTRY, role=null } = {}) {
  if(input?.payload!==undefined&&(!input.payload||typeof input.payload!=='object'||Array.isArray(input.payload)))throw new Error('M26_COMMAND_PAYLOAD_INVALID');
  const type=String(input.type || '');
  const definition=getCommandDefinition(type,registry);
  const command = {
    operationId: input.operationId || createM26Id(),
    type,
    entityType: String(input.entityType || ''),
    entityId: input.entityId || createM26Id(),
    clientId: input.clientId || null,
    baseRevision: Number(input.baseRevision || 0),
    conflictSensitive: definition?.conflictSensitive ?? (input.conflictSensitive !== false),
    reason: input.reason==null?null:String(input.reason).trim().slice(0,1000),
    previewAccepted: input.previewAccepted === true,
    payload: input.payload===undefined ? {} : structuredClone(input.payload),
  };
  validateCommand(command,{registry,role});
  return deepFreeze(command);
}

function BufferByteLength(value){let serialized;try{serialized=JSON.stringify(value);}catch{throw new Error('M26_COMMAND_PAYLOAD_NOT_SERIALIZABLE');}if(serialized===undefined)throw new Error('M26_COMMAND_PAYLOAD_NOT_SERIALIZABLE');return typeof TextEncoder==='function'?new TextEncoder().encode(serialized).length:serialized.length;}

export function validateCommand(command,{registry=M26_COMMAND_REGISTRY,role=null}={}) {
  if (!SAFE_ID_PATTERN.test(String(command?.operationId||''))) throw new Error('M26_OPERATION_ID_INVALID');
  if (!COMMAND_PATTERN.test(command.type)) throw new Error('M26_COMMAND_TYPE_INVALID');
  if (!ENTITY_PATTERN.test(command.entityType)) throw new Error('M26_ENTITY_TYPE_INVALID');
  if (!SAFE_ID_PATTERN.test(String(command.entityId||'')) || !SAFE_ID_PATTERN.test(String(command.clientId||''))) throw new Error('M26_ENTITY_AND_CLIENT_INVALID');
  if (!Number.isInteger(command.baseRevision) || command.baseRevision < 0) throw new Error('M26_BASE_REVISION_INVALID');
  if(BufferByteLength(command.payload)>MAX_COMMAND_PAYLOAD_BYTES)throw new Error('M26_COMMAND_PAYLOAD_TOO_LARGE');
  const registryCheck=validateCommandAgainstRegistry(command,role,registry);
  if(!registryCheck.ok) throw new Error(`M26_COMMAND_CONTRACT_INVALID:${registryCheck.errors.join(',')}`);
  return command;
}

export function sanitizeOperation(operation) {
  return {
    operationId: operation.operationId,
    type: operation.type,
    entityType: operation.entityType,
    entityId: operation.entityId,
    clientId: operation.clientId,
    baseRevision: operation.baseRevision,
    status: operation.status,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    errorCode: operation.errorCode || null,
    retryable: operation.retryable !== false,
    attempts:safeAttempts(operation.attempts),
    nextRetryAt:safeCreatedAt(operation.nextRetryAt)||null,
  };
}

export function createCommandBus({ transport, repository, getToken, rehydrate, onPostAckRefreshError=()=>{}, registry=M26_COMMAND_REGISTRY, getRole=()=>null, now=()=>Date.now() }) {
  if (!transport?.preflight || !transport?.execute) throw new Error('M26_TRANSPORT_REQUIRED');
  if (!repository?.put || !repository?.remove || !repository?.list) throw new Error('M26_OPERATION_REPOSITORY_REQUIRED');
  if (typeof getToken !== 'function') throw new Error('M26_TOKEN_PROVIDER_REQUIRED');
  if(typeof now!=='function')throw new Error('M26_CLOCK_REQUIRED');
  const inFlight=new Map();
  // A remote ACK whose local cleanup failed must never be replayed by the
  // same live command bus. Durable server operation IDs protect across reloads.
  const confirmedRemoteOperations=new Map();
  // Once an exact, authenticated completion ACK is received, its full remote
  // snapshot supersedes older queued execution mutations. A background flush
  // or an old browser callback must never send progress after this boundary.
  const terminalExecutionLineages=new Set();
  // Restore only authenticated, durable terminal ACKs before a new browser
  // context can dispatch an old execution mutation. Coalesce the initial
  // storage read to avoid redundant bootstrap work across concurrent sends.
  let terminalRecoveryInFlight=null;
  // Independently retain only exact server ACK revisions for this authenticated
  // command-bus instance. UI onAck observers may belong to a stale/replaced
  // execution object after a slow hydrate; never infer a CAS from local state.
  const confirmedExecutionRevisions=new Map();
  function recordConfirmedExecutionRevision(command,response){
    if(command?.entityType!=='session_execution')return;
    const scope=executionLineage(command);
    const revision=Number(response?.remoteRevision);
    const base=Number(command?.baseRevision);
    if(!scope||!Number.isSafeInteger(revision)||!Number.isSafeInteger(base)
      ||base<0||revision<=base)return;
    const previous=confirmedExecutionRevisions.get(scope)||0;
    confirmedExecutionRevisions.delete(scope);
    confirmedExecutionRevisions.set(scope,Math.max(previous,revision));
    // Bounded per-session memory; no persistent data, cross-session sharing
    // or claim that the latest local edit was remotely accepted.
    if(confirmedExecutionRevisions.size>256)
      confirmedExecutionRevisions.delete(confirmedExecutionRevisions.keys().next().value);
  }
  function confirmedExecutionRevision(execution){
    const scope=executionLineage({
      entityType:'session_execution',
      entityId:execution?.entityId??execution?.id,
      clientId:execution?.clientId,
    });
    return scope?(confirmedExecutionRevisions.get(scope)||0):0;
  }
  let flushInFlight=null;
  let localQueueOrder=0;
  const nowMs=()=>{const value=Number(now());if(!Number.isFinite(value))throw new Error('M26_CLOCK_INVALID');return value;};

  async function ensureOperationIdentity(command){const existing=(await repository.list()).find((item)=>item.operationId===command.operationId);if(existing&&commandFingerprint(existing)!==commandFingerprint(command))throw new Error('M26_OPERATION_ID_COLLISION');}

  async function nextQueueOrder(){
    const records=await repository.list();
    const maxPersisted=records.reduce((max,item)=>Math.max(max,safeQueueOrder(item?.queueOrder)??0),0);
    localQueueOrder=Math.max(localQueueOrder,maxPersisted)+1;
    return localQueueOrder;
  }

  async function persist(command, status, extra = {}) {
    await ensureOperationIdentity(command);
    const timestamp = new Date(nowMs()).toISOString();
    const record = {
      ...structuredClone(command),
      status,
      createdAt: safeCreatedAt(extra.createdAt) || timestamp,
      updatedAt: timestamp,
      attempts:safeAttempts(extra.attempts),
      nextRetryAt:safeCreatedAt(extra.nextRetryAt)||null,
      ...extra,
    };
    record.attempts=safeAttempts(record.attempts);record.nextRetryAt=safeCreatedAt(record.nextRetryAt)||null;
    if(record.queueOrder!==undefined)record.queueOrder=safeQueueOrder(record.queueOrder);
    await repository.put(record);
    return record;
  }

  function terminalProgressForbidden(command){
    return command?.entityType==='session_execution'
      &&!isExecutionCompletionCommand(command)
      &&terminalExecutionLineages.has(executionLineage(command));
  }
  async function sealConfirmedExecutionCompletion(command){
    const lineage=executionLineage(command);
    if(!lineage)return;
    // Set synchronously before any storage await, closing late callback races.
    terminalExecutionLineages.add(lineage);
    const records=await repository.list();
    for(const record of records){
      if(executionLineage(record)!==lineage||record.status!=='pending'
        ||record.retryable===false||isExecutionCompletionCommand(record))continue;
      // Preserve identity/payload for diagnostics. Do not claim these stale
      // commands were accepted: the confirmed terminal snapshot owns history.
      await repository.put({
        ...structuredClone(record),
        status:'rejected',retryable:false,nextRetryAt:null,
        errorCode:'M26_EXECUTION_SUPERSEDED_BY_COMPLETION',
        updatedAt:new Date(nowMs()).toISOString(),
      });
    }
  }

  async function restoreTerminalCompletionFence(){
    if(terminalRecoveryInFlight)return terminalRecoveryInFlight;
    terminalRecoveryInFlight=(async()=>{
      const archived=await repository.list();
      for(const record of archived){
        if(record?.status==='ack'&&durableCompletionPatch(record,record.entityId))
          await sealConfirmedExecutionCompletion(record);
      }
    })().catch(error=>{
      // A storage read failure is fail-closed for this dispatch; allow a
      // subsequent attempt to recover when the local store is accessible.
      terminalRecoveryInFlight=null;
      throw error;
    });
    return terminalRecoveryInFlight;
  }
  async function assertNotTerminalExecutionMutation(command){
    if(command?.entityType!=='session_execution'||isExecutionCompletionCommand(command))return;
    await restoreTerminalCompletionFence();
    if(terminalProgressForbidden(command))throw new Error('M26_EXECUTION_ALREADY_COMPLETED');
  }
  async function alignStoredContract(record){
    const definition=getCommandDefinition(record?.type,registry);
    if(!definition||record?.conflictSensitive===definition.conflictSensitive)return record;
    if(record?.queuedOffline!==true||record?.status!=='pending'||safeAttempts(record?.attempts)!==0){
      const stale={...structuredClone(record),status:'conflict',retryable:false,errorCode:'M26_OPERATION_CONTRACT_STALE',nextRetryAt:null,updatedAt:new Date(nowMs()).toISOString()};
      await repository.put(stale);
      const error=new Error('M26_OPERATION_CONTRACT_STALE');
      error.operation=sanitizeOperation(stale);
      error.localConflict=true;
      throw error;
    }
    const migrated={
      ...structuredClone(record),
      conflictSensitive:definition.conflictSensitive,
      updatedAt:new Date(nowMs()).toISOString(),
      contractMigratedFromConflictSensitive:record?.conflictSensitive!==false,
    };
    await repository.put(migrated);
    return migrated;
  }

  async function rebaseNextQueuedLineage(source,response){
    const lineage=executionLineage(source),revision=ackExecutionRevision(source,response);
    if(!lineage||revision===null)return null;
    const records=(await repository.list()).filter((record)=>executionLineage(record)===lineage&&compareQueueOrder(record,source)>0).sort(compareQueueOrder);
    let next=records[0];if(!next)return null;
    next=await alignStoredContract(next);
    if(!canRebaseQueuedOperation(next))return null;
    if(next.baseRevision===revision)return next;
    const rebased={...structuredClone(next),baseRevision:revision,updatedAt:new Date(nowMs()).toISOString(),rebasedFromRevision:Number(next.baseRevision),rebasedAfterOperationId:source.operationId};
    validateCommand(rebased,{registry,role:getRole?.()});
    await repository.put(rebased);
    return rebased;
  }

  async function preflight(commandInput) {
    const command = createCommand(commandInput,{registry,role:getRole?.()});
    const token = await getToken();
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    const response = await transport.preflight(token, command);
    return { command, response };
  }

  async function enqueue(commandInput) {
    const command = createCommand(commandInput,{registry,role:getRole?.()});
    await assertNotTerminalExecutionMutation(command);
    const createdAt=safeCreatedAt(commandInput?.createdAt);
    const queued = await persist(command, 'pending', { createdAt, retryable: true, queuedOffline: true,attempts:safeAttempts(commandInput?.attempts),nextRetryAt:null,queueOrder:await nextQueueOrder() });
    // Offline enqueue also crosses async storage boundaries. A completion
    // ACK may land while its queue order or persistence was being written.
    if(terminalProgressForbidden(command)){
      try{
        await repository.put({
          ...structuredClone(queued),status:'rejected',retryable:false,
          nextRetryAt:null,errorCode:'M26_EXECUTION_SUPERSEDED_BY_COMPLETION',
          updatedAt:new Date(nowMs()).toISOString(),
        });
      }catch{}
      throw new Error('M26_EXECUTION_ALREADY_COMPLETED');
    }
    return { ok: false, queued: true, kind: 'queued', command: sanitizeOperation(queued), response: null };
  }

  async function executeOnce(command, {createdAt,attempts=0,queuedOffline=false,queueOrder=null,onAck=null}={}) {
    const token = await getToken();
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    // An execution may have completed while a stale callback awaited token
    // refresh. On a fresh page this also restores exact persisted terminal ACKs
    // even if the ordinary background flush has not started yet.
    await assertNotTerminalExecutionMutation(command);
    const previousAttempts=safeAttempts(attempts);
    const queueMeta={createdAt,attempts:previousAttempts,nextRetryAt:null,retryable:true,queuedOffline:queuedOffline===true};
    if(safeQueueOrder(queueOrder)!==null)queueMeta.queueOrder=safeQueueOrder(queueOrder);
    const queued = await persist(command, 'pending', queueMeta);
    // The completion ACK may land *during* IndexedDB persistence. Recheck at
    // the last synchronous dispatch boundary, before any transport request.
    // Preserve the local operation as rejected, never as a retryable write.
    if(terminalProgressForbidden(command)){
      try{
        await repository.put({
          ...structuredClone(queued),status:'rejected',retryable:false,
          nextRetryAt:null,errorCode:'M26_EXECUTION_SUPERSEDED_BY_COMPLETION',
          updatedAt:new Date(nowMs()).toISOString(),
        });
      }catch{
        // The in-memory terminal fence still forbids network dispatch; the
        // durable completion ACK is recovered again on the next boot.
      }
      throw new Error('M26_EXECUTION_ALREADY_COMPLETED');
    }
    try {
      const response = await transport.execute(token, command);
      const kind = String(response?.kind || response?.status || '').toLowerCase();
      if (kind === 'ack' || kind === 'duplicate') {
        recordConfirmedExecutionRevision(command,response);
        if(isExecutionCompletionCommand(command)){
          // Close the live browser race immediately. No storage failure may
          // downgrade the already-committed server ACK to a retryable write.
          terminalExecutionLineages.add(executionLineage(command));
        }
        // The remote revision is known at ACK arrival. Give the active
        // execution its server-confirmed CAS value BEFORE the optional full
        // bootstrap refresh. A slow refresh must never leave the next set
        // using the previous baseRevision. This hook is advisory and cannot
        // turn an authoritative ACK into another mutation or failed result.
        if(typeof onAck==='function'){
          try{onAck(response,command);}catch{}
        }
        let acknowledged=null,localReceiptOk=true;
        // The server ACK is authoritative even when local receipt persistence
        // or cleanup fails. A durable ACK tombstone is preferred if removal
        // fails, so subsequent app loads cannot resend the pending operation.
        const ackMeta={createdAt:queued.createdAt,response,retryable:false,attempts:previousAttempts,nextRetryAt:null,queuedOffline:queuedOffline===true,queueOrder:queued.queueOrder};
        try {
          if(isExecutionCompletionCommand(command)){
            acknowledged=await persist(command,'ack',ackMeta);
          }else{
            try{await repository.remove(command.operationId);}
            catch{acknowledged=await persist(command,'ack',ackMeta);}
          }
        }catch{localReceiptOk=false;}
        if(isExecutionCompletionCommand(command)){
          try{await sealConfirmedExecutionCompletion(command);}
          catch{localReceiptOk=false;}
        }
        // The server ACK is authoritative. Post-ACK local reconciliation can
        // fail because of a refresh, another tab or offline storage. Never turn
        // a successful publication into a new pending/rejected mutation:
        // retrying a different operation ID could otherwise create duplicates.
        let lineageOk=true,refreshOk=true;
        if(!isExecutionCompletionCommand(command)){
          try { await rebaseNextQueuedLineage({...queued,...command},response); }
          catch { lineageOk=false; }
        }
        // A server-confirmed workout completion is already durable. The optional
        // full bootstrap is not a part of its CAS or persistence boundary:
        // holding the ACK behind it can make the Client show "pending" after
        // the server actually closed the workout. Start that read on the next
        // event-loop turn, AFTER the caller can apply its authoritative ACK.
        // Other commands retain the existing awaited refresh contract.
        const deferredCompletionRefresh=typeof rehydrate==='function'&&isExecutionCompletionCommand(command);
        if(deferredCompletionRefresh){
          setTimeout(()=>{
            void Promise.resolve().then(()=>rehydrate({reason:kind,response})).catch(error=>{
              try{onPostAckRefreshError(error,{commandType:command.type,operationId:command.operationId});}catch{}
            });
          },0);
        }else if(typeof rehydrate==='function'){
          try { await rehydrate({reason:kind,response}); }
          catch { refreshOk=false; }
        }
        const ackResult={ ok:true, kind, command:sanitizeOperation({...(acknowledged||queued),status:'ack'}),
          response,refreshOk:deferredCompletionRefresh?null:refreshOk,
          refreshDeferred:deferredCompletionRefresh,lineageOk,localReceiptOk,
          refreshPending:deferredCompletionRefresh||!refreshOk||!localReceiptOk };
        if(!localReceiptOk)confirmedRemoteOperations.set(command.operationId,{fingerprint:commandFingerprint(command),result:ackResult});
        else confirmedRemoteOperations.delete(command.operationId);
        return ackResult;
      }
      if (kind === 'conflict') {
        const conflict = await persist(command, 'conflict', { createdAt:queued.createdAt, response, errorCode: response?.reason || 'REVISION_CONFLICT', retryable: false,attempts:previousAttempts,nextRetryAt:null,queuedOffline:queuedOffline===true,queueOrder:queued.queueOrder });
        return { ok: false, kind: 'conflict', command: sanitizeOperation(conflict), response };
      }
      const rejected = await persist(command, 'rejected', { createdAt:queued.createdAt, response, errorCode: response?.reason || 'REJECTED', retryable: false,attempts:previousAttempts,nextRetryAt:null,queuedOffline:queuedOffline===true,queueOrder:queued.queueOrder });
      return { ok: false, kind: 'rejected', command: sanitizeOperation(rejected), response };
    } catch (error) {
      if(Number(error?.status)===401){
        const record=await persist(command,'pending',{
          createdAt:queued.createdAt,
          errorCode:'M26_AUTH_REQUIRED',
          retryable:true,attempts:previousAttempts,nextRetryAt:null,queuedOffline:queuedOffline===true,queueOrder:queued.queueOrder,
        });
        error.operation=sanitizeOperation(record);
        error.authRequired=true;
        throw error;
      }
      const retryable = ![400, 403, 409, 422].includes(Number(error?.status));
      const nextAttempts=previousAttempts+1;
      const nextRetryAt=retryable?new Date(nowMs()+retryDelayMs(nextAttempts)).toISOString():null;
      const record = await persist(command, retryable ? 'pending' : 'rejected', {
        createdAt:queued.createdAt,
        errorCode: safeErrorCode(error?.body?.code || error?.message),
        retryable,attempts:nextAttempts,nextRetryAt,queuedOffline:queuedOffline===true,queueOrder:queued.queueOrder,
      });
      error.operation = sanitizeOperation(record);
      throw error;
    }
  }

  function execute(commandInput,{onAck=null}={}) {
    if(onAck!==null&&typeof onAck!=='function')throw new Error('M26_ACK_OBSERVER_INVALID');
    const command = createCommand(commandInput,{registry,role:getRole?.()}),fingerprint=commandFingerprint(command);
    if(terminalProgressForbidden(command))return Promise.reject(new Error('M26_EXECUTION_ALREADY_COMPLETED'));
    const existing=inFlight.get(command.operationId);
    if(existing){if(existing.fingerprint!==fingerprint)return Promise.reject(new Error('M26_OPERATION_ID_COLLISION'));return existing.promise;}
    const confirmed=confirmedRemoteOperations.get(command.operationId);
    if(confirmed){if(confirmed.fingerprint!==fingerprint)return Promise.reject(new Error('M26_OPERATION_ID_COLLISION'));return Promise.resolve(confirmed.result);}
    const promise=executeOnce(command,{createdAt:commandInput?.createdAt||undefined,attempts:commandInput?.attempts||0,queuedOffline:commandInput?.queuedOffline===true,queueOrder:commandInput?.queueOrder,onAck}).finally(()=>{
      if(inFlight.get(command.operationId)?.promise===promise)inFlight.delete(command.operationId);
    });
    inFlight.set(command.operationId,{promise,fingerprint});
    return promise;
  }

  async function pending() {
    return (await repository.list()).filter((record)=>record?.status!=='ack'&&!confirmedRemoteOperations.has(record.operationId)).map(sanitizeOperation);
  }

  async function recoverExecutionCompletion(executionId) {
    const id=String(executionId||'').trim();
    if(!SAFE_ID_PATTERN.test(id))throw new Error('M26_EXECUTION_ID_INVALID');
    const record=(await repository.list()).find((item)=>item?.operationId===id)||null;
    const patch=record?durableCompletionPatch(record,id):null;
    if(!patch)return null;
    return deepFreeze({operation:sanitizeOperation(record),patch:structuredClone(patch)});
  }

  async function settleExecutionCompletion(executionId) {
    const id=String(executionId||'').trim();
    if(!SAFE_ID_PATTERN.test(id))throw new Error('M26_EXECUTION_ID_INVALID');
    const record=(await repository.list()).find((item)=>item?.operationId===id)||null;
    if(!record||record?.status!=='ack'||!durableCompletionPatch(record,id))return false;
    await repository.remove(id);
    return true;
  }

  async function retry(operationId) {
    const confirmed=confirmedRemoteOperations.get(operationId);
    if(confirmed)return confirmed.result;
    const records = await repository.list();
    let record = records.find((item) => item.operationId === operationId);
    if(record&&terminalProgressForbidden(record))throw new Error('M26_EXECUTION_ALREADY_COMPLETED');
    if (!record) throw new Error('M26_OPERATION_NOT_FOUND');
    if (record.status === 'conflict' || record.retryable === false) throw new Error('M26_OPERATION_NOT_RETRYABLE');
    if(blockingPredecessor(record,records))throw new Error('M26_OPERATION_BLOCKED_BY_PREDECESSOR');
    record=await alignStoredContract(record);
    return execute({...record,nextRetryAt:null});
  }

  async function runFlush({ limit = 20, stopOnConflict = false } = {}) {
    // After a process restart, an ACK tombstone can survive the recovery
    // checkpoint. Apply its completion boundary before selecting any queued
    // command from the same execution lineage.
    const archived=await repository.list();
    for(const record of archived){
      if(record.status==='ack'&&durableCompletionPatch(record,record.entityId))
        await sealConfirmedExecutionCompletion(record);
    }
    const requested=Number(limit);const safeLimit=Number.isFinite(requested)?Math.max(1,Math.min(100,Math.trunc(requested))):20;const at=nowMs();const results=[];
    while(results.length<safeLimit){
      const records=await repository.list();
      const pendingRecords=records.filter((item)=>item.status==='pending'&&item.retryable!==false&&!confirmedRemoteOperations.has(item.operationId));
      const due=pendingRecords.filter((item)=>dueAt(item.nextRetryAt)<=at).sort(compareQueueOrder);
      let record=due.find((item)=>!blockingPredecessor(item,records));
      if(!record)break;
      try{
        record=await alignStoredContract(record);
        const result=await execute(record);results.push(result);
        if(stopOnConflict&&result?.kind==='conflict')break;
      }catch(error){
        const localConflict=error?.localConflict===true||error?.operation?.status==='conflict';
        results.push({ok:false,kind:localConflict?'conflict':'network_error',operationId:record.operationId,error:safeErrorCode(error?.message)});
        if(!localConflict||stopOnConflict)break;
      }
    }
    const finalRecords=await repository.list();
    const finalPending=finalRecords.filter((item)=>item.status==='pending'&&item.retryable!==false&&!confirmedRemoteOperations.has(item.operationId));
    const deferred=finalPending.filter((item)=>dueAt(item.nextRetryAt)>at).length;
    const blocked=finalPending.filter((item)=>dueAt(item.nextRetryAt)<=at&&blockingPredecessor(item,finalRecords)).length;
    const remaining=finalPending.filter((item)=>dueAt(item.nextRetryAt)<=at).length;
    return { online: true, attempted: results.length, deferred, remaining, blocked, results };
  }

  function flushPending(options={}) {
    if(flushInFlight)return flushInFlight;
    flushInFlight=runFlush(options).finally(()=>{flushInFlight=null;});
    return flushInFlight;
  }

  return Object.freeze({ preflight, execute, enqueue, pending, confirmedExecutionRevision, recoverExecutionCompletion, settleExecutionCompletion, retry, flushPending });
}

export function createMemoryOperationRepository() {
  const records = new Map();
  return {
    async put(record) { records.set(record.operationId, structuredClone(record)); },
    async get(operationId) { const value=records.get(operationId); return value?structuredClone(value):null; },
    async remove(operationId) { records.delete(operationId); },
    async list() { return [...records.values()].sort(compareQueueOrder).map((record) => structuredClone(record)); },
  };
}

export const __commandBusInternals=Object.freeze({commandFingerprint,retryDelayMs,dueAt,compareQueueOrder,executionLineage,ackExecutionRevision,canRebaseQueuedOperation,blockingPredecessor});
