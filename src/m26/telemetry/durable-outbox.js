import {
  createBrowserKeyValueStore,
} from '../platform/key-value-store.js';
import {
  TELEMETRY_OUTBOX_MAX_AGE_MS,
  TELEMETRY_OUTBOX_MAX_EVENTS,
  buildTelemetryUploadBatches,
  telemetryEventIdempotencyKey,
  telemetryRetryDisposition,
} from './persistence-contract.js';

const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const RECORD_SCHEMA='iberfit.telemetry.outbox.record.v1';
const STATUS_PENDING='pending';
const STATUS_TERMINAL='terminal';
const MAX_RETRY_DELAY_MS=5*60*1000;

function clone(value){
  return value==null?value:structuredClone(value);
}
function safeId(value,code){
  const text=String(value||'').trim();
  if(!SAFE_ID.test(text))throw new Error(code);
  return text;
}
function safeTime(value){
  const time=value?new Date(value).getTime():NaN;
  return Number.isFinite(time)?time:null;
}
function safeAttempts(value){
  const number=Number(value);
  return Number.isInteger(number)&&number>=0
    ?Math.min(number,1000)
    :0;
}
function safeErrorCode(value){
  return String(value||'M26_TELEMETRY_OUTBOX_ERROR')
    .replace(/[\u0000-\u001f\u007f]/g,' ')
    .trim()
    .slice(0,160)||
    'M26_TELEMETRY_OUTBOX_ERROR';
}
function retryDelayMs(attempts){
  return Math.min(
    MAX_RETRY_DELAY_MS,
    1000*(2**Math.min(9,Math.max(0,safeAttempts(attempts)-1)))
  );
}
function eventFingerprint(event){
  return JSON.stringify(event);
}

