import {formatSleepDuration} from './duration-format.js';
const e=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function num(x,min,max){return typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:null;}
export function clientHealthSnapshot(wearables){
  const s=wearables?.summary;
  if(!s||!Number.isSafeInteger(s.daysWithData)||s.daysWithData<1||s.daysWithData>7)return null;
  // These are server-confirmed seven-day descriptive means, not today's live
  // measurements. Never compute recovery scores or show absent data as zero.
  const metrics={
    steps:num(s.metrics?.steps,0,200000),
    sleep:num(s.metrics?.sleepMinutes,0,1440),
    rest:num(s.metrics?.restingHeartRate,25,240),
    active:num(s.metrics?.activeMinutes,0,1440),
    workouts:num(s.metrics?.workoutMinutes,0,1440),
  };
  // An upstream count with zero usable metrics is not proof of a health
  // measurement. Show an honest empty state; preserve measured numeric zero.
  if(Object.values(metrics).every(value=>value===null))return null;
  return Object.freeze({days:s.daysWithData,...metrics});
}
/** Confirmed owner-scoped daily summaries; never infer the physical watch or auto-change loads. */
export function renderClientTodayHealth(wearables){
  const m=clientHealthSnapshot(wearables);
  const date=String(wearables?.lastHistoricalDate||'');
  const historicalDate=/^\d{4}-\d{2}-\d{2}$/.test(date)
    ?date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4):null;
  const metrics=m?'<div class="m26-client-health-metrics">'+[
    ['Pasos medios',m.steps==null?'Sin dato':Math.round(m.steps).toLocaleString('es-CL')],
    ['Sueño medio',m.sleep==null?'Sin dato':formatSleepDuration(m.sleep)],
    ['FC en reposo media',m.rest==null?'Sin dato':Math.round(m.rest)+' lpm'],
    ...(m.active==null?[]:[['Actividad diaria media',Math.round(m.active)+' min']]),
    ...(m.workouts==null?[]:[['Entrenamiento diario medio',Math.round(m.workouts)+' min']]),
  ].map(([k,v])=>'<div class="m26-client-health-metric"><span>'+e(k)+'</span><strong>'+e(v)+'</strong></div>').join('')+'</div>':'';
  return '<section class="m26-client-health'+(m?'':' is-empty')+'" data-m26-client-health aria-label="Tu actividad y salud">'
    +'<div class="m26-client-health-heading"><div><p class="m26-eyebrow">Actividad y salud</p>'
    +'<h2>'+(m?'Tu actividad, a la vista':historicalDate?'Tu última actividad registrada':'Actividad a tu ritmo')+'</h2><p>'+(m?'Tus mediciones autorizadas ya forman parte de IBERFIT.':historicalDate?'No hay mediciones de los últimos 7 días. Puedes consultar tus registros anteriores y revisar la conexión.':'Puedes entrenar sin reloj. Si decides compartir datos compatibles, podrás verlos aquí.')
    +'</p></div><span class="m26-client-health-status">'+(m?'<strong>'+m.days+'</strong> Días con datos':historicalDate?'Último registro '+e(historicalDate):'Sin datos todavía')+'</span></div>'+metrics
    +'<div class="m26-client-health-footer"><small>'+(m?'Medias de los últimos 7 días. Los datos no identifican por sí solos el reloj ni modifican el entrenamiento.':historicalDate?'Historial anterior: no representa tu estado actual. La conexión es opcional y no modifica los entrenamientos.':'La conexión es opcional. Tu entrenamiento también funciona sin reloj.')
    +'</small><button type="button" data-m26-area="actividad">'+(m?'Ver mi actividad':'Ver conexión y actividad')+'</button></div></section>';
}
export function renderSessionHealthContext(wearables){
  const m=clientHealthSnapshot(wearables);
  if(!m)return '';
  const facts=[m.sleep==null?null:'Sueño medio '+formatSleepDuration(m.sleep),m.rest==null?null:'FC en reposo media '+Math.round(m.rest)+' lpm'].filter(Boolean);
  if(!facts.length)return '';
  return '<aside class="m26-session-health-context" data-session-health-context aria-label="Contexto reciente antes de entrenar">'
    +'<strong>Tu contexto reciente</strong><p>'+e(facts.join(' · '))
    +'. Son datos de los últimos 7 días, no mediciones en directo. No cambian tu sesión. Cuéntale al Coach cómo te encuentras hoy.</p></aside>';
}
