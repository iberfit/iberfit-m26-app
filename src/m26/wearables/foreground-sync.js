// Foreground-only reconciliation. This never requests health permissions,
// creates a server grant or bypasses a provider's production policy.
export const WEARABLE_FOREGROUND_MIN_INTERVAL_MS=5*60*1000;

export function assertWearableClientContinuity(expected,actual){
  const role=String(actual?.role||'').toLowerCase();
  const clientId=String(actual?.clientId||'').trim();
  const expectedOwner=String(expected?.ownerId||'').trim();
  const actualOwner=String(actual?.ownerId||'').trim();
  // Client IDs can be shared/delegated; never equate same client with same
  // signed-in user. Empty owner is rejected when the operation is owner-bound.
  if(role!=='client'||!clientId||clientId!==String(expected?.clientId||'').trim()
    ||(expectedOwner&&actualOwner!==expectedOwner)
    ||String(expected?.role||'').toLowerCase()!=='client'){
    throw new Error('M26_WEARABLE_ACCOUNT_CHANGED');
  }
  return true;
}

export function createWearableForegroundSync({
  run,
  canRun,
  now=()=>Date.now(),
  minIntervalMs=WEARABLE_FOREGROUND_MIN_INTERVAL_MS,
  retryIntervalMs=30_000,
}={}){
  if(typeof run!=='function'||typeof canRun!=='function'
    ||!Number.isFinite(minIntervalMs)||minIntervalMs<0
    ||!Number.isFinite(retryIntervalMs)||retryIntervalMs<0){
    throw new Error('M26_WEARABLE_FOREGROUND_CONFIG_INVALID');
  }

  let inflight=null;
  let lastStartedAt=null;
  let lastFailedAt=null;
  let generation=0;
  function trigger({force=false}={}){
    if(!canRun())return Promise.resolve(Object.freeze({skipped:'inactive'}));
    if(inflight)return inflight.promise;
    const timestamp=now();
    if(!Number.isFinite(timestamp))return Promise.reject(new Error('M26_WEARABLE_FOREGROUND_CLOCK_INVALID'));
    // A failed Health Connect read must not block a legitimate retry for the
    // full healthy-sync interval. Bound retries separately to avoid storms
    // when the OS bridge or connection is temporarily unavailable.
    const delay=lastFailedAt!==null
      ?Math.min(minIntervalMs,retryIntervalMs):minIntervalMs;
    if(!force&&lastStartedAt!==null&&timestamp-lastStartedAt>=0
      &&timestamp-lastStartedAt<delay){
      return Promise.resolve(Object.freeze({
        skipped:lastFailedAt!==null?'retry-backoff':'recently-checked',
      }));
    }
    lastStartedAt=timestamp;
    const version=generation;
    // One AbortController per session generation. A new Client may proceed
    // immediately after logout without waiting for a hung old OS/network read.
    const controller=new AbortController();
    const stale=()=>version!==generation||controller.signal.aborted;
    const runPromise=Promise.resolve().then(()=>{
      if(stale()||!canRun())return Object.freeze({skipped:'invalidated'});
      return run({signal:controller.signal});
    });
    const settled=runPromise.then(
      result=>{
        if(stale())return Object.freeze({skipped:'invalidated'});
        lastFailedAt=null;
        return result;
      },
      error=>{
        // An obsolete read must not show an error (or a result) to a new Client.
        if(stale())return Object.freeze({skipped:'invalidated'});
        lastFailedAt=timestamp;
        throw error;
      },
    ).finally(()=>{
      if(inflight?.promise===settled)inflight=null;
    });
    inflight={promise:settled,controller};
    return settled;
  }
  function invalidate(){
    generation+=1;
    lastStartedAt=null;
    lastFailedAt=null;
    // Do not permit stale reads to monopolize the next account's scheduler.
    const pending=inflight;
    inflight=null;
    pending?.controller.abort();
  }
  return Object.freeze({trigger,invalidate});
}

export function isCertifiedNativeAutoSyncSource(connection){
  const record=connection&&typeof connection==='object'?connection:{};
  const metadata=record.metadata&&typeof record.metadata==='object'?record.metadata:{};
  const status=String(record.status||record.state||'').toLowerCase();
  const enabled=record.syncEnabled===true||record.sync_enabled===true;
  return ['active','connected','conectado'].includes(status)
    &&metadata.mode==='certified_native'
    &&metadata.automatic===true
    &&enabled
    &&Array.isArray(record.scopes)
    &&record.scopes.length>0;
}

/**
 * A low-frequency tick only while the signed Android Client is foregrounded.
 * This never opens OS permission dialogs and never schedules background reads.
 */
export const WEARABLE_NATIVE_FOREGROUND_HEARTBEAT_MS=30*60*1000;
export function createNativeForegroundHeartbeat({
  onTick,canRun,onError=()=>{},
  setTimer=(fn,ms)=>globalThis.setInterval(fn,ms),
  clearTimer=handle=>globalThis.clearInterval(handle),
  intervalMs=WEARABLE_NATIVE_FOREGROUND_HEARTBEAT_MS,
}={}){
  if(typeof onTick!=='function'||typeof canRun!=='function'
    ||typeof onError!=='function'
    ||typeof setTimer!=='function'||typeof clearTimer!=='function'
    ||!Number.isInteger(intervalMs)||intervalMs<WEARABLE_NATIVE_FOREGROUND_HEARTBEAT_MS)
    throw new Error('M26_WEARABLE_HEARTBEAT_CONFIG_INVALID');
  let timer=null,executing=false,version=0;
  const safeError=error=>{try{onError(error);}catch{}};
  function tick(){
    if(executing||!canRun())return;
    const lease=version;
    executing=true;
    try{
      void Promise.resolve(onTick()).catch(error=>{
        if(version===lease)safeError(error);
      }).finally(()=>{
        if(version===lease)executing=false;
      });
    }catch(error){
      if(version===lease){executing=false;safeError(error);}
    }
  }
  function start(){
    if(timer!==null||!canRun())return false;
    version++;
    const handle=setTimer(tick,intervalMs);
    if(handle===null||handle===undefined)throw new Error('M26_WEARABLE_HEARTBEAT_TIMER_UNAVAILABLE');
    timer=handle;return true;
  }
  function stop(){
    if(timer===null)return false;
    const prior=timer;timer=null;version++;executing=false;
    clearTimer(prior);return true;
  }
  return Object.freeze({start,stop,get active(){return timer!==null;}});
}
