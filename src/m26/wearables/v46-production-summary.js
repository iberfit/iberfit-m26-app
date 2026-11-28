import {formatSleepDuration} from './duration-format.js';
import {observedCivilDayRuns} from '../domain/civil-date.js';
const DAY=/^\d{4}-\d\d-\d\d$/u;
const bpm=n=>typeof n==='number'&&Number.isFinite(n)&&n>=25&&n<=240?n:null;
const WORKOUT_SPORTS=Object.freeze({
  running:'Carrera',interval_running:'Carrera por intervalos',hiit:'HIIT',
  cycling:'Ciclismo',walking:'Caminata',strength:'Fuerza',swimming:'Natación',other:'Otro entrenamiento',
});
const workoutDate=new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'});
const decimal=new Intl.NumberFormat('es-CL',{maximumFractionDigits:2});
const workoutDayKey=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Santiago'});
const workoutDayLabel=new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'America/Santiago'});
const workoutTime=new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'America/Santiago'});
function localWorkoutDay(stamp){
  const parts=Object.fromEntries(workoutDayKey.formatToParts(stamp).map(({type,value})=>[type,value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
function observedInstant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value))return null;
  // Date.parse normalizes dates such as 30 February; reject those before
  // applying the offset, so malformed observations cannot become real workouts.
  const day=value.slice(0,10),civil=new Date(day+'T00:00:00Z');
  if(!Number.isFinite(civil.getTime())||civil.toISOString().slice(0,10)!==day)return null;
  const hour=Number(value.slice(11,13)),minute=Number(value.slice(14,16)),second=Number(value.slice(17,19));
  if(hour>23||minute>59||second>59)return null;
  const stamp=Date.parse(value);return Number.isFinite(stamp)?stamp:null;
}
function observedDuration(ms){
  const seconds=Math.floor(ms/1000),hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60);
  return [hours?hours+' h':'',minutes?minutes+' min':'',!hours&&seconds%60?seconds%60+' s':''].filter(Boolean).join(' ')||'Menos de 1 s';
}
// Health Connect V46 reports elapsed timestamps and distance aggregated from
// the same data origin. Neither proves moving time or a device-reported pace.
// Keep an explicitly estimated, total-time pace separate from active pace.
function observedElapsedRunningPaceSeconds(sport,ms,meters){
  if(!['running','interval_running'].includes(sport)||typeof meters!=='number'
    ||!Number.isFinite(meters)||meters<100||meters>500000)return null;
  const secondsPerKm=Math.round(ms/meters);
  if(!Number.isSafeInteger(secondsPerKm)||secondsPerKm<60||secondsPerKm>3600)return null;
  return secondsPerKm;
}
function observedElapsedSwimPaceSeconds(sport,ms,meters){
  if(sport!=='swimming'||typeof meters!=='number'||!Number.isFinite(meters)||meters<100||meters>500000)return null;
  const pace=Math.round(ms/(10*meters));
  return Number.isSafeInteger(pace)&&pace>=15&&pace<=1200?pace:null;
}
function formatPace(secondsPerKm){
  return Math.floor(secondsPerKm/60)+':'+String(secondsPerKm%60).padStart(2,'0');
}
// Only the current owner-scoped server response feeds this list. The contract
// contains up to ten observations, not a complete historical activity feed.
// Do not infer physical watch identity or completed IBERFIT training.
export function connected360WorkoutHistory(p,{now=new Date()}={}){
  if(p?.ok!==true||p.provider!=='health_connect'||!Array.isArray(p.exerciseEvidence)
    ||p.exerciseEvidence.length>10||!Number.isFinite(now?.getTime?.()))return Object.freeze([]);
  const rows=[];
  for(const row of p.exerciseEvidence){
    if(!row||typeof row!=='object'||Array.isArray(row)||!Object.hasOwn(WORKOUT_SPORTS,row.sport)
      ||row.linkedToTraining===true)continue;
    const start=observedInstant(row.startedAt),end=observedInstant(row.endedAt);
    if(start===null||end===null||start>=end||end-start>86400000||end>now.getTime()+300000)continue;
    const d=row.distanceMeters, distance=typeof d==='number'&&Number.isFinite(d)&&d>=0&&d<=500000
      ?decimal.format(d>=1000?d/1000:d)+(d>=1000?' km':' m'):null;
    // The existing summary does not yet expose avgBpm. Accept it only from
    // the owner-scoped server DTO with positive observed sample coverage.
    const authorizationState=['current','retained'].includes(row.authorizationState)?row.authorizationState:'unknown';
    const average=authorizationState==='retained'?null:bpm(row.avgBpm);
    const averageLabel=average!==null&&Number.isSafeInteger(row.heartRateSamples)&&row.heartRateSamples>0&&row.heartRateSamples<=200000
      ?'FC media '+decimal.format(average)+' lpm':null;
    const elapsedPaceSecondsPerKm=observedElapsedRunningPaceSeconds(row.sport,end-start,d);
    const elapsedPaceSecondsPer100m=observedElapsedSwimPaceSeconds(row.sport,end-start,d);
    const metrics=[observedDuration(end-start),distance,averageLabel,
      elapsedPaceSecondsPerKm===null?null:'Ritmo total estimado '+formatPace(elapsedPaceSecondsPerKm)+' min/km',
      elapsedPaceSecondsPer100m===null?null:'Ritmo total estimado '+formatPace(elapsedPaceSecondsPer100m)+' min/100 m'].filter(Boolean);
    rows.push({start,orderAt:start,source:'imported',authorizationState,label:WORKOUT_SPORTS[row.sport],
      measurements:Object.freeze({elapsedSeconds:(end-start)/1000,
        distanceMeters:distance===null?null:d,averageBpm:averageLabel===null?null:average,
        elapsedPaceSecondsPerKm,...(row.sport==='swimming'?{elapsedPaceSecondsPer100m}:{})}),
      dayKey:localWorkoutDay(start),dayLabel:workoutDayLabel.format(start),
      dayDetail:[workoutTime.format(start),...metrics].join(' · '),
      detail:[workoutDate.format(start),...metrics].join(' · ')});
  }
  return Object.freeze(rows.sort((a,b)=>b.start-a.start).map(({start,...row})=>Object.freeze(row)));
}
// The caller supplies only reconciled, confirmed canonical execution dates.
// An imported record is not proof that it represents a different workout.
// Keep provenance explicit and never calculate combined counts or adherence.
export function connected360RecentTrainingRows(confirmed,{now=new Date()}={}){
  if(!Array.isArray(confirmed)||!Number.isFinite(now?.getTime?.()))return Object.freeze([]);
  const rows=[],end=now.getTime(),start=end-7*86400000;
  for(const record of confirmed){
    const at=observedInstant(record?.completedAt);
    if(at===null||at<start||at>end)continue;
    const label=typeof record.title==='string'&&record.title.trim()
      ?record.title.trim().slice(0,120):'Entrenamiento IBERFIT';
    rows.push(Object.freeze({source:'iberfit',orderAt:at,label,
      dayKey:localWorkoutDay(at),dayLabel:workoutDayLabel.format(at),
      dayDetail:'Finalizado '+workoutTime.format(at),
      detail:workoutDate.format(at)+' · Ejecución confirmada'}));
  }
  return Object.freeze(rows.sort((a,b)=>b.orderAt-a.orderAt).slice(0,20));
}
export function connected360RecentTimeline(imported,confirmed){
  if(!Array.isArray(imported)||imported.length>10||!Array.isArray(confirmed)||confirmed.length>20)
    return Object.freeze([]);
  if(imported.some(row=>row?.source!=='imported')||confirmed.some(row=>row?.source!=='iberfit'))
    return Object.freeze([]);
  return Object.freeze([...imported,...confirmed].sort((a,b)=>b.orderAt-a.orderAt));
}
// Group by the same Chilean civil date used for visible training timestamps.
// A session spanning midnight belongs to its start day; never combine sessions.
export function connected360WorkoutDays(rows,{beforeStartedAt=null}={}){
  if(!Array.isArray(rows)||rows.length>30)return Object.freeze([]);
  const groups=new Map();
  const before=observedInstant(beforeStartedAt);
  const continuedDay=before===null?null:localWorkoutDay(before);
  for(const row of rows){
    if(!DAY.test(row?.dayKey||'')||typeof row.dayLabel!=='string'
      ||typeof row.dayDetail!=='string'||!row.dayDetail
      ||!(row.source==='imported'&&Object.values(WORKOUT_SPORTS).includes(row.label)
        ||row.source==='iberfit'&&typeof row.label==='string'&&row.label.trim()&&row.label.length<=120))
      return Object.freeze([]);
    if(!groups.has(row.dayKey))groups.set(row.dayKey,{
      dayKey:row.dayKey,label:row.dayLabel,continued:row.dayKey===continuedDay,rows:[],
    });
    groups.get(row.dayKey).rows.push(row);
  }
  return Object.freeze([...groups.values()].sort((a,b)=>b.dayKey.localeCompare(a.dayKey))
    .map(day=>Object.freeze({...day,rows:Object.freeze(day.rows)})));
}
// A positive-only training continuity observation, not a workload/recovery
// score. Count unique civil days, never sessions or minutes across sources.
// The limited recent response can establish presence, never absence of exercise.
function previousCivilDay(day){
  const date=new Date(day+'T00:00:00Z');
  date.setUTCDate(date.getUTCDate()-1);
  return date.toISOString().slice(0,10);
}
export function connected360ActivityContinuity(rows,{now=new Date()}={}){
  if(!Array.isArray(rows)||rows.length>30||!Number.isFinite(now?.getTime?.()))return null;
  const observed=new Set(),running=new Set();
  for(const row of rows){
    if(!row||!['imported','iberfit'].includes(row.source)
      ||!Number.isFinite(row.orderAt)||row.orderAt>now.getTime()
      ||row.dayKey!==localWorkoutDay(row.orderAt))return null;
    // Legacy/retained owner history stays visible but cannot become
    // current device-derived readiness context without a verified grant.
    if(row.source==='imported'&&row.authorizationState!=='current')continue;
    observed.add(row.dayKey);
    if(row.source==='imported'&&['Carrera','Carrera por intervalos'].includes(row.label))
      running.add(row.dayKey);
  }
  return connected360ObservedDayContinuity(observed,running,{now,
    source:rows.every(row=>row.source==='iberfit')?'confirmed_iberfit_execution':'recent_authorized_activity'});
}
// Shared positive-only day calculation for authorized date-only Coach data
// and timestamped owner observations. Never infer a rest day or load.
export function connected360ObservedDayContinuity(observed,running,{now=new Date(),source}={}){
  if(!(observed instanceof Set)||!(running instanceof Set)||!Number.isFinite(now?.getTime?.())
    ||![...running].every(day=>observed.has(day))
    ||!['confirmed_iberfit_execution','recent_authorized_activity','coach_authorized_activity'].includes(source))return null;
  const today=localWorkoutDay(now),yesterday=previousCivilDay(today);
  // Anchor to today or yesterday only; never revive an old series as current.
  function streak(days){
    const end=days.has(today)?today:days.has(yesterday)?yesterday:null;
    if(!end)return null;
    let start=end;
    for(let i=0;i<6;i++)start=previousCivilDay(start);
    const run=observedCivilDayRuns([...days].filter(day=>day>=start&&day<=end)).at(-1);
    return run&&run.days>=5&&run.periodEnd===end?run:null;
  }
  const any=streak(observed),run=streak(running);
  if(!any&&!run)return null;
  // The observation is an advisory context, not an automatic exercise
  // prescription, diagnosis, claim of no recovery, or retention alert.
  // Preserve the more specific running observation even when there is a
  // longer mixed-activity streak. Keep both counts available for reports.
  const chosen=run?{...run,discipline:'running'}:{...any,discipline:'mixed'};
  return Object.freeze({...chosen,kind:'observed_activity_continuity',
    activityDays:any?.days??null,runningDays:run?.days??null,
    source,coverage:'partial',
    interpretation:'presence_only',recommendation:'review_recovery_with_coach',
    automaticPlanChange:false});
}
// V48 page contract: keyset pagination, no raw source keys or device IDs.
// Keep the legacy seven-day summary bounded at ten; a history page is separate.
const HISTORY_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const HISTORY_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;
export const CONNECTED360_ACTIVITY_PAGE_SIZE=20;
function activityCursor(value){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||typeof value.id!=='string'||!HISTORY_UUID.test(value.id)
    ||typeof value.startedAt!=='string'||!HISTORY_UTC.test(value.startedAt)
    ||observedInstant(value.startedAt)===null)
    throw new Error('M26_V48_ACTIVITY_CURSOR_INVALID');
  return Object.freeze({id:value.id,startedAt:value.startedAt});
}
export function connected360ActivityPageParams(cursor=null){
  const c=cursor===null?null:activityCursor(cursor);
  return {p_before_started_at:c?.startedAt??null,p_before_id:c?.id??null};
}
function strictlyEarlier(a,b){
  return a.startedAt<b.startedAt||(a.startedAt===b.startedAt&&a.id<b.id);
}
export function connected360ActivityPage(p,{cursor=null,now=new Date()}={}){
  const fail=()=>{throw new Error('M26_V48_ACTIVITY_PAGE_INVALID');};
  if(p?.ok!==true||p.schema!=='iberfit.connected360.activity-page.v1'
    ||p.provider!=='health_connect'||!Array.isArray(p.exerciseEvidence)
    ||p.exerciseEvidence.length>CONNECTED360_ACTIVITY_PAGE_SIZE
    ||!Object.hasOwn(p,'nextCursor')||!Number.isFinite(now?.getTime?.()))fail();
  let previous=cursor===null?null:activityCursor(cursor);
  const rows=[],seen=new Set();
  for(const row of p.exerciseEvidence){
    const key=activityCursor(row);
    if(seen.has(key.id)||(previous&&!strictlyEarlier(key,previous)))fail();
    const formatted=connected360WorkoutHistory({ok:true,provider:'health_connect',exerciseEvidence:[row]},{now});
    if(formatted.length!==1)fail();
    seen.add(key.id);previous=key;rows.push(formatted[0]);
  }
  let nextCursor=null;
  if(p.nextCursor!==null){
    const next=activityCursor(p.nextCursor);
    if(rows.length!==CONNECTED360_ACTIVITY_PAGE_SIZE||!previous
      ||next.id!==previous.id||next.startedAt!==previous.startedAt)fail();
    nextCursor=next;
  }
  return Object.freeze({rows:Object.freeze(rows),nextCursor});
}
// Describe only the bounded list received from the server, not the user's
// total activity. Do not sum durations or distances across potential overlaps.
export function connected360WorkoutMix(rows){
  if(!Array.isArray(rows)||rows.length>10)return Object.freeze([]);
  const sports=new Map(),allowed=new Set(Object.values(WORKOUT_SPORTS));
  // Count observed dates and retain ranges only. No combined totals, averages
  // across sources, or claims of comparable performance.
  const fields=[
    ['distanceMeters','Distancia registrada',0,500000,v=>decimal.format(v/1000)+' km'],
    ['elapsedSeconds','Duración total registrada',0.001,86400,v=>observedDuration(v*1000)],
    ['elapsedPaceSecondsPerKm','Ritmo total estimado',60,3600,v=>formatPace(v)+' min/km'],
    ['elapsedPaceSecondsPer100m','Ritmo total estimado',15,1200,v=>formatPace(v)+' min/100 m'],
    ['averageBpm','FC media registrada',25,240,v=>decimal.format(v)+' lpm'],
  ];
  for(const row of rows){
    if(!allowed.has(row?.label)||typeof row.detail!=='string'||!row.detail)return Object.freeze([]);
    if(!sports.has(row.label))sports.set(row.label,{label:row.label,detail:row.detail,days:new Set(),measures:new Map()});
    if(row.source!=='imported'||!Number.isFinite(row.orderAt)||row.dayKey!==localWorkoutDay(row.orderAt))continue;
    const group=sports.get(row.label);group.days.add(row.dayKey);
    for(const [key,label,min,max,format] of fields){
      const value=row.measurements?.[key];
      if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)continue;
      if(key==='elapsedPaceSecondsPerKm'&&(!['Carrera','Carrera por intervalos'].includes(row.label)||!Number.isSafeInteger(value)))continue;
      if(key==='elapsedPaceSecondsPer100m'&&(row.label!=='Natación'||!Number.isSafeInteger(value)))continue;
      if(!group.measures.has(key))group.measures.set(key,{label,min:value,max:value,days:new Set(),format});
      const metric=group.measures.get(key);
      metric.min=Math.min(metric.min,value);metric.max=Math.max(metric.max,value);metric.days.add(row.dayKey);
    }
  }
  return Object.freeze([...sports.values()].map(({days,measures,...row})=>Object.freeze({
    ...row,observedDays:days.size||null,
    ranges:Object.freeze([...measures].filter(([,metric])=>metric.days.size>=2)
      .map(([key,metric])=>Object.freeze({key,label:metric.label,
        min:metric.min,max:metric.max,observedDays:metric.days.size,
        text:metric.min===metric.max?metric.format(metric.min):metric.format(metric.min)+' — '+metric.format(metric.max)}))),
  })));
}
export function formatConnected360ProductionSummary(p,{nativeAvailable=true}={}){
  if(!p||p.ok!==true||p.provider!=='health_connect'||
    !Array.isArray(p.heartRateDaily)||!Array.isArray(p.exerciseEvidence)
    ||(p.dailyHealth!==undefined&&!Array.isArray(p.dailyHealth)))
    throw new Error('M26_V46_PROD_SUMMARY_INVALID');
  const days=p.heartRateDaily.slice(0,7).filter(x=>DAY.test(String(x?.date||'')));
  days.sort((a,b)=>b.date.localeCompare(a.date));
  const day=days[0],activities=p.exerciseEvidence.slice(0,10).length;
  const daily=(p.dailyHealth||[]).slice(0,7).filter(x=>DAY.test(String(x?.date||'')))
    .sort((a,b)=>b.date.localeCompare(a.date));
  const latest=daily[0];
  if(!day&&activities===0&&!latest)return nativeAvailable?'Todavía no hay mediciones sincronizadas en IBERFIT. Comprueba los permisos de Android. Al volver a abrir IBERFIT se intentará sincronizar automáticamente.':'Todavía no hay mediciones sincronizadas en IBERFIT. Conecta tu actividad desde la aplicación Android compatible si deseas importarla.';
  const minimum=bpm(day?.minBpm),maximum=bpm(day?.maxBpm);
  const count=Number.isSafeInteger(day?.samples)&&day.samples>=0&&day.samples<=200000?day.samples:null;
  const general=day?'FC general del '+day.date+(count!==null?' · '+count+' mediciones':'')+
    (minimum!==null&&maximum!==null&&minimum<=maximum?' · rango '+minimum+'–'+maximum+' lpm':''):
    'Sin frecuencia cardíaca general registrada';
  const steps=Number.isInteger(latest?.steps)&&latest.steps>=0?
    latest.steps.toLocaleString('es-CL')+' pasos':'Sin dato';
  const sleep=latest?.sleepMinutes==null?null:formatSleepDuration(latest.sleepMinutes);
  const rest=bpm(latest?.restingHeartRate);
  const dailyText=latest?' Actividad diaria del '+latest.date+
    ': pasos '+steps+', sueño '+(sleep??'Sin dato')+
    ', FC en reposo '+(rest===null?'Sin dato':rest+' lpm'):'';
  return general+'. Actividades observadas (7 días): '+activities+
    (latest?'.'+dailyText:'')+
    '. No son entrenamientos confirmados. La FC general no equivale a FC en reposo; el origen físico del reloj no está verificado.';
}

