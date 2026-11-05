// IBERFIT U63 · bounded, owner-scoped daily context; no extra requests or medical scoring.
import {formatSleepDuration} from '../wearables/duration-format.js';

const DAY=/^\d{4}-\d{2}-\d{2}$/u;
const CHECKIN_FIELDS=Object.freeze([
  ['energy','Energía'],['sleep','Sueño percibido'],['stress','Estrés'],
  ['pain','Dolor'],['fatigue','Fatiga'],['motivation','Motivación'],
]);
const ACTIVITY_FIELDS=Object.freeze([
  ['steps','Pasos',0,200000],['activeMinutes','Actividad',0,1440],
  ['sleepMinutes','Sueño registrado',0,1440],
  ['workoutMinutes','Deporte',0,1440],
]);
function civilDate(value){
  const date=String(value??'');
  if(!DAY.test(date))return null;
  const parsed=new Date(date+'T12:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null;
}
function chileDate(value){
  if(typeof value==='string'&&DAY.test(value))return civilDate(value);
  if(value===null||value===undefined||value==='')return null;
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(date).filter(part=>part.type!=='literal')
    .map(part=>[part.type,part.value]));
  return civilDate(parts.year+'-'+parts.month+'-'+parts.day);
}
function ageDays(day,today){
  if(!day||!today)return null;
  return Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000);
}
function value(value,min,max){
  return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
}
function metricRows(rows,day){
  const onDay=rows.filter(row=>row.date===day);
  const metrics={};let ambiguous=false;
  for(const [key,,min,max] of ACTIVITY_FIELDS){
    const values=[...new Set(onDay.map(row=>value(row.metrics?.[key],min,max))
      .filter(item=>item!==null))];
    metrics[key]=values.length===1?values[0]:null;
    if(values.length>1)ambiguous=true;
  }
  return {metrics:Object.freeze(metrics),ambiguous};
}
/** Inputs are already authorized in route-view-model; double-fence clientId. */
export function buildClientDayContext({clientId,progress=null,wearables=null,now=new Date()}={}){
  const id=String(clientId||'').trim();
  if(!id)throw new Error('M26_DAY_CONTEXT_CLIENT_REQUIRED');
  const today=chileDate(now);
  if(!today)throw new Error('M26_DAY_CONTEXT_DATE_REQUIRED');
  const scopedProgress=String(progress?.clientId||'')===id?progress:null;
  const checkinDay=chileDate(scopedProgress?.latestCheckinAt);
  const checkinAge=ageDays(checkinDay,today);
  const checkinCurrent=checkinAge!==null&&checkinAge>=0&&checkinAge<=6;
  const feelings=Object.fromEntries(CHECKIN_FIELDS.map(([key])=>[
    key,checkinCurrent?value(scopedProgress?.latestCheckin?.[key],0,10):null,
  ]));
  const availableFeelings=Object.values(feelings).some(item=>item!==null);
  const records=(Array.isArray(wearables?.dailyRecords)?wearables.dailyRecords:[])
    .filter(row=>row&&String(row.clientId||'')===id&&civilDate(row.date)===row.date)
    .filter(row=>{const days=ageDays(row.date,today);return days!==null&&days>=0&&days<=6;});
  // A newer, validly dated but empty sync row must not erase earlier measured
  // evidence. Never average conflicting providers or turn missing values into 0.
  const dates=[...new Set(records.map(row=>row.date))].sort((a,b)=>b.localeCompare(a));
  const dated=dates.map(date=>({date,...metricRows(records,date)}));
  const newest=dated[0]||null;
  const lastValid=dated.find(row=>Object.values(row.metrics).some(item=>item!==null))||null;
  const lastDay=lastValid?.date||newest?.date||null;
  const day=lastValid||newest||{metrics:Object.fromEntries(
    ACTIVITY_FIELDS.map(([key])=>[key,null])),ambiguous:false};
  const observed=Boolean(lastValid);
  // Keep the newest day's disagreement visible even if the latest usable
  // measurement came from an earlier day.
  const ambiguous=Boolean(newest?.ambiguous||day.ambiguous);
  const historical=(Array.isArray(wearables?.historicalRecords)?wearables.historicalRecords:[])
    .filter(row=>row&&String(row.clientId||'')===id&&civilDate(row.date)===row.date)
    .filter(row=>{const days=ageDays(row.date,today);return days!==null&&days>=7;})
    .sort((a,b)=>b.date.localeCompare(a.date))[0]?.date||null;
  const lastTraining=chileDate(scopedProgress?.lastExecutionAt);
  const lastTrainingAge=ageDays(lastTraining,today);
  const confirmedSessions=Number.isSafeInteger(scopedProgress?.completedSessions)
    &&scopedProgress.completedSessions>=0?scopedProgress.completedSessions:null;
  const volumeTrend=value(scopedProgress?.volumeDelta,-100,10000);
  return Object.freeze({
    asOf:today,
    wellbeing:Object.freeze({
      date:checkinDay&&checkinAge>=0?checkinDay:null,
      status:availableFeelings?(checkinAge===0?'today':'recent'):'missing',
      metrics:Object.freeze(feelings),
    }),
    movement:Object.freeze({
      date:lastDay||historical,
      status:observed?(lastDay===today?'today':'recent'):'missing',
      metrics:day.metrics,ambiguous,
    }),
    training:Object.freeze({
      completed28:confirmedSessions,
      lastDate:lastTrainingAge!==null&&lastTrainingAge>=0?lastTraining:null,
      volumeDelta:volumeTrend,
    }),
  });
}
function esc(text){return String(text??'').replaceAll('&','&amp;')
  .replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');}
function dateLabel(date){return civilDate(date)?date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4):'Fecha no disponible';}
function metric(label,display){return '<div class="m26-client-day-metric"><dt>'+esc(label)
  +'</dt><dd>'+esc(display)+'</dd></div>';}
