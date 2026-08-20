import {
  TELEMETRY_REMOTE_SCHEMA_VERSION,
} from './persistence-contract.js';

const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MIN_RETRY_TIMER_MS=250;
const MAX_RETRY_TIMER_MS=5*60*1000;
const DEFAULT_MAX_BATCHES_PER_FLUSH=200;

function safeId(value,code){
  const text=String(value||'').trim();
  if(!SAFE_ID.test(text))throw new Error(code);
  return text;
}
function safeStatus(error){
  const status=Number(error?.status||0);
  return Number.isInteger(status)&&status>=100&&status<=599?status:0;
}
function safeErrorCode(error){
  const raw=String(error?.message||error||'');
  const match=raw.match(/\bM26_[A-Z0-9_:-]{2,160}\b/iu);
  if(match)return match[0].toUpperCase();
  const status=safeStatus(error);
  return status
    ?`M26_TELEMETRY_HTTP_${status}`
    :'M26_TELEMETRY_REMOTE_UPLOAD_FAILED';
}
function normalizedAckIds(value,code){
  if(!Array.isArray(value))throw new Error(code);
  const output=[];
  const seen=new Set();
  for(const raw of value){
    if(typeof raw!=='string')throw new Error(code);
    const id=safeId(raw,code);
    if(seen.has(id))throw new Error('M26_TELEMETRY_ACK_DUPLICATE_CLASSIFICATION');
    seen.add(id);
    output.push(id);
  }
  return output;
}
function sameClientId(left,right){
  return String(left||'').trim().toLowerCase()===
    String(right||'').trim().toLowerCase();
}

export function validateTelemetryBatchAck(batch,rawAck){
  if(!batch||!Array.isArray(batch.eventIds)||!batch.payload){
    throw new Error('M26_TELEMETRY_BATCH_REQUIRED');
  }
  const ack=Array.isArray(rawAck)?rawAck[0]:rawAck;
  if(!ack||typeof ack!=='object'||Array.isArray(ack)||ack.ok!==true){
    throw new Error('M26_TELEMETRY_ACK_INVALID');
  }
  if(ack.schemaVersion!==TELEMETRY_REMOTE_SCHEMA_VERSION){
    throw new Error('M26_TELEMETRY_ACK_SCHEMA_MISMATCH');
  }
  if(
    !sameClientId(ack.clientId,batch.clientId)||
    String(ack.sessionId||'')!==String(batch.sessionId||'')||
    String(ack.executionId||'')!==String(batch.executionId||'')
  ){
    throw new Error('M26_TELEMETRY_ACK_SCOPE_MISMATCH');
  }

  const accepted=normalizedAckIds(
    ack.acceptedEventIds,
    'M26_TELEMETRY_ACK_ACCEPTED_INVALID'
  );
  const duplicate=normalizedAckIds(
    ack.duplicateEventIds,
    'M26_TELEMETRY_ACK_DUPLICATE_INVALID'
  );
  const rejected=normalizedAckIds(
    ack.rejectedEventIds,
    'M26_TELEMETRY_ACK_REJECTED_INVALID'
  );

  const expected=new Set(
    batch.eventIds.map((value)=>
      safeId(value,'M26_TELEMETRY_BATCH_EVENT_ID_INVALID')
    )
  );
  const classified=new Set();

  for(const id of [...accepted,...duplicate,...rejected]){
    if(!expected.has(id)){
      throw new Error('M26_TELEMETRY_ACK_OUTSIDE_BATCH');
    }
    if(classified.has(id)){
      throw new Error('M26_TELEMETRY_ACK_DUPLICATE_CLASSIFICATION');
    }
    classified.add(id);
  }

  if(classified.size!==expected.size){
    throw new Error('M26_TELEMETRY_ACK_INCOMPLETE');
  }
  for(const id of expected){
    if(!classified.has(id)){
      throw new Error('M26_TELEMETRY_ACK_INCOMPLETE');
    }
  }

  const rawReasons=
    ack.rejectedReasons&&
    typeof ack.rejectedReasons==='object'&&
    !Array.isArray(ack.rejectedReasons)
      ?ack.rejectedReasons
      :{};
  const rejectedReasons={};

  for(const id of rejected){
    rejectedReasons[id]=String(
      rawReasons[id]||'M26_TELEMETRY_REMOTE_REJECTED'
    )
      .replace(/[\u0000-\u001f\u007f]/g,' ')
      .trim()
      .slice(0,160)||
      'M26_TELEMETRY_REMOTE_REJECTED';
  }

  return Object.freeze({
    ok:true,
    schemaVersion:TELEMETRY_REMOTE_SCHEMA_VERSION,
    clientId:batch.clientId,
    sessionId:batch.sessionId,
    executionId:batch.executionId,
    acceptedEventIds:Object.freeze(accepted),
    duplicateEventIds:Object.freeze(duplicate),
    rejectedEventIds:Object.freeze(rejected),
    rejectedReasons:Object.freeze(rejectedReasons),
  });
}