export function createTelemetryDurableOutbox({
  ownerId,
  storage=null,
  now=()=>Date.now(),
  maxEvents=TELEMETRY_OUTBOX_MAX_EVENTS,
  maxAgeMs=TELEMETRY_OUTBOX_MAX_AGE_MS,
}={}){
  const owner=safeId(ownerId,'M26_TELEMETRY_OUTBOX_OWNER_REQUIRED');
  if(typeof now!=='function')throw new Error('M26_TELEMETRY_OUTBOX_CLOCK_REQUIRED');

  const eventLimit=Math.max(
    1,
    Math.min(
      TELEMETRY_OUTBOX_MAX_EVENTS,
      Math.trunc(Number(maxEvents)||TELEMETRY_OUTBOX_MAX_EVENTS)
    )
  );
  const ageLimit=Math.max(
    60_000,
    Math.min(
      TELEMETRY_OUTBOX_MAX_AGE_MS,
      Math.trunc(Number(maxAgeMs)||TELEMETRY_OUTBOX_MAX_AGE_MS)
    )
  );

  const store=storage||createBrowserKeyValueStore({
    dbName:'iberfit-m26-telemetry',
    storeName:'outbox_v1',
    version:1,
    sessionPrefix:'iberfit:m26:telemetry-outbox-v1:',
  });

  if(
    !store?.get||
    !store?.set||
    !store?.remove||
    !store?.entries||
    !store?.clear
  ){
    throw new Error('M26_TELEMETRY_OUTBOX_STORAGE_REQUIRED');
  }

  const prefix=`m26:telemetry-outbox:v1:${owner}:`;

  function nowMs(){
    const value=Number(now());
    if(!Number.isFinite(value))throw new Error('M26_TELEMETRY_OUTBOX_CLOCK_INVALID');
    return value;
  }

  function keyFor(event){
    telemetryEventIdempotencyKey(event);
    return `${prefix}${event.clientId}:${event.eventId}`;
  }

  function normalizeRecord(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
    if(raw.schemaVersion!==RECORD_SCHEMA)return null;
    if(String(raw.ownerId||'')!==owner)return null;

    const event=raw.event;
    try{telemetryEventIdempotencyKey(event);}
    catch{return null;}

    if(String(raw.clientId||'')!==String(event.clientId))return null;
    if(String(raw.eventId||'')!==String(event.eventId))return null;

    const status=[STATUS_PENDING,STATUS_TERMINAL].includes(raw.status)
      ?raw.status
      :STATUS_PENDING;
    const stagedAt=safeTime(raw.stagedAt);
    const updatedAt=safeTime(raw.updatedAt);

    if(stagedAt===null||updatedAt===null)return null;

    return {
      schemaVersion:RECORD_SCHEMA,
      ownerId:owner,
      clientId:event.clientId,
      sessionId:event.sessionId,
      executionId:event.executionId,
      eventId:event.eventId,
      idempotencyKey:telemetryEventIdempotencyKey(event),
      event:clone(event),
      status,
      stagedAt:new Date(stagedAt).toISOString(),
      updatedAt:new Date(updatedAt).toISOString(),
      attempts:safeAttempts(raw.attempts),
      nextRetryAt:safeTime(raw.nextRetryAt)===null
        ?null
        :new Date(safeTime(raw.nextRetryAt)).toISOString(),
      lastErrorCode:raw.lastErrorCode
        ?safeErrorCode(raw.lastErrorCode)
        :null,
    };
  }

  async function records(){
    const output=[];
    for(const [storageKey,raw] of await store.entries(prefix)){
      const normalized=normalizeRecord(raw);
      if(!normalized){
        await store.remove(storageKey);
        continue;
      }
      if(storageKey!==keyFor(normalized.event)){
        await store.remove(storageKey);
        continue;
      }
      output.push(normalized);
    }
    return output.sort(
      (left,right)=>
        String(left.stagedAt).localeCompare(String(right.stagedAt))||
        String(left.eventId).localeCompare(String(right.eventId))
    );
  }

  async function prune(){
    const cutoff=nowMs()-ageLimit;
    let expired=0;

    for(const record of await records()){
      const staged=safeTime(record.stagedAt);
      if(staged!==null&&staged<cutoff){
        await store.remove(keyFor(record.event));
        expired+=1;
      }
    }

    return Object.freeze({
      expired,
      remaining:(await records()).length,
    });
  }

  async function stage(event){
    telemetryEventIdempotencyKey(event);
    await prune();

    const storageKey=keyFor(event);
    const existing=normalizeRecord(await store.get(storageKey));

    if(existing){
      if(eventFingerprint(existing.event)!==eventFingerprint(event)){
        throw new Error('M26_TELEMETRY_EVENT_ID_COLLISION');
      }

      return Object.freeze({
        ok:true,
        staged:false,
        duplicate:true,
        status:existing.status,
        eventId:existing.eventId,
      });
    }

    const current=await records();
    if(current.length>=eventLimit){
      throw new Error('M26_TELEMETRY_OUTBOX_CAPACITY_EXCEEDED');
    }

    const timestamp=new Date(nowMs()).toISOString();
    const record={
      schemaVersion:RECORD_SCHEMA,
      ownerId:owner,
      clientId:event.clientId,
      sessionId:event.sessionId,
      executionId:event.executionId,
      eventId:event.eventId,
      idempotencyKey:telemetryEventIdempotencyKey(event),
      event:clone(event),
      status:STATUS_PENDING,
      stagedAt:timestamp,
      updatedAt:timestamp,
      attempts:0,
      nextRetryAt:null,
      lastErrorCode:null,
    };

    await store.set(storageKey,record);

    return Object.freeze({
      ok:true,
      staged:true,
      duplicate:false,
      status:STATUS_PENDING,
      eventId:event.eventId,
    });
  }

  async function get(clientId,eventId){
    const safeClient=safeId(clientId,'M26_TELEMETRY_CLIENT_ID_INVALID');
    const safeEvent=safeId(eventId,'M26_TELEMETRY_EVENT_ID_INVALID');
    const value=normalizeRecord(
      await store.get(`${prefix}${safeClient}:${safeEvent}`)
    );
    return value?clone(value):null;
  }

  async function pending({dueOnly=false}={}){
    const at=nowMs();
    return (await records())
      .filter((record)=>record.status===STATUS_PENDING)
      .filter((record)=>{
        if(!dueOnly)return true;
        const due=safeTime(record.nextRetryAt);
        return due===null||due<=at;
      })
      .map(clone);
  }

  async function batches({dueOnly=true}={}){
    const values=await pending({dueOnly});
    return buildTelemetryUploadBatches(
      values.map((record)=>record.event)
    );
  }

  async function applyBatchAck(batch,ack={}){
    if(!batch||!Array.isArray(batch.eventIds)){
      throw new Error('M26_TELEMETRY_BATCH_REQUIRED');
    }

    const clientId=safeId(
      batch.clientId,
      'M26_TELEMETRY_BATCH_CLIENT_REQUIRED'
    );
    const batchIds=new Set(
      batch.eventIds.map((value)=>
        safeId(value,'M26_TELEMETRY_BATCH_EVENT_ID_INVALID')
      )
    );

    const accepted=new Set(
      Array.isArray(ack.acceptedEventIds)?ack.acceptedEventIds:[]
    );
    const duplicate=new Set(
      Array.isArray(ack.duplicateEventIds)?ack.duplicateEventIds:[]
    );
    const rejected=new Set(
      Array.isArray(ack.rejectedEventIds)?ack.rejectedEventIds:[]
    );

    for(const value of [...accepted,...duplicate,...rejected]){
      if(!batchIds.has(String(value))){
        throw new Error('M26_TELEMETRY_ACK_OUTSIDE_BATCH');
      }
    }

    let removed=0;
    let terminal=0;
    const timestamp=new Date(nowMs()).toISOString();

    for(const eventId of batchIds){
      const record=await get(clientId,eventId);
      if(!record)continue;

      if(accepted.has(eventId)||duplicate.has(eventId)){
        await store.remove(`${prefix}${clientId}:${eventId}`);
        removed+=1;
        continue;
      }

      if(rejected.has(eventId)){
        record.status=STATUS_TERMINAL;
        record.updatedAt=timestamp;
        record.nextRetryAt=null;
        record.lastErrorCode=safeErrorCode(
          ack.rejectedReasons?.[eventId]||
          'M26_TELEMETRY_REMOTE_REJECTED'
        );
        await store.set(`${prefix}${clientId}:${eventId}`,record);
        terminal+=1;
      }
    }

    return Object.freeze({
      removed,
      terminal,
      remaining:(await records()).length,
    });
  }

  async function markBatchFailure(
    batch,
    {
      status=0,
      errorCode='M26_TELEMETRY_UPLOAD_FAILED',
    }={}
  ){
    if(!batch||!Array.isArray(batch.eventIds)){
      throw new Error('M26_TELEMETRY_BATCH_REQUIRED');
    }

    const clientId=safeId(
      batch.clientId,
      'M26_TELEMETRY_BATCH_CLIENT_REQUIRED'
    );
    const disposition=Number(status)>0
      ?telemetryRetryDisposition(status)
      :'retry';
    const timestampMs=nowMs();
    const timestamp=new Date(timestampMs).toISOString();
    let updated=0;

    for(const rawEventId of batch.eventIds){
      const eventId=safeId(
        rawEventId,
        'M26_TELEMETRY_BATCH_EVENT_ID_INVALID'
      );
      const record=await get(clientId,eventId);
      if(!record||record.status!==STATUS_PENDING)continue;

      const attempts=safeAttempts(record.attempts)+1;
      record.attempts=attempts;
      record.updatedAt=timestamp;
      record.lastErrorCode=safeErrorCode(errorCode);

      if(disposition==='terminal'){
        record.status=STATUS_TERMINAL;
        record.nextRetryAt=null;
      }else{
        record.nextRetryAt=new Date(
          timestampMs+retryDelayMs(attempts)
        ).toISOString();
      }

      await store.set(`${prefix}${clientId}:${eventId}`,record);
      updated+=1;
    }

    return Object.freeze({
      disposition,
      updated,
    });
  }

  async function summary(){
    const values=await records();
    const at=nowMs();
    let pendingCount=0;
    let terminalCount=0;
    let dueCount=0;

    for(const record of values){
      if(record.status===STATUS_TERMINAL){
        terminalCount+=1;
        continue;
      }
      pendingCount+=1;
      const due=safeTime(record.nextRetryAt);
      if(due===null||due<=at)dueCount+=1;
    }

    return Object.freeze({
      ownerId:owner,
      totalCount:values.length,
      pendingCount,
      terminalCount,
      dueCount,
      maxEvents:eventLimit,
      maxAgeMs:ageLimit,
      oldestStagedAt:values[0]?.stagedAt||null,
    });
  }

  async function clearOwner(){
    await store.clear(prefix);
  }

  return Object.freeze({
    ownerId:owner,
    stage,
    get,
    records,
    pending,
    batches,
    applyBatchAck,
    markBatchFailure,
    prune,
    summary,
    clearOwner,
  });
}

export const __telemetryOutboxInternals=Object.freeze({
  RECORD_SCHEMA,
  STATUS_PENDING,
  STATUS_TERMINAL,
  MAX_RETRY_DELAY_MS,
  retryDelayMs,
  safeErrorCode,
});