/** Coalesce view replacement reads. Only short-lived in-memory data, never a
 * durable health cache. A fresh native receipt or privacy event retires it. */
export function createConnected360SummaryReader({now=()=>Date.now(),ttlMs=15000}={}){
  if(typeof now!=='function'||!Number.isSafeInteger(ttlMs)||ttlMs<0||ttlMs>15000)
    throw new Error('M26_V46_SUMMARY_CACHE_INVALID');
  let epoch=0,current=null;
  function clear(){epoch++;current=null;}
  function read(key,load,{force=false}={}){
    if(typeof key!=='string'||!key||typeof load!=='function')return Promise.reject(new Error('M26_V46_SUMMARY_READ_INVALID'));
    if(current?.key!==key||force)clear();
    const timestamp=now();
    if(current?.pending)return current.pending;
    if(current?.value&&Number.isFinite(timestamp)&&timestamp>=current.at&&timestamp-current.at<ttlMs)
      return Promise.resolve(current.value);
    const version=epoch;
    const entry={key,pending:null,value:null,at:null};
    current=entry;
    const pending=Promise.resolve().then(()=>{
      if(current!==entry||epoch!==version)throw new Error('M26_V46_SUMMARY_READ_RETIRED');
      return load();
    }).then(value=>{
      // A retired read must not deliver private data even to its original caller.
      if(current!==entry||epoch!==version)throw new Error('M26_V46_SUMMARY_READ_RETIRED');
      entry.value=value;entry.at=now();
      return value;
    },error=>{
      // Never surface an obsolete account's error payload to a new session.
      if(current!==entry||epoch!==version)throw new Error('M26_V46_SUMMARY_READ_RETIRED');
      throw error;
    }).finally(()=>{if(current===entry)entry.pending=null;});
    entry.pending=pending;
    return pending;
  }
  return Object.freeze({read,clear});
}


