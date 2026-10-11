/**
 * Isolated Apple HealthKit iPhone DEBUG QA transport. Only Canary's exact
 * HTTPS origin may ask the signed native host for a ONE-SHOT LOCAL reading.
 * No server write, auto-resume, production use, or watch identity assertion.
 * The authenticated access token stays in the web runtime; native receives
 * only a random correlation ID and a seven-day bounded action.
 */
const ORIGIN='https://m26-canary.iberfit.cl';
const HANDLER='iberfitConnected360AppleQa';
const EVENT='iberfit:connected360-apple-qa';
const REQUEST='iberfit.connected360.apple.qa.request.v1';
const RESPONSE='iberfit.connected360.apple.qa.read.v1';
const ERROR='iberfit.connected360.apple.qa.error.v1';
const METRICS=Object.freeze(['steps','sleepMinutes','restingHeartRate']);
const ID=/^[A-Za-z0-9_-]{8,72}$/u;
const DAY=/^\d{4}-\d{2}-\d{2}$/u;
const ZONE=/^[A-Za-z0-9_.:+-]+(?:\/[A-Za-z0-9_.:+-]+)*$/u;

export function isAppleHealthQaNativeAvailable(scope=globalThis){
  return scope?.location?.origin===ORIGIN &&
    typeof scope?.webkit?.messageHandlers?.[HANDLER]?.postMessage==='function' &&
    typeof scope?.addEventListener==='function';
}

function normalize(records,{at=Date.now()}={}){
  if(!Array.isArray(records)||records.length>7)
    throw Error('M26_APPLE_QA_RESPONSE_INVALID');
  const seen=new Set();
  return Object.freeze(records.map(row=>{
    if(!row||row.provider!=='apple_health'||!DAY.test(row.date||'')||
       Number.isNaN(Date.parse(row.date+'T12:00:00Z'))||
       new Date(row.date+'T12:00:00Z').toISOString().slice(0,10)!==row.date||
       seen.has(row.date)||
       typeof row.acquiredAt!=='string'||
       !Number.isFinite(Date.parse(row.acquiredAt))||
       Date.parse(row.acquiredAt)<at-20*60_000||
       Date.parse(row.acquiredAt)>at+5*60_000||
       typeof row.aggregationTimeZone!=='string'||
       row.aggregationTimeZone.length<1||row.aggregationTimeZone.length>80||
       !ZONE.test(row.aggregationTimeZone)||
       row.sourceTimestampVerified!==false||
       row.automaticSyncCertified!==false)
      throw Error('M26_APPLE_QA_RESPONSE_INVALID');
    seen.add(row.date);
    const values={};
    for(const [metric,min,max] of [['steps',0,200000],['sleepMinutes',0,1440],['restingHeartRate',25,240]]){
      const value=row[metric];
      if(value===undefined||value===null)continue;
      if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)
        throw Error('M26_APPLE_QA_RESPONSE_INVALID');
      values[metric]=value;
    }
    const failures={};
    for(const [key,field] of [['steps','stepsReadFailed'],
      ['sleepMinutes','sleepReadFailed'],
      ['restingHeartRate','restingHeartRateReadFailed']]){
      if(typeof row[field]!=='boolean')
        throw Error('M26_APPLE_QA_RESPONSE_INVALID');
      failures[key]=row[field];
    }
    return Object.freeze({
      provider:'apple_health',
      date:row.date,
      metrics:Object.freeze(values),
      failedMetrics:Object.freeze(failures),
      acquiredAt:new Date(row.acquiredAt).toISOString(),
      aggregationTimeZone:row.aggregationTimeZone,
      sourceTimestampVerified:false,
      automaticSyncCertified:false,
    });
  }));
}