export function deriveClientDayNextAction(snapshot){
  if(!snapshot||!['today','recent'].includes(snapshot.wellbeing?.status))
    return Object.freeze({area:'actividad',label:'Registrar cómo estoy',
      detail:'Tu registro de bienestar es voluntario y aporta contexto.'});
  return Object.freeze({area:'progreso',label:'Ver mi evolución',
    detail:'Tu bienestar confirmado es contexto, no un diagnóstico automático.'});
}
export function renderClientDayContext(snapshot){
  if(!snapshot)return '';
  const wellbeing=snapshot.wellbeing||{};
  const movement=snapshot.movement||{};
  const training=snapshot.training||{};
  const next=deriveClientDayNextAction(snapshot);
  const feelingData=CHECKIN_FIELDS.filter(([key])=>value(wellbeing.metrics?.[key],0,10)!==null);
  const activityData=ACTIVITY_FIELDS.filter(([key,,min,max])=>value(movement.metrics?.[key],min,max)!==null);
  const wellbeingCopy=wellbeing.status==='today'?'Tu registro de hoy'
    :wellbeing.status==='recent'?'Último registro: '+dateLabel(wellbeing.date)
    :wellbeing.date?'Registro del '+dateLabel(wellbeing.date)+' sin valores comparables'
      :'Sin registro de bienestar en los últimos 7 días';
  const activityAge=ageDays(movement.date,snapshot.asOf);
  const activityCopy=movement.status==='today'?'Mediciones del día de hoy'
    :movement.status==='recent'?'Último día con datos: '+dateLabel(movement.date)
      :movement.date&&activityAge!==null&&activityAge>=0&&activityAge<=6
        ?'Datos del '+dateLabel(movement.date)+' sin valores comparables'
        :movement.date?'Datos históricos del '+dateLabel(movement.date)+'; no son de hoy'
          :'Sin datos recientes de dispositivos';
  const activityMetrics=activityData.map(([key,label])=>{
    const n=movement.metrics[key];
    return metric(label,key==='steps'?Math.round(n).toLocaleString('es-CL')
      :key==='sleepMinutes'?formatSleepDuration(n):Math.round(n)+' min');
  }).join('');
  const feelingMetrics=feelingData.map(([key,label])=>
    metric(label,wellbeing.metrics[key]+' / 10')).join('');
  const lastTraining=training.lastDate?'Última sesión: '+dateLabel(training.lastDate)
    :'Sin fecha reciente confirmada';
  const trainingMetrics=Number.isSafeInteger(training.completed28)?metric('Sesiones confirmadas · 28 días',training.completed28):'';
  const trend=Number.isFinite(training.volumeDelta)
    ?metric('Carga comparable', (training.volumeDelta>0?'+':'')+training.volumeDelta+' %')
    :'';
  return '<section class="m26-client-day-context" data-m26-client-day-context aria-labelledby="m26-client-day-heading">'
    +'<header class="m26-client-day-heading"><div><p class="m26-eyebrow">TU VIDA ACTIVA</p>'
    +'<h2 id="m26-client-day-heading">Tu día, con perspectiva</h2>'
    +'<p>Lo que has registrado, lo que sabemos y lo que todavía no sabemos.</p></div>'
    +'<small>Sin puntuaciones automáticas de salud</small></header>'
    +'<div class="m26-client-day-grid">'
    +'<article class="m26-client-day-column"><h3>Cómo te sientes</h3><p>'+esc(wellbeingCopy)+'</p>'
    +(feelingMetrics?'<dl class="m26-client-day-metrics">'+feelingMetrics+'</dl>'
      :'<p class="m26-client-day-empty">Tu percepción importa tanto como las métricas.</p>')+'</article>'
    +'<article class="m26-client-day-column"><h3>Tu movimiento</h3><p>'+esc(activityCopy)+'</p>'
    +(activityMetrics?'<dl class="m26-client-day-metrics">'+activityMetrics+'</dl>'
      :'<p class="m26-client-day-empty">Puedes seguir entrenando sin conectar un reloj.</p>')
    +(movement.ambiguous?'<small>Hay valores diferentes entre fuentes. Revisa el detalle antes de compararlos.</small>':'')+'</article>'
    +'<article class="m26-client-day-column"><h3>Tu forma, con datos</h3><p>'+esc(lastTraining)+'</p>'
    +(trainingMetrics||trend?'<dl class="m26-client-day-metrics">'+trainingMetrics+trend+'</dl>'
      :'<p class="m26-client-day-empty">Tu evolución aparecerá con entrenamientos confirmados.</p>')+'</article>'
    +'</div><footer class="m26-client-day-footer"><span>Bienestar percibido, actividad y entrenamiento son fuentes distintas; no cambian tu plan por sí solas.</span>'
    +'<p class="m26-client-day-next">'+esc(next.detail)+'</p>'
    +'<nav aria-label="Explorar tu día"><button type="button" class="m26-primary-action" data-m26-area="'+esc(next.area)+'">'+esc(next.label)+'</button>'
    +'<button type="button" data-m26-area="'+(next.area==='progreso'?'actividad':'progreso')+'">'+(next.area==='progreso'?'Mi bienestar y actividad':'Ver evolución')+'</button></nav></footer></section>';
}
