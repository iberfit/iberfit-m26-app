import {formatSleepDuration} from './duration-format.js';
const e=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function num(x,min,max){return typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:null;}
export function clientHealthSnapshot(wearables){
  const s=wearables?.summary;
  if(!s||!Number.isSafeInteger(s.daysWithData)||s.daysWithData<1||s.daysWithData>7)return null;
  return Object.freeze({days:s.daysWithData,steps:num(s.metrics?.steps,0,200000),
    sleep:num(s.metrics?.sleepMinutes,0,1440),rest:num(s.metrics?.restingHeartRate,25,240)});
}
/** Confirmed owner-scoped daily summaries; never infer the physical watch or auto-change loads. */
export function renderClientTodayHealth(wearables){
  const m=clientHealthSnapshot(wearables);
  const metrics=m?'<div class="m26-client-health-metrics">'+[
    ['Pasos medios',m.steps==null?'Sin dato':Math.round(m.steps).toLocaleString('es-CL')],
    ['Sueño medio',m.sleep==null?'Sin dato':formatSleepDuration(m.sleep)],
    ['FC en reposo media',m.rest==null?'Sin dato':Math.round(m.rest)+' lpm'],
  ].map(([k,v])=>'<div class="m26-client-health-metric"><span>'+e(k)+'</span><strong>'+e(v)+'</strong></div>').join('')+'</div>':'';
  return '<section class="m26-client-health" data-m26-client-health aria-label="Tu actividad y salud">'
    +'<div class="m26-client-health-heading"><div><p class="m26-eyebrow">Actividad y salud</p>'
    +'<h2>Tu actividad, a la vista</h2><p>'+(m?'Tus mediciones autorizadas ya forman parte de IBERFIT.':'Cuando compartas datos de salud, los verás aquí al abrir IBERFIT.')
    +'</p></div><span class="m26-client-health-status">'+(m?m.days+' día'+(m.days===1?'':'s')+' con datos':'Sin datos todavía')+'</span></div>'+metrics
    +'<div class="m26-client-health-footer"><small>'+(m?'Medias de los últimos 7 días. Los datos no identifican por sí solos el reloj ni modifican el entrenamiento.':'La conexión es opcional. Tu entrenamiento también funciona sin reloj.')
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