// Apple owner history V55: strict provider-specific DTO. Reuse existing
// formatting and microsecond cursor machinery, never relax the Android DTO.
// Active and elapsed pace are different measurements, never substituted.
export function connected360AppleActivityPage(p,{cursor=null,now=new Date()}={}){
 const fail=()=>{throw Error('M26_V55_APPLE_HISTORY_INVALID');};
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 if(!exact(p,['ok','schema','provider','exerciseEvidence','nextCursor'])||p.ok!==true
 ||p.schema!=='iberfit.connected360.apple.activity-page.v1'||p.provider!=='apple_health'
 ||!Array.isArray(p.exerciseEvidence)||p.exerciseEvidence.length>CONNECTED360_ACTIVITY_PAGE_SIZE
 ||!Number.isFinite(now?.getTime?.()))fail();
 let previous=cursor===null?null:activityCursor(cursor);
 const rows=[],seen=new Set();
 for(const row of p.exerciseEvidence){
  if(!exact(row,['id','sport','startedAt','endedAt','activeSeconds','distanceMeters','authorizationState','linkedToTraining'])
  ||!['running','cycling','walking','strength','hiit','swimming','other'].includes(row.sport)
  ||!['current','retained'].includes(row.authorizationState)||row.linkedToTraining!==false
  ||!HISTORY_UTC.test(row.endedAt||''))fail();
  const k=activityCursor(row),start=observedInstant(row.startedAt),end=observedInstant(row.endedAt);
  const elapsed=(end-start)/1000,active=row.activeSeconds,distance=row.distanceMeters;
  if(seen.has(k.id)||(previous&&!strictlyEarlier(k,previous))||start===null||end===null
  ||elapsed<=0||elapsed>86400||end>now.getTime()||(active!==null&&(typeof active!=='number'||!Number.isFinite(active)||active<=0||active>elapsed+1))
  ||(distance!==null&&(typeof distance!=='number'||!Number.isFinite(distance)||distance<0||distance>500000)))fail();
  const unit=row.sport==='swimming'?100:row.sport==='running'?1000:null;
  const pace=unit&&active!==null&&distance!==null&&distance>=100?Math.round(active*unit/distance):null;
  const validPace=Number.isSafeInteger(pace)&&pace>=(unit===100?15:60)&&pace<=(unit===100?1200:3600)?pace:null;
  const details=[active===null?null:'Duración activa '+observedDuration(active*1000),'Duración total '+observedDuration(end-start),
   distance===null?null:decimal.format(distance>=1000?distance/1000:distance)+(distance>=1000?' km':' m'),
   validPace===null?null:'Ritmo activo estimado '+formatPace(validPace)+(unit===100?' min/100 m':' min/km')].filter(Boolean);
  rows.push(Object.freeze({source:'imported',provider:'apple_health',orderAt:start,label:WORKOUT_SPORTS[row.sport],authorizationState:row.authorizationState,
   measurements:Object.freeze({elapsedSeconds:elapsed,activeSeconds:active,distanceMeters:distance,
    ...(unit===100?{activePaceSecondsPer100m:validPace}:unit===1000?{activePaceSecondsPerKm:validPace}:{})}),
   dayKey:localWorkoutDay(start),dayLabel:workoutDayLabel.format(start),
   dayDetail:[workoutTime.format(start),...details].join(' · '),detail:[workoutDate.format(start),...details].join(' · ')}));
  seen.add(k.id);previous=k;
 }
 let nextCursor=null;
 if(p.nextCursor!==null){
  if(!exact(p.nextCursor,['id','startedAt']))fail();
  const next=activityCursor(p.nextCursor);
  if(rows.length!==CONNECTED360_ACTIVITY_PAGE_SIZE||!previous||next.id!==previous.id||next.startedAt!==previous.startedAt)fail();
  nextCursor=next;
 }
 return Object.freeze({rows:Object.freeze(rows),nextCursor});
}

