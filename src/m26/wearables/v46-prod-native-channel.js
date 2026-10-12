// Production channel: native Health Connect read-only IPC with strict website pinning.

// Release Android only: Health Connect read locally, authenticated web backend controls persistence.
const CHANNEL='IBERFIT_CONNECTED360_NATIVE';
const PROD_ORIGIN='https://app.iberfit.cl';
export const isConnected360ProdNativeAvailable=(scope=globalThis)=>
  scope?.location?.origin===PROD_ORIGIN &&
  typeof scope?.[CHANNEL]?.postMessage==='function' &&
  typeof scope?.[CHANNEL]?.addEventListener==='function';
const REQUEST_SCHEMA='iberfit.connected360.native.request.v1';
const RESPONSE_SCHEMA='iberfit.connected360.native.v46.local.v1';
const ERROR_SCHEMA='iberfit.connected360.native.error.v1';
const DATA_SCHEMA='iberfit.connected360.v46.ingest.v1';
const METRICS=new Set(['generalHeartRate','exerciseSessions']);
const SPORTS=new Set(['running','interval_running','hiit','cycling','walking','strength','other']);
const HASH=/^[0-9a-f]{64}$/u;
const DAY=/^\d{4}-\d{2}-\d{2}$/u;
const MAX_RESPONSE=32000;
const MAX_AGE=20*60*1000;
const TTL=30_000;
const fail=()=>{throw new Error('M26_V46_PROD_RESPONSE_INVALID');};
const keys=(o,allowed)=>Object.keys(o).every(x=>allowed.includes(x));
const finite=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT/u.test(x)&&Number.isFinite(Date.parse(x));
const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
const zone=x=>typeof x==='string'&&x.length>0&&x.length<=80&&
  /^[A-Za-z0-9_.+-]+(?:\/[A-Za-z0-9_.+-]+)*$/u.test(x);

function checkPulse(row,enabled,{samples='heartRateSamples',avg='avgBpm',min='minBpm',max='maxBpm'}={}){
  const fields=[samples,avg,min,max];
  if(!enabled&&fields.some(field=>Object.hasOwn(row,field)))fail();
  if(!Object.hasOwn(row,samples)&&[avg,min,max].some(field=>Object.hasOwn(row,field)))fail();
  if(Object.hasOwn(row,samples)&&!integer(row[samples],0,200000))fail();
  for(const f of [avg,min,max])if(Object.hasOwn(row,f)&&!finite(row[f],25,240))fail();
  if((row[min]===undefined)!==(row[max]===undefined))fail();
  if(row[min]!==undefined&&row[min]>row[max])fail();
  if(row[avg]!==undefined&&row[min]!==undefined
    &&(row[avg]<row[min]||row[avg]>row[max]))fail();
}
function cleanEnvelope(raw,granted,at){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!keys(raw,['schema','heartRateDaily','exerciseEvidence'])
    ||raw.schema!==DATA_SCHEMA||!Array.isArray(raw.heartRateDaily)||!Array.isArray(raw.exerciseEvidence)
    ||raw.heartRateDaily.length>7||raw.exerciseEvidence.length>10)fail();
  if(!granted.includes('generalHeartRate')&&raw.heartRateDaily.length)fail();
  if(!granted.includes('exerciseSessions')&&raw.exerciseEvidence.length)fail();
  const dates=new Set(),observations=new Set();
  const hr=raw.heartRateDaily.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||
       !keys(row,['date','aggregationTimeZone','windowStartedAt','windowEndedAt','acquiredAt','sampleCount','minBpm','maxBpm'])
       ||typeof row.date!=='string'||!DAY.test(row.date)||dates.has(row.date)||
       !zone(row.aggregationTimeZone)||!iso(row.windowStartedAt)||!iso(row.windowEndedAt)
       ||!iso(row.acquiredAt)||!integer(row.sampleCount,1,200000))fail();
    const start=Date.parse(row.windowStartedAt),end=Date.parse(row.windowEndedAt);
    if(start>=end||end-start>25*3600_000||end>at+5*60_000||
       Math.abs(Date.parse(row.acquiredAt)-at)>MAX_AGE)fail();
    if(Object.hasOwn(row,'minBpm')!==Object.hasOwn(row,'maxBpm'))fail();
    if(row.minBpm!==undefined&&(!finite(row.minBpm,25,240)
      ||!finite(row.maxBpm,25,240)||row.minBpm>row.maxBpm))fail();
    dates.add(row.date);return Object.freeze({...row});
  });
  const workouts=raw.exerciseEvidence.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||!keys(row,[
      'observationKey','sport','startedAt','endedAt','acquiredAt',
      'heartRateSamples','avgBpm','minBpm','maxBpm','distanceMeters','steps','caloriesKcal'
    ])||!HASH.test(String(row.observationKey||''))||observations.has(row.observationKey)
      ||!SPORTS.has(row.sport)||!iso(row.startedAt)||!iso(row.endedAt)||!iso(row.acquiredAt))fail();
    const start=Date.parse(row.startedAt),end=Date.parse(row.endedAt);
    if(start>=end||end-start>24*3600_000||end>at+5*60_000||
      Math.abs(Date.parse(row.acquiredAt)-at)>MAX_AGE)fail();
    checkPulse(row,granted.includes('generalHeartRate'));
    if(Object.hasOwn(row,'distanceMeters')&&!finite(row.distanceMeters,0,500000))fail();
    if(Object.hasOwn(row,'steps')&&!integer(row.steps,0,200000))fail();
    if(Object.hasOwn(row,'caloriesKcal')&&!finite(row.caloriesKcal,0,20000))fail();
    observations.add(row.observationKey);return Object.freeze({...row});
  });
  return Object.freeze({
    schema:DATA_SCHEMA,
    heartRateDaily:Object.freeze(hr),
    exerciseEvidence:Object.freeze(workouts),
  });
}

