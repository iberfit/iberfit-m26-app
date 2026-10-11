/**
 * Canary Android QA acquisition only. This is deliberately NOT
 * IBERFIT_HEALTH_BRIDGE: it never creates a persistent connection, never
 * writes to Supabase, never grants consent and never runs automatically.
 *
 * Session ownership is resolved by the authenticated web application.
 * The token stays in JS and is NEVER posted to Android; native OS permission
 * and an independent one-shot Android user click are also required.
 */
const QA_ORIGIN='https://m26-canary.iberfit.cl';
const CHANNEL='IBERFIT_CONNECTED360_QA';
const REQUEST_SCHEMA='iberfit.connected360.qa.request.v1';
const RESPONSE_SCHEMA='iberfit.connected360.qa.read.v1';
const ERROR_SCHEMA='iberfit.connected360.qa.error.v1';
const METRICS=Object.freeze(['steps','sleepMinutes','restingHeartRate']);
const MAX_ROWS=7;
const MAX_MS=30_000;
const SAFE_ID=/^[a-zA-Z0-9_-]{8,72}$/u;
const DATE=/^\d{4}-\d{2}-\d{2}$/u;
const ISO=/^\d{4}-\d{2}-\d{2}T/u;
const AGGREGATION_ZONE=/^[A-Za-z0-9_.:+-]+(?:\/[A-Za-z0-9_.:+-]+)*$/u;

export function isConnected360QaNativeAvailable(scope=globalThis){
  return scope?.location?.origin===QA_ORIGIN &&
    typeof scope?.[CHANNEL]?.postMessage==='function' &&
    typeof scope?.[CHANNEL]?.addEventListener==='function';
}

function normalizeRows(rows,requested){
  if(!Array.isArray(rows)||rows.length>MAX_ROWS)
    throw new Error('M26_HEALTH_QA_RESPONSE_INVALID');
  const accepted=[];
  const seen=new Set();
  for(const row of rows){
    if(!row||row.provider!=='health_connect'||typeof row.date!=='string'||
      !DATE.test(row.date)||Number.isNaN(new Date(row.date+'T12:00:00Z').getTime())||
      !ISO.test(String(row.acquiredAt||''))||
      Number.isNaN(new Date(row.acquiredAt).getTime())||
      seen.has(row.date)||
      (row.contributingOriginCount!==undefined && row.contributingOriginCount!==null &&
        (!Number.isInteger(row.contributingOriginCount)||
          row.contributingOriginCount<1||row.contributingOriginCount>1000))||
      (row.aggregationTimeZone!==undefined && row.aggregationTimeZone!==null &&
        (typeof row.aggregationTimeZone!=='string'||
          row.aggregationTimeZone.length>80||row.aggregationTimeZone.length<1||
          !AGGREGATION_ZONE.test(row.aggregationTimeZone))))
      throw new Error('M26_HEALTH_QA_RESPONSE_INVALID');
    seen.add(row.date);
    const values={};
    for(const metric of METRICS){
      const value=row[metric];
      if(value===undefined||value===null)continue;
      if(!requested.includes(metric)||typeof value!=='number'||
        !Number.isFinite(value)||
        value<0||(metric==='steps'&&value>200000)||
        (metric==='sleepMinutes'&&value>1440)||
        (metric==='restingHeartRate'&&(value<25||value>240))||
        !Number.isInteger(value))
        throw new Error('M26_HEALTH_QA_RESPONSE_INVALID');
      values[metric]=value;
    }
    if(Object.keys(values).length){
      accepted.push(Object.freeze({
        provider:'health_connect',
        date:row.date,
        metrics:Object.freeze(values),
        // Read time is provenance, NOT the source measurement update time.
        acquiredAt:new Date(row.acquiredAt).toISOString(),
        // Actual OS aggregation window, not the physical sensor's time zone.
        aggregationTimeZone:row.aggregationTimeZone??null,
        // DataOrigin count, which may include synthetic phone steps; transient preview only.
        contributingOriginCount:row.contributingOriginCount??null,
      }));
    }
  }
  return Object.freeze(accepted);
}

