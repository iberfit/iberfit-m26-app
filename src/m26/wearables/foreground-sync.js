// Foreground-only reconciliation. This never requests health permissions,
// creates a server grant or bypasses a provider's production policy.
export const WEARABLE_FOREGROUND_MIN_INTERVAL_MS=5*60*1000;

export function assertWearableClientContinuity(expected,actual){
  const role=String(actual?.role||'').toLowerCase();
  const clientId=String(actual?.clientId||'').trim();
  if(role!=='client'||!clientId||clientId!==String(expected?.clientId||'').trim()
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
}={}){
  if(typeof run!=='function'||typeof canRun!=='function'
    ||!Number.isFinite(minIntervalMs)||minIntervalMs<0){
    throw new Error('M26_WEARABLE_FOREGROUND_CONFIG_INVALID');
  }

  let inflight=null;
  let lastStartedAt=null;
  let generation=0;
  function trigger({force=false}={}){
    if(!canRun())return Promise.resolve(Object.freeze({skipped:'inactive'}));
    if(inflight)return inflight.promise;
    const timestamp=now();
    if(!Number.isFinite(timestamp))return Promise.reject(new Error('M26_WEARABLE_FOREGROUND_CLOCK_INVALID'));
    if(!force&&lastStartedAt!==null&&timestamp-lastStartedAt>=0
      &&timestamp-lastStartedAt<minIntervalMs){
      return Promise.resolve(Object.freeze({skipped:'recently-checked'}));
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
      result=>stale()?Object.freeze({skipped:'invalidated'}):result,
      error=>{
        // An obsolete read must not show an error (or a result) to a new Client.
        if(stale())return Object.freeze({skipped:'invalidated'});
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