export function createAppleHealthQaNativeChannel({
  scope=globalThis,
  getIdentity,
  getToken,
  timeoutMs=30_000,
  now=()=>Date.now(),
}={}){
  if(typeof getIdentity!=='function'||typeof getToken!=='function')
    throw Error('M26_APPLE_QA_AUTH_REQUIRED');
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30_000)
    throw Error('M26_APPLE_QA_TIMEOUT_INVALID');
  let disposed=false, running=false, rejectPending=null;
  const sender=scope?.webkit?.messageHandlers?.[HANDLER];
  function identity(){
    if(disposed)throw Error('M26_APPLE_QA_DISPOSED');
    if(!isAppleHealthQaNativeAvailable(scope)||sender!==scope.webkit.messageHandlers[HANDLER])
      throw Error('M26_APPLE_QA_BRIDGE_UNAVAILABLE');
    const item=getIdentity();
    const ownerId=String(item?.ownerId||'').trim();
    const clientId=String(item?.clientId||'').trim();
    if(String(item?.role||'').toLowerCase()!=='client'||!ownerId||!clientId)
      throw Error('M26_APPLE_QA_CLIENT_REQUIRED');
    return Object.freeze({ownerId,clientId});
  }
  function same(expected){
    const current=identity();
    if(current.ownerId!==expected.ownerId||current.clientId!==expected.clientId)
      throw Error('M26_APPLE_QA_SESSION_CHANGED');
  }
  async function readLocal({days=7}={}){
    if(disposed)throw Error('M26_APPLE_QA_DISPOSED');
    if(running)throw Error('M26_APPLE_QA_BUSY');
    if(!Number.isInteger(days)||days<1||days>7)
      throw Error('M26_APPLE_QA_REQUEST_INVALID');
    const owner=identity();
    const token=await getToken(); // NEVER forwarded to the native host.
    same(owner);
    if(typeof token!=='string'||token.length<10)
      throw Error('M26_APPLE_QA_SESSION_REQUIRED');
    if(running)throw Error('M26_APPLE_QA_BUSY');
    running=true;
    try{
      const requestId=scope?.crypto?.randomUUID?.();
      if(!ID.test(String(requestId||'')))
        throw Error('M26_APPLE_QA_RANDOM_REQUIRED');
      const response=await new Promise((resolve,reject)=>{
        let finished=false, timeout;
        function cleanup(){
          rejectPending=null;
          scope.removeEventListener?.(EVENT,onResponse);
          scope.clearTimeout?.(timeout);
        }
        function finish(error,result){
          if(finished)return;
          finished=true;cleanup();
          if(error)reject(error);else resolve(result);
        }
        function onResponse(event){
          const received=event?.detail;
          const parsed=typeof received==='string'?
            (()=>{try{return JSON.parse(received)}catch{return null}})():received;
          if(!parsed||parsed.requestId!==requestId)return;
          if(parsed.schema===ERROR){
            const code=String(parsed.error||'');
            finish(Error(/^M26_[A-Z0-9_]{4,72}$/u.test(code)?code:'M26_APPLE_QA_NATIVE_FAILED'));
            return;
          }
          if(parsed.schema!==RESPONSE||parsed.provider!=='apple_health'||
             parsed.persisted!==false||parsed.linked!==false||
             parsed.readPermissionStatus!=='not_disclosed'){
            finish(Error('M26_APPLE_QA_RESPONSE_INVALID'));
            return;
          }
          try{
            finish(null,normalize(parsed.records,{at:now()}));
          }catch(error){finish(error);}
        }
        rejectPending=()=>finish(Error('M26_APPLE_QA_DISPOSED'));
        timeout=scope.setTimeout?.(()=>finish(Error('M26_APPLE_QA_TIMEOUT')),timeoutMs);
        if(timeout===undefined){
          finish(Error('M26_APPLE_QA_TIMER_REQUIRED'));
          return;
        }
        scope.addEventListener(EVENT,onResponse);
        try{
          // Never include ownerId, clientId, access token, grant or user email.
          sender.postMessage({schema:REQUEST,requestId,action:'health.readDaily',days});
        }catch{finish(Error('M26_APPLE_QA_NATIVE_UNAVAILABLE'));}
      });
      same(owner);
      if(disposed)throw Error('M26_APPLE_QA_DISPOSED');
      return Object.freeze({
        provider:'apple_health',rows:response,
        requestedMetrics:METRICS,readPermissionStatus:'not_disclosed',
        persisted:false,linked:false,userConfirmedLocalRead:true,
      });
    }finally{running=false;}
  }
  return Object.freeze({
    readLocal,
    available:()=>!disposed&&isAppleHealthQaNativeAvailable(scope),
    destroy:()=>{
      if(disposed)return;
      disposed=true;
      rejectPending?.();
      rejectPending=null;
      // Logout or account replacement MUST also retire the one-shot native
      // approval, not only the web promise. No token or identity crosses.
      try{
        if(isAppleHealthQaNativeAvailable(scope)){
          const requestId=scope.crypto?.randomUUID?.();
          if(ID.test(String(requestId||'')))sender.postMessage({
            schema:REQUEST,requestId,action:'health.invalidate',
          });
        }
      }catch{}
    },
  });
}