export function createConnected360QaNativeChannel({
  scope=globalThis,
  getIdentity,
  getToken,
  timeoutMs=MAX_MS,
}={}){
  if(typeof getIdentity!=='function'||typeof getToken!=='function')
    throw new Error('M26_HEALTH_QA_AUTH_REQUIRED');
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>MAX_MS)
    throw new Error('M26_HEALTH_QA_TIMEOUT_INVALID');
  let disposed=false;
  let running=false;
  let rejectPending=null;
  const channel=scope?.[CHANNEL];

  async function requireClient(){
    if(disposed)throw new Error('M26_HEALTH_QA_DISPOSED');
    if(!isConnected360QaNativeAvailable(scope)||channel!==scope?.[CHANNEL])
      throw new Error('M26_HEALTH_QA_BRIDGE_UNAVAILABLE');
    const identity=getIdentity();
    if(String(identity?.role||'').toLowerCase()!=='client'||
      !String(identity?.clientId||'').trim()||
      !String(identity?.ownerId||'').trim())
      throw new Error('M26_HEALTH_QA_CLIENT_REQUIRED');
    const token=await getToken();
    if(disposed)throw new Error('M26_HEALTH_QA_DISPOSED');
    if(typeof token!=='string'||token.length<10)
      throw new Error('M26_HEALTH_QA_SESSION_REQUIRED');
    return {clientId:String(identity.clientId),ownerId:String(identity.ownerId)};
  }

  async function readLocal({days=7,metrics=METRICS}={}){
    if(running)throw new Error('M26_HEALTH_QA_BUSY');
    const chosen=Array.isArray(metrics)?[...new Set(metrics)]:[];
    if(!Number.isInteger(days)||days<1||days>7||
      chosen.length<1||chosen.some(x=>!METRICS.includes(x)))
      throw new Error('M26_HEALTH_QA_REQUEST_INVALID');
    const identity=await requireClient();
    if(disposed)throw new Error('M26_HEALTH_QA_DISPOSED');
    if(running)throw new Error('M26_HEALTH_QA_BUSY');
    running=true;
    try{
      const id=scope?.crypto?.randomUUID?.();
      if(!SAFE_ID.test(String(id||'')))
        throw new Error('M26_HEALTH_QA_RANDOM_REQUIRED');
      const message=JSON.stringify({
        schema:REQUEST_SCHEMA,
        requestId:id,
        action:'health.readDaily',
        days,
        metrics:chosen,
      });
      const response=await new Promise((resolve,reject)=>{
        let finished=false;
        const cleanup=()=>{
          rejectPending=null;
          channel.removeEventListener?.('message',onMessage);
          scope.clearTimeout?.(timer);
        };
        const finish=(error,result)=>{
          if(finished)return;
          finished=true;
          cleanup();
          if(error)reject(error);
          else resolve(result);
        };
        const onMessage=(event)=>{
          let parsed;
          try{parsed=JSON.parse(event?.data);}catch{return;}
          if(parsed?.requestId!==id)return;
          if(parsed?.schema===ERROR_SCHEMA){
            const code=String(parsed.error||'');
            finish(new Error(/^M26_[A-Z0-9_]{4,72}$/u.test(code)?
              code:'M26_HEALTH_QA_NATIVE_ERROR'));
            return;
          }
          if(parsed?.schema!==RESPONSE_SCHEMA||
            parsed?.provider!=='health_connect'||parsed?.persisted!==false){
            finish(new Error('M26_HEALTH_QA_RESPONSE_INVALID'));
            return;
          }
          try{
            const granted=parsed.grantedMetrics;
            if(!Array.isArray(granted)||granted.length<1||
              granted.length>chosen.length||
              new Set(granted).size!==granted.length||
              granted.some(metric=>!chosen.includes(metric)))
              throw new Error('M26_HEALTH_QA_RESPONSE_INVALID');
            finish(null,{
              rows:normalizeRows(parsed.records,granted),
              grantedMetrics:Object.freeze([...granted]),
            });
          }catch(error){finish(error);}
        };
        rejectPending=()=>finish(new Error('M26_HEALTH_QA_DISPOSED'));
        const timer=scope.setTimeout?.(
          ()=>finish(new Error('M26_HEALTH_QA_TIMEOUT')),timeoutMs
        );
        if(timer===undefined){
          finish(new Error('M26_HEALTH_QA_TIMEOUT_UNAVAILABLE'));
          return;
        }
        channel.addEventListener('message',onMessage);
        try{channel.postMessage(message);}
        catch{finish(new Error('M26_HEALTH_QA_BRIDGE_UNAVAILABLE'));}
      });
      // Account may change while Android is reading: never return another
      // user's local records to the newly authenticated session.
      const after=await requireClient();
      if(after.ownerId!==identity.ownerId||after.clientId!==identity.clientId)
        throw new Error('M26_HEALTH_QA_SESSION_CHANGED');
      if(disposed)throw new Error('M26_HEALTH_QA_DISPOSED');
      return Object.freeze({
        provider:'health_connect',
        rows:response.rows,
        grantedMetrics:response.grantedMetrics,
        persisted:false,
        linked:false,
        userConfirmedLocalRead:true,
      });
    }finally{
      running=false;
    }
  }

  return Object.freeze({
    readLocal,
    available:()=>!disposed&&isConnected360QaNativeAvailable(scope),
    destroy:()=>{
      disposed=true;
      rejectPending?.();
      rejectPending=null;
    },
  });
}

export const __connected360QaInternals=Object.freeze({
  normalizeRows,
  QA_ORIGIN,
  REQUEST_SCHEMA,
  RESPONSE_SCHEMA,
});