const APPLE_TREND_WINDOWS=new Set([7,28,90,365]);
const APPLE_TREND_SPORTS=new Set(['running','cycling','walking','strength','hiit','swimming','other']);
export function connected360AppleOwnerTrendParams(days){
 if(!APPLE_TREND_WINDOWS.has(days))throw Error('M26_V57_PERIOD_INVALID');
 return {p_days:days};
}
// Owner only. The server returns observed dates, not session counts,
// activity totals, coverage claims, adherence or recovery diagnoses.
export function connected360AppleOwnerTrends(value,{clientId,days,now=new Date()}={}){
 const fail=()=>{throw Error('M26_V57_APPLE_TRENDS_INVALID');};
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 if(!APPLE_TREND_WINDOWS.has(days)||!HISTORY_UUID.test(clientId||'')||!Number.isFinite(now?.getTime?.())
 ||!exact(value,['ok','schema','provider','clientId','windowDays','coverage','periods'])||value.ok!==true
 ||value.schema!=='iberfit.connected360.apple-owner-trends.v1'||value.provider!=='apple_health'
 ||value.clientId!==clientId||value.windowDays!==days||value.coverage!=='observed-only'
 ||!Array.isArray(value.periods)||value.periods.length!==2)fail();
 const shift=(day,n)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const end=shift(localWorkoutDay(now.getTime()),-1);
 const keys=['observedDays','currentOnlyDays','retainedOnlyDays','mixedDays'];
 function counts(row,limit){
  if(keys.some(k=>!Number.isInteger(row[k])||row[k]<0||row[k]>limit)
  ||row.currentOnlyDays+row.retainedOnlyDays+row.mixedDays!==row.observedDays)fail();
  return Object.fromEntries(keys.map(k=>[k,row[k]]));
 }
 const periods=value.periods.map((period,index)=>{
  const last=shift(end,-index*days),first=shift(last,1-days),kind=index?'previous':'recent';
  if(!exact(period,['kind','periodStart','periodEnd',...keys,'disciplines'])||period.kind!==kind
  ||period.periodStart!==first||period.periodEnd!==last||!Array.isArray(period.disciplines)||period.disciplines.length>APPLE_TREND_SPORTS.size)fail();
  const totals=counts(period,days),seen=new Set();
  const disciplines=period.disciplines.map(d=>{
   if(!exact(d,['sport',...keys])||!APPLE_TREND_SPORTS.has(d.sport)||seen.has(d.sport)||!d.observedDays)fail();
   seen.add(d.sport);const measures=counts(d,totals.observedDays);
   // A mixed day within one discipline must also be mixed globally.
   // Single-generation discipline days can overlap a globally mixed day.
   if(measures.mixedDays>totals.mixedDays
   ||measures.currentOnlyDays+measures.mixedDays>totals.currentOnlyDays+totals.mixedDays
   ||measures.retainedOnlyDays+measures.mixedDays>totals.retainedOnlyDays+totals.mixedDays)fail();
   return Object.freeze({sport:d.sport,...measures});
  });
  // Each global observed day (including each authorization generation) must
  // be represented by at least one discipline. Never sum as an activity total:
  // different disciplines can share a day, including mixed-generation days.
  if(disciplines.reduce((sum,d)=>sum+d.observedDays,0)<totals.observedDays
  ||disciplines.reduce((sum,d)=>sum+d.currentOnlyDays+d.mixedDays,0)<totals.currentOnlyDays+totals.mixedDays
  ||disciplines.reduce((sum,d)=>sum+d.retainedOnlyDays+d.mixedDays,0)<totals.retainedOnlyDays+totals.mixedDays)fail();
  return Object.freeze({kind,periodStart:first,periodEnd:last,...totals,disciplines:Object.freeze(disciplines)});
 });
 return Object.freeze({provider:'apple_health',windowDays:days,coverage:'observed-only',periods:Object.freeze(periods),automaticPlanChange:false});
}
