export const TELEMETRY_OUTBOX_SCHEMA_VERSION='iberfit.telemetry.outbox.v1';
export const TELEMETRY_REMOTE_SCHEMA_VERSION='iberfit.telemetry.remote.v1';

export const TELEMETRY_BATCH_MAX_EVENTS=100;
export const TELEMETRY_BATCH_MAX_BYTES=192_000;
export const TELEMETRY_OUTBOX_MAX_EVENTS=20_000;
export const TELEMETRY_OUTBOX_MAX_AGE_MS=7*24*60*60*1000;
export const TELEMETRY_RAW_RETENTION_DAYS=180;

const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function safeId(value){
  const text=String(value||'').trim();
  return SAFE_ID.test(text)?text:null;
}
function byteLength(value){
  let text;
  try{text=JSON.stringify(value);}
  catch{throw new Error('M26_TELEMETRY_NOT_SERIALIZABLE');}
  if(text===undefined)throw new Error('M26_TELEMETRY_NOT_SERIALIZABLE');
  return typeof TextEncoder==='function'
    ?new TextEncoder().encode(text).length
    :text.length;
}
function eventTime(event){
  const time=new Date(event?.receivedAt||event?.recordedAt||0).getTime();
  return Number.isFinite(time)?time:0;
}
function validEvent(event){
  return Boolean(
    event&&
    event.schemaVersion==='iberfit.telemetry.v1'&&
    safeId(event.eventId)&&
    safeId(event.clientId)&&
    safeId(event.sessionId)&&
    safeId(event.executionId)&&
    event.raw&&
    Number.isFinite(Number(event.raw.heartRateBpm))&&
    !('deviceId' in (event.source||{}))
  );
}
function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}

export function telemetryEventIdempotencyKey(event){
  if(!validEvent(event))throw new Error('M26_TELEMETRY_EVENT_INVALID');
  return `${TELEMETRY_REMOTE_SCHEMA_VERSION}:${event.clientId}:${event.eventId}`;
}

export function telemetryOutboxStorageKey(event){
  if(!validEvent(event))throw new Error('M26_TELEMETRY_EVENT_INVALID');
  return `m26:telemetry-outbox:v1:${event.clientId}:${event.executionId}:${event.eventId}`;
}

export function deduplicateTelemetryEvents(events=[]){
  const map=new Map();
  for(const event of Array.isArray(events)?events:[]){
    if(!validEvent(event))continue;
    const key=telemetryEventIdempotencyKey(event);
    if(!map.has(key))map.set(key,event);
  }
  return Object.freeze(
    [...map.values()].sort(
      (left,right)=>
        eventTime(left)-eventTime(right)||
        String(left.eventId).localeCompare(String(right.eventId))
    )
  );
}

function sameScope(left,right){
  return Boolean(
    left&&right&&
    left.clientId===right.clientId&&
    left.sessionId===right.sessionId&&
    left.executionId===right.executionId
  );
}

export function buildTelemetryUploadBatches(
  events=[],
  {
    maxEvents=TELEMETRY_BATCH_MAX_EVENTS,
    maxBytes=TELEMETRY_BATCH_MAX_BYTES,
  }={}
){
  const eventLimit=Math.max(1,Math.min(250,Math.trunc(Number(maxEvents)||TELEMETRY_BATCH_MAX_EVENTS)));
  const byteLimit=Math.max(16_000,Math.min(512_000,Math.trunc(Number(maxBytes)||TELEMETRY_BATCH_MAX_BYTES)));
  const ordered=deduplicateTelemetryEvents(events);
  const batches=[];
  let current=[];

  function flush(){
    if(!current.length)return;
    const first=current[0];
    const payload={
      schemaVersion:TELEMETRY_REMOTE_SCHEMA_VERSION,
      clientId:first.clientId,
      sessionId:first.sessionId,
      executionId:first.executionId,
      events:[...current],
    };
    batches.push(
      deepFreeze({
        clientId:first.clientId,
        sessionId:first.sessionId,
        executionId:first.executionId,
        eventCount:current.length,
        byteLength:byteLength(payload),
        eventIds:current.map((event)=>event.eventId),
        idempotencyKeys:current.map(telemetryEventIdempotencyKey),
        payload,
      })
    );
    current=[];
  }

  for(const event of ordered){
    if(current.length&&!sameScope(current[0],event)){
      flush();
    }

    const candidate=[...current,event];
    const payload={
      schemaVersion:TELEMETRY_REMOTE_SCHEMA_VERSION,
      clientId:event.clientId,
      sessionId:event.sessionId,
      executionId:event.executionId,
      events:candidate,
    };
    const candidateBytes=byteLength(payload);

    if(candidateBytes>byteLimit){
      if(!current.length){
        throw new Error('M26_TELEMETRY_EVENT_TOO_LARGE');
      }
      flush();
    }

    current.push(event);

    const actualPayload={
      schemaVersion:TELEMETRY_REMOTE_SCHEMA_VERSION,
      clientId:event.clientId,
      sessionId:event.sessionId,
      executionId:event.executionId,
      events:[...current],
    };

    if(
      current.length>=eventLimit||
      byteLength(actualPayload)>=byteLimit
    ){
      flush();
    }
  }

  flush();
  return Object.freeze(batches);
}

export function telemetryRetryDisposition(status){
  const code=Number(status);
  if([400,401,403,404,409,413,422].includes(code))return 'terminal';
  if(code===408||code===425||code===429||code>=500)return 'retry';
  return 'retry';
}

export function telemetryPersistencePolicy(){
  return deepFreeze({
    outbox:{
      ownerScoped:true,
      schemaVersion:TELEMETRY_OUTBOX_SCHEMA_VERSION,
      maxEvents:TELEMETRY_OUTBOX_MAX_EVENTS,
      maxAgeMs:TELEMETRY_OUTBOX_MAX_AGE_MS,
      removeOnlyAfter:['accepted','duplicate'],
      terminalStatuses:[400,401,403,404,409,413,422],
      retryStatuses:[408,425,429,'5xx'],
    },
    remote:{
      schemaVersion:TELEMETRY_REMOTE_SCHEMA_VERSION,
      entity:'telemetry_events',
      uniqueKey:['clientId','eventId'],
      immutableRaw:true,
      rawRetentionDays:TELEMETRY_RAW_RETENTION_DAYS,
      derivedSeparately:true,
      deviceIdStored:false,
    },
    authorization:{
      rawWrite:['client_own','assigned_coach'],
      rawRead:['client_own','assigned_coach'],
      adminRawRead:false,
      adminOperationalMetadata:true,
      roleClaimIsNotAuthorizationSource:true,
    },
    ack:{
      acceptedEventIds:true,
      duplicateEventIds:true,
      rejectedEventIds:true,
      wholeBatchSuccessRequired:false,
    },
  });
}

export const __telemetryPersistenceInternals=Object.freeze({
  byteLength,
  eventTime,
  validEvent,
  sameScope,
});