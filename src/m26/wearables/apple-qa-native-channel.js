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
const WORKOUT_RESPONSE='iberfit.connected360.apple.qa.workouts.v1';
const CANDIDATE_RESPONSE='iberfit.connected360.apple.qa.candidate.v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
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

const WORKOUT_SPORTS=Object.freeze({running:'Carrera',cycling:'Ciclismo',walking:'Caminata',strength:'Fuerza',hiit:'HIIT',swimming:'Natación',other:'Otro entrenamiento'});
const workoutDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'});
const workoutClock=new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'});
function civilWorkoutDay(at){
  const parts=Object.fromEntries(workoutDay.formatToParts(at).map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
const workoutFail=()=>{throw Error('M26_APPLE_QA_RESPONSE_INVALID');};
// Native ISO formatter uses UTC and optional fractional seconds; reject
// coercive date parsing (e.g. 31 February) rather than relabel observations.
function workoutInstant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value))return NaN;
  const at=Date.parse(value);
  if(!Number.isFinite(at)||new Date(at).toISOString()!==(value.length===20?value.slice(0,-1)+'.000Z':value))return NaN;
  return at;
}
export function normalizeAppleQaWorkouts(value,{at=Date.now(),days=30}={}){
  if(!Number.isFinite(at)||!Number.isInteger(days)||days<1||days>30
    ||value?.schema!==WORKOUT_RESPONSE||value.provider!=='apple_health'||value.days!==days
    ||typeof value.mayHaveMore!=='boolean'||value.persisted!==false||value.linked!==false
    ||value.readPermissionStatus!=='not_disclosed'||!Array.isArray(value.records)||value.records.length>60
    ||Object.keys(value).some(k=>!['schema','requestId','provider','days','mayHaveMore','persisted','linked','readPermissionStatus','records'].includes(k)))workoutFail();
  let previous=Infinity;
  const rows=value.records.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)
      ||Object.keys(row).some(k=>!['sport','startedAt','endedAt','activeSeconds','distanceMeters'].includes(k))
      ||!Object.hasOwn(WORKOUT_SPORTS,row.sport)
      ||typeof row.startedAt!=='string'||typeof row.endedAt!=='string'
      ||typeof row.activeSeconds!=='number'||!Number.isFinite(row.activeSeconds))workoutFail();
    const start=workoutInstant(row.startedAt),end=workoutInstant(row.endedAt),elapsed=(end-start)/1000;
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<at-days*86400000-120000
      ||end>at+5000||start>previous||elapsed<=0||elapsed>86400
      ||row.activeSeconds<=0||row.activeSeconds>elapsed+1)workoutFail();
    previous=start;
    const distance=row.distanceMeters;
    if(distance!==undefined&&(typeof distance!=='number'||!Number.isFinite(distance)||distance<0||distance>500000))workoutFail();
    const unit=row.sport==='swimming'?100:row.sport==='running'?1000:null;
    const pace=unit&&distance>=unit?Math.round(row.activeSeconds*unit/distance):null;
    return Object.freeze({day:civilWorkoutDay(start),time:workoutClock.format(start),sport:row.sport,label:WORKOUT_SPORTS[row.sport],
      activeSeconds:row.activeSeconds,distanceMeters:distance??null,activePaceSeconds:pace>0?pace:null,paceUnitMeters:unit});
  });
  return Object.freeze({rows:Object.freeze(rows),mayHaveMore:value.mayHaveMore,provider:'apple_health',
    persisted:false,linked:false,readPermissionStatus:'not_disclosed'});
}
// Candidate-only QA adapter. The existing V54 coordinator independently
// validates row contents, current consent and ACK before any server import.
// No candidate caller is mounted in the application.
export function normalizeAppleQaCandidatePage(value,{days,cursor,at=Date.now()}={}){
  const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
  if(!exact(value,['schema','requestId','page'])||value.schema!==CANDIDATE_RESPONSE||!ID.test(value.requestId||''))workoutFail();
  const p=value.page;
  if(!exact(p,['schema','provider','days','cursor','nextCursor','acquiredAt','records','readPermissionStatus','persisted'])
    ||p.schema!=='iberfit.connected360.v54.apple.page.v1'||p.provider!=='apple_health'||p.days!==days
    ||![7,30].includes(days)||p.cursor!==cursor||p.persisted!==false||p.readPermissionStatus!=='not_disclosed'
    ||(p.nextCursor!==null&&(!UUID.test(p.nextCursor||'')||p.nextCursor===cursor))
    ||!Array.isArray(p.records)||p.records.length>20)workoutFail();
  const acquired=workoutInstant(p.acquiredAt);
  if(!Number.isFinite(at)||!Number.isFinite(acquired)||acquired<at-1200000||acquired>at+5000)workoutFail();
  const seen=new Set();
  const records=p.records.map(r=>{
    if(!exact(r,['observationKey','sport','startedAt','endedAt','activeSeconds','distanceMeters'])
      ||typeof r.observationKey!=='string'||!(/^[0-9a-f]{64}$/u).test(r.observationKey)||seen.has(r.observationKey)
      ||!Object.hasOwn(WORKOUT_SPORTS,r.sport))workoutFail();
    const start=workoutInstant(r.startedAt),end=workoutInstant(r.endedAt),elapsed=(end-start)/1000;
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<acquired-days*86400000-1000||end>acquired+1000
      ||elapsed<=0||elapsed>86400||typeof r.activeSeconds!=='number'||!Number.isFinite(r.activeSeconds)
      ||r.activeSeconds<=0||r.activeSeconds>elapsed+1
      ||(r.distanceMeters!==null&&(typeof r.distanceMeters!=='number'||!Number.isFinite(r.distanceMeters)||r.distanceMeters<0||r.distanceMeters>500000)))workoutFail();
    seen.add(r.observationKey);
    return Object.freeze({...r});
  });
  return Object.freeze({...p,records:Object.freeze(records)});
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
  let disposed=false, running=false, rejectPending=null, generation=0;
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
  async function read({days=7,workouts=false,candidate=false,cursor=null,signal=null}={}){
    if(disposed)throw Error('M26_APPLE_QA_DISPOSED');
    if(running)throw Error('M26_APPLE_QA_BUSY');
    if(signal?.aborted)throw Error('M26_APPLE_QA_DISPOSED');
    if(!Number.isInteger(days)||days<1||days>(workouts||candidate?30:7)
      ||(candidate&&(![7,30].includes(days)||(cursor!==null&&(typeof cursor!=='string'||!UUID.test(cursor))))))
      throw Error('M26_APPLE_QA_REQUEST_INVALID');
    const owner=identity(),lease=generation;
    const token=await getToken(); // NEVER forwarded to the native host.
    same(owner);
    if(lease!==generation||signal?.aborted)throw Error('M26_APPLE_QA_DISPOSED');
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
          signal?.removeEventListener?.('abort',onAbort);
        }
        function finish(error,result){
          if(finished)return;
          finished=true;cleanup();
          if(error)reject(error);else resolve(result);
        }
        function onAbort(){finish(Error('M26_APPLE_QA_DISPOSED'));}
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
          if(candidate){
            try{finish(null,normalizeAppleQaCandidatePage(parsed,{at:now(),days,cursor}));}
            catch(error){finish(error);}
            return;
          }
          if(workouts){
            try{finish(null,normalizeAppleQaWorkouts(parsed,{at:now(),days}));}
            catch(error){finish(error);}
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
        signal?.addEventListener?.('abort',onAbort,{once:true});
        if(signal?.aborted){onAbort();return;}
        try{
          // Never include ownerId, clientId, access token, grant or user email.
          sender.postMessage({schema:REQUEST,requestId,action:candidate?'health.readCandidatePage':workouts?'health.readWorkouts':'health.readDaily',days,...(candidate?{cursor}:{})});
        }catch{finish(Error('M26_APPLE_QA_NATIVE_UNAVAILABLE'));}
      });
      same(owner);
      if(disposed||lease!==generation||signal?.aborted)throw Error('M26_APPLE_QA_DISPOSED');
      if(workouts||candidate)return response;
      return Object.freeze({
        provider:'apple_health',rows:response,
        requestedMetrics:METRICS,readPermissionStatus:'not_disclosed',
        persisted:false,linked:false,userConfirmedLocalRead:true,
      });
    }finally{running=false;}
  }
  function invalidate(){
      generation++;
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
  }
  return Object.freeze({
    readLocal:({days=7}={})=>read({days}),
    readWorkouts:({days=30}={})=>read({days,workouts:true}),
    readCandidatePage:({days=30,cursor=null,signal=null}={})=>read({days,candidate:true,cursor,signal}),
    available:()=>!disposed&&isAppleHealthQaNativeAvailable(scope),
    invalidate,
    destroy:()=>{
      if(disposed)return;
      invalidate();
      disposed=true;
    },
  });
}
