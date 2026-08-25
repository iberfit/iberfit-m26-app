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

export function createCommandBus({ transport, repository, getToken, rehydrate, registry=M26_COMMAND_REGISTRY, getRole=()=>null, now=()=>Date.now() }) {
  if (!transport?.preflight || !transport?.execute) throw new Error('M26_TRANSPORT_REQUIRED');
  if (!repository?.put || !repository?.remove || !repository?.list) throw new Error('M26_OPERATION_REPOSITORY_REQUIRED');
  if (typeof getToken !== 'function') throw new Error('M26_TOKEN_PROVIDER_REQUIRED');
  if(typeof now!=='function')throw new Error('M26_CLOCK_REQUIRED');
  const inFlight=new Map();
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
    if(source?.queuedOffline!==true)return null;
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
    const createdAt=safeCreatedAt(commandInput?.createdAt);
    const queued = await persist(command, 'pending', { createdAt, retryable: true, queuedOffline: true,attempts:safeAttempts(commandInput?.attempts),nextRetryAt:null,queueOrder:await nextQueueOrder() });
    return { ok: false, queued: true, kind: 'queued', command: sanitizeOperation(queued), response: null };
  }

  async function executeOnce(command, {createdAt,attempts=0,queuedOffline=false,queueOrder=null}={}) {
    const token = await getToken();
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    const previousAttempts=safeAttempts(attempts);
    const queueMeta={createdAt,attempts:previousAttempts,nextRetryAt:null,retryable:true,queuedOffline:queuedOffline===true};
    if(safeQueueOrder(queueOrder)!==null)queueMeta.queueOrder=safeQueueOrder(queueOrder);
    const queued = await persist(command, 'pending', queueMeta);
    try {
      const response = await transport.execute(token, command);
      const kind = String(response?.kind || response?.status || '').toLowerCase();
      if (kind === 'ack' || kind === 'duplicate') {
        await repository.remove(command.operationId);
        if(queuedOffline===true)await rebaseNextQueuedLineage({...queued,...command},response);
        if (typeof rehydrate === 'function') await rehydrate({ reason: kind, response });
        return { ok: true, kind, command: sanitizeOperation({ ...queued, status: 'ack' }), response };
      }
      if (kind === 'conflict') {
        const conflict = await persist(command, 'conflict', { createdAt:queued.createdAt, response, errorCode: response?.reason || 'REVISION_CONFLICT', retryable: false,attempts:previousAttempts,nextRetryAt:null,queuedOffline:queuedOffline===true,queueOrder:queued.queueOrder });
        return { ok: false, kind: 'conflict', command: sanitizeOperation(conflict), response };
      }
      const rejected = await persist(command, 'rejected', { createdAt:queued.createdAt, response, errorCode: response?.reason || 'REJECTED', retryable: false,attempts:previousAttempts,nextRetryAt:null,queuedOffline:queuedOffline===true,queueOrder:queued.queueOrder });
      return { ok: false, kind: 'rejected', command: sanitizeOperation(rejected), response };
    } catch (error) {
      const retryable = ![400, 401, 403, 409, 422].includes(Number(error?.status));
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

  function execute(commandInput) {
    const command = createCommand(commandInput,{registry,role:getRole?.()}),fingerprint=commandFingerprint(command);
    const existing=inFlight.get(command.operationId);
    if(existing){if(existing.fingerprint!==fingerprint)return Promise.reject(new Error('M26_OPERATION_ID_COLLISION'));return existing.promise;}
    const promise=executeOnce(command,{createdAt:commandInput?.createdAt||undefined,attempts:commandInput?.attempts||0,queuedOffline:commandInput?.queuedOffline===true,queueOrder:commandInput?.queueOrder}).finally(()=>{
      if(inFlight.get(command.operationId)?.promise===promise)inFlight.delete(command.operationId);
    });
    inFlight.set(command.operationId,{promise,fingerprint});
    return promise;
  }

  async function pending() {
    return (await repository.list()).map(sanitizeOperation);
  }

  async function retry(operationId) {
    const records = await repository.list();
    let record = records.find((item) => item.operationId === operationId);
    if (!record) throw new Error('M26_OPERATION_NOT_FOUND');
    if (record.status === 'conflict' || record.retryable === false) throw new Error('M26_OPERATION_NOT_RETRYABLE');
    if(blockingPredecessor(record,records))throw new Error('M26_OPERATION_BLOCKED_BY_PREDECESSOR');
    record=await alignStoredContract(record);
    return execute({...record,nextRetryAt:null});
  }

  async function runFlush({ limit = 20, stopOnConflict = false } = {}) {
    const requested=Number(limit);const safeLimit=Number.isFinite(requested)?Math.max(1,Math.min(100,Math.trunc(requested))):20;const at=nowMs();const results=[];
    while(results.length<safeLimit){
      const records=await repository.list();
      const pendingRecords=records.filter((item)=>item.status==='pending'&&item.retryable!==false);
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
    const finalPending=finalRecords.filter((item)=>item.status==='pending'&&item.retryable!==false);
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

  return Object.freeze({ preflight, execute, enqueue, pending, retry, flushPending });
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
