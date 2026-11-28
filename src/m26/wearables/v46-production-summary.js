import {formatSleepDuration} from './duration-format.js';
const DAY=/^\d{4}-\d\d-\d\d$/u;
const bpm=n=>typeof n==='number'&&Number.isFinite(n)&&n>=25&&n<=240?n:null;
const WORKOUT_SPORTS=Object.freeze({
  running:'Carrera',interval_running:'Carrera por intervalos',hiit:'HIIT',
  cycling:'Ciclismo',walking:'Caminata',strength:'Fuerza',other:'Otro entrenamiento',
});
const workoutDate=new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'});
const decimal=new Intl.NumberFormat('es-CL',{maximumFractionDigits:2});
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
function observedElapsedRunningPace(sport,ms,meters){
  if(!['running','interval_running'].includes(sport)||typeof meters!=='number'
    ||!Number.isFinite(meters)||meters<100||meters>500000)return null;
  const secondsPerKm=Math.round(ms/meters);
  if(!Number.isSafeInteger(secondsPerKm)||secondsPerKm<60||secondsPerKm>3600)return null;
  const minutes=Math.floor(secondsPerKm/60),seconds=String(secondsPerKm%60).padStart(2,'0');
  return 'Ritmo total estimado '+minutes+':'+seconds+' min/km';
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
    const average=bpm(row.avgBpm);
    const averageLabel=average!==null&&Number.isSafeInteger(row.heartRateSamples)&&row.heartRateSamples>0&&row.heartRateSamples<=200000
      ?'FC media '+decimal.format(average)+' lpm':null;
    rows.push({start,label:WORKOUT_SPORTS[row.sport],
      detail:[workoutDate.format(start),observedDuration(end-start),distance,averageLabel,
        observedElapsedRunningPace(row.sport,end-start,d)].filter(Boolean).join(' · ')});
  }
  return Object.freeze(rows.sort((a,b)=>b.start-a.start).map(({label,detail})=>Object.freeze({label,detail})));
}
// Describe only the bounded list received from the server, not the user's
// total activity. Do not sum durations or distances across potential overlaps.
export function connected360WorkoutMix(rows){
  if(!Array.isArray(rows)||rows.length>10)return Object.freeze([]);
  const sports=new Map(),allowed=new Set(Object.values(WORKOUT_SPORTS));
  // Input is already ordered newest first. A sport appears only once,
  // regardless of duplicate observations or overlapping device sources.
  for(const row of rows){
    if(!allowed.has(row?.label)||typeof row.detail!=='string'||!row.detail)return Object.freeze([]);
    if(!sports.has(row.label))sports.set(row.label,Object.freeze({label:row.label,detail:row.detail}));
  }
  return Object.freeze([...sports.values()]);
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
      if(current===entry&&epoch===version){entry.value=value;entry.at=now();}
      return value;
    }).finally(()=>{if(current===entry)entry.pending=null;});
    entry.pending=pending;
    return pending;
  }
  return Object.freeze({read,clear});
}