export function createTelemetryRemoteSync({
  transport,
  outbox,
  getToken,
  isOnline=()=>globalThis.navigator?.onLine!==false,
  now=()=>Date.now(),
  setTimer=(fn,delay)=>setTimeout(fn,delay),
  clearTimer=(handle)=>clearTimeout(handle),
  onDiagnostic=()=>{},
  maxBatchesPerFlush=DEFAULT_MAX_BATCHES_PER_FLUSH,
}={}){
  if(typeof transport?.importTelemetryBatch!=='function'){
    throw new Error('M26_TELEMETRY_REMOTE_TRANSPORT_REQUIRED');
  }
  if(
    !outbox||
    typeof outbox.batches!=='function'||
    typeof outbox.pending!=='function'||
    typeof outbox.applyBatchAck!=='function'||
    typeof outbox.markBatchFailure!=='function'||
    typeof outbox.prune!=='function'||
    typeof outbox.summary!=='function'
  ){
    throw new Error('M26_TELEMETRY_REMOTE_OUTBOX_REQUIRED');
  }
  if(typeof getToken!=='function'){
    throw new Error('M26_TELEMETRY_REMOTE_TOKEN_PROVIDER_REQUIRED');
  }
  if(
    typeof isOnline!=='function'||
    typeof now!=='function'||
    typeof setTimer!=='function'||
    typeof clearTimer!=='function'
  ){
    throw new Error('M26_TELEMETRY_REMOTE_RUNTIME_INVALID');
  }

  const batchLimit=Math.max(
    1,
    Math.min(
      DEFAULT_MAX_BATCHES_PER_FLUSH,
      Math.trunc(Number(maxBatchesPerFlush)||DEFAULT_MAX_BATCHES_PER_FLUSH)
    )
  );

  let inFlight=null;
  let retryTimer=null;
  let started=false;
  let eventTarget=null;

  function diagnostic(code,error){
    try{onDiagnostic(code,error);}catch{}
  }
  function clock(){
    const value=Number(now());
    if(!Number.isFinite(value)){
      throw new Error('M26_TELEMETRY_REMOTE_CLOCK_INVALID');
    }
    return value;
  }
  function clearRetryTimer(){
    if(retryTimer!==null){
      try{clearTimer(retryTimer);}catch{}
      retryTimer=null;
    }
  }
  function armRetry(delay){
    clearRetryTimer();
    if(!isOnline())return;
    const safeDelay=Math.max(
      MIN_RETRY_TIMER_MS,
      Math.min(MAX_RETRY_TIMER_MS,Math.trunc(Number(delay)||MIN_RETRY_TIMER_MS))
    );
    retryTimer=setTimer(()=>{
      retryTimer=null;
      void flush().catch((error)=>{
        diagnostic('M26_TELEMETRY_REMOTE_RETRY_FAILED',error);
      });
    },safeDelay);
  }
  async function scheduleNextDue(){
    clearRetryTimer();
    if(!isOnline())return null;

    const records=await outbox.pending({dueOnly:false});
    if(!records.length)return null;

    const at=clock();
    let earliest=null;

    for(const record of records){
      const due=record?.nextRetryAt
        ?new Date(record.nextRetryAt).getTime()
        :at;
      if(!Number.isFinite(due))continue;
      if(earliest===null||due<earliest)earliest=due;
    }

    if(earliest===null)return null;
    const delay=Math.max(MIN_RETRY_TIMER_MS,earliest-at);
    armRetry(delay);
    return delay;
  }

  async function performFlush(){
    await outbox.prune();

    if(!isOnline()){
      clearRetryTimer();
      return Object.freeze({
        ok:true,
        online:false,
        attemptedBatches:0,
        accepted:0,
        duplicate:0,
        rejected:0,
        pending:(await outbox.summary()).pendingCount,
      });
    }

    const dueBatches=await outbox.batches({dueOnly:true});

    if(!dueBatches.length){
      const summary=await outbox.summary();
      await scheduleNextDue();
      return Object.freeze({
        ok:true,
        online:true,
        attemptedBatches:0,
        accepted:0,
        duplicate:0,
        rejected:0,
        pending:summary.pendingCount,
      });
    }

    let token;
    try{
      token=await getToken();
      if(!token)throw new Error('M26_AUTH_REQUIRED');
    }catch(error){
      diagnostic('M26_TELEMETRY_REMOTE_AUTH_FAILED',error);
      armRetry(5000);
      throw error;
    }

    let attemptedBatches=0;
    let accepted=0;
    let duplicate=0;
    let rejected=0;

    for(const batch of dueBatches.slice(0,batchLimit)){
      attemptedBatches+=1;
      try{
        const rawAck=await transport.importTelemetryBatch(
          token,
          batch.payload
        );
        const ack=validateTelemetryBatchAck(batch,rawAck);
        await outbox.applyBatchAck(batch,ack);
        accepted+=ack.acceptedEventIds.length;
        duplicate+=ack.duplicateEventIds.length;
        rejected+=ack.rejectedEventIds.length;
      }catch(error){
        const status=safeStatus(error);
        const errorCode=safeErrorCode(error);
        const failure=await outbox.markBatchFailure(
          batch,
          {status,errorCode}
        );
        diagnostic('M26_TELEMETRY_REMOTE_BATCH_FAILED',error);
        const summary=await outbox.summary();
        await scheduleNextDue();
        return Object.freeze({
          ok:false,
          online:true,
          attemptedBatches,
          accepted,
          duplicate,
          rejected,
          pending:summary.pendingCount,
          terminal:summary.terminalCount,
          disposition:failure.disposition,
          errorCode,
          status,
        });
      }
    }

    const summary=await outbox.summary();
    await scheduleNextDue();
    return Object.freeze({
      ok:true,
      online:true,
      attemptedBatches,
      accepted,
      duplicate,
      rejected,
      pending:summary.pendingCount,
      terminal:summary.terminalCount,
    });
  }

  function flush(){
    if(inFlight)return inFlight;
    inFlight=performFlush().finally(()=>{
      inFlight=null;
    });
    return inFlight;
  }

  function notifyStaged(){
    if(!isOnline()){
      return Promise.resolve(
        Object.freeze({ok:true,online:false,queued:true})
      );
    }
    return flush();
  }

  function onOnline(){
    void flush().catch((error)=>{
      diagnostic('M26_TELEMETRY_REMOTE_ONLINE_FLUSH_FAILED',error);
    });
  }
  function onOffline(){
    clearRetryTimer();
  }

  function stop(){
    clearRetryTimer();
    if(eventTarget){
      eventTarget.removeEventListener?.('online',onOnline);
      eventTarget.removeEventListener?.('offline',onOffline);
    }
    eventTarget=null;
    started=false;
  }

  function start({target=globalThis,flushInitial=true}={}){
    if(started)return stop;
    if(
      typeof target?.addEventListener!=='function'||
      typeof target?.removeEventListener!=='function'
    ){
      throw new Error('M26_TELEMETRY_REMOTE_EVENT_TARGET_REQUIRED');
    }
    eventTarget=target;
    eventTarget.addEventListener('online',onOnline);
    eventTarget.addEventListener('offline',onOffline);
    started=true;
    if(flushInitial){
      void flush().catch((error)=>{
        diagnostic('M26_TELEMETRY_REMOTE_INITIAL_FLUSH_FAILED',error);
      });
    }
    return stop;
  }

  return Object.freeze({
    flush,
    notifyStaged,
    start,
    stop,
    summary:()=>outbox.summary(),
  });
}

export const __telemetryRemoteSyncInternals=Object.freeze({
  MIN_RETRY_TIMER_MS,
  MAX_RETRY_TIMER_MS,
  DEFAULT_MAX_BATCHES_PER_FLUSH,
  safeErrorCode,
  validateTelemetryBatchAck,
});