/**
 * A one-shot QA preview has no remote consent and cannot upload anything.
 * Token stays exclusively in the web origin. Changes of account/logout
 * always invalidate the asynchronous result.
 */
export function createConnected360V46ProdNativeChannel({
  scope=globalThis,getIdentity,getToken,now=()=>Date.now(),timeoutMs=TTL,
}={}){
  if(typeof getIdentity!=='function'||typeof getToken!=='function'||
     !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>TTL)
    throw new Error('M26_V46_PROD_CHANNEL_CONFIG_INVALID');
  const channel=scope?.[CHANNEL];
  let disposed=false,reading=false,rejectPending=null;
  async function identity(){
    if(disposed||!isConnected360ProdNativeAvailable(scope)||channel!==scope?.[CHANNEL])
      throw new Error('M26_V46_PROD_CHANNEL_UNAVAILABLE');
    const initial=getIdentity();
    const ownerId=String(initial?.ownerId||'');
    const clientId=String(initial?.clientId||'');
    if(initial?.role!=='client'||!ownerId||!clientId)
      throw new Error('M26_V46_PROD_CLIENT_REQUIRED');
    const token=await getToken();
    if(typeof token!=='string'||token.length<10)
      throw new Error('M26_V46_PROD_SESSION_REQUIRED');
    const latest=getIdentity();
    if(disposed||latest?.role!=='client'||String(latest.ownerId)!==ownerId
      ||String(latest.clientId)!==clientId)
      throw new Error('M26_V46_PROD_SESSION_CHANGED');
    return Object.freeze({ownerId,clientId});
  }
  async function readLocal({metrics=['generalHeartRate','exerciseSessions']}={}){
    if(reading)throw new Error('M26_V46_PROD_BUSY');
    const requested=Array.isArray(metrics)?[...new Set(metrics)]:[];
    if(!requested.length||requested.length>2||requested.some(x=>!METRICS.has(x)))
      throw new Error('M26_V46_PROD_METRICS_INVALID');
    const owner=await identity();
    if(reading)throw new Error('M26_V46_PROD_BUSY');
    reading=true;
    try{
      const requestId=scope?.crypto?.randomUUID?.();
      if(typeof requestId!=='string'||!(/^[a-zA-Z0-9_-]{8,72}$/u.test(requestId)))
        throw new Error('M26_V46_PROD_RANDOM_REQUIRED');
      const response=await new Promise((resolve,reject)=>{
        let finished=false;
        let handle=null;
        const cleanup=()=>{
          channel.removeEventListener?.('message',onMessage);
          if(handle!==null)scope.clearTimeout?.(handle);
          rejectPending=null;
        };
        const finish=(error,answer)=>{
          if(finished)return;
          finished=true;cleanup();
          if(error)reject(error);else resolve(answer);
        };
        const onMessage=event=>{
          if(typeof event?.data!=='string'||event.data.length>MAX_RESPONSE)return;
          let value;
          try{value=JSON.parse(event.data);}catch{return;}
          if(value?.requestId!==requestId)return;
          if(value.schema===ERROR_SCHEMA){
            const code=String(value.error||'');
            finish(new Error(/^M26_[A-Z0-9_]{4,72}$/u.test(code)?code:'M26_V46_PROD_NATIVE_ERROR'));
            return;
          }
          if(value.schema!==RESPONSE_SCHEMA||value.provider!=='health_connect'
            ||value.persisted!==false||value.automatic!==false
            ||!Array.isArray(value.grantedMetrics)||!value.grantedMetrics.length
            ||new Set(value.grantedMetrics).size!==value.grantedMetrics.length
            ||value.grantedMetrics.some(x=>!requested.includes(x))){
            finish(new Error('M26_V46_PROD_RESPONSE_INVALID'));return;
          }
          try{finish(null,{metrics:[...value.grantedMetrics],envelope:cleanEnvelope(
            value.envelope,value.grantedMetrics,now()
          )});}catch(e){finish(e);}
        };
        rejectPending=()=>finish(new Error('M26_V46_PROD_INVALIDATED'));
        handle=scope.setTimeout?.(()=>finish(new Error('M26_V46_PROD_TIMEOUT')),timeoutMs);
        if(handle===undefined){finish(new Error('M26_V46_PROD_CLOCK_UNAVAILABLE'));return;}
        channel.addEventListener('message',onMessage);
        try{channel.postMessage(JSON.stringify({schema:REQUEST_SCHEMA,requestId,
          action:'health.readV46',days:7,metrics:requested}));}
        catch{finish(new Error('M26_V46_PROD_CHANNEL_UNAVAILABLE'));}
      });
      const latest=await identity();
      if(owner.ownerId!==latest.ownerId||owner.clientId!==latest.clientId||disposed)
        throw new Error('M26_V46_PROD_SESSION_CHANGED');
      return Object.freeze({provider:'health_connect',...response,
        persisted:false,automatic:false,linked:false,ownerId:owner.ownerId,
        clientId:owner.clientId});
    }finally{reading=false;}
  }
  function requestPermissions(){
    if(!isConnected360ProdNativeAvailable(scope)||disposed)
      throw new Error('M26_V46_PROD_CHANNEL_UNAVAILABLE');
    const id=scope.crypto?.randomUUID?.();
    if(!/^[a-zA-Z0-9_-]{8,72}$/u.test(String(id||'')))
      throw new Error('M26_V46_PROD_RANDOM_REQUIRED');
    // This only opens the official Android permission screen. Remote consent
    // must still be approved separately in IBERFIT.
    channel.postMessage(JSON.stringify({schema:REQUEST_SCHEMA,
      requestId:id,action:'health.permissions'}));
  }
  function destroy(){
    if(disposed)return;
    disposed=true;rejectPending?.();rejectPending=null;
    try{
      const requestId=scope?.crypto?.randomUUID?.();
      if(isConnected360ProdNativeAvailable(scope)&&channel===scope?.[CHANNEL]&&
        /^[a-zA-Z0-9_-]{8,72}$/u.test(String(requestId||''))){
        channel.postMessage(JSON.stringify({schema:REQUEST_SCHEMA,
          requestId,action:'health.invalidate'}));
      }
    }catch{}
  }
  return Object.freeze({readLocal,requestPermissions,destroy,available:()=>!disposed&&
    isConnected360ProdNativeAvailable(scope)});
}

export const __connected360V46ProdInternals=Object.freeze({cleanEnvelope});
