import {formatSleepDuration} from './duration-format.js';

// A disclosure, not a simulated connection. Native buttons may only be attached
// by the wearable controller when the actual bridge AND production policy permit it.
const SOURCE_LABELS=Object.freeze({
  apple_health:'Apple Watch y Salud',
  health_connect:'Android y Samsung',
  garmin_connect:'Garmin',
  strava:'Strava',
});
const MAIN_SOURCES=Object.freeze(Object.keys(SOURCE_LABELS));
const escapeHtml=(value)=>String(value??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');

export function deviceSourceChoice(item){
  const enabled=Boolean(item?.nativeReady&&item?.usableNow);
  const key=String(item?.key||'');
  const title=SOURCE_LABELS[key]||item?.label||'Otra fuente';
  const cloud=item?.mode==='server_oauth';
  return `<article class="m26-device-choice m26-wearable-source" data-provider="${escapeHtml(key)}">
    <div><h3>${escapeHtml(title)}</h3>
    <p>${enabled?'Disponible: autoriza los datos en la pantalla oficial.':cloud?'Vinculación de cuenta aún no certificada.':'La conexión directa requiere una aplicación y permisos certificados.'}</p></div>
    <span class="m26-device-availability ${enabled?'is-ready':'is-pending'}">${enabled?'Disponible':'No disponible por ahora'}</span>
  </article>`;
}
export function deviceConfirmedStats(summary){
  if(!summary||Number(summary.daysWithData||0)<=0)return '';
  const steps=summary.metrics?.steps;
  const sleep=formatSleepDuration(summary.metrics?.sleepMinutes);
  const resting=summary.metrics?.restingHeartRate;
  return `<div class="m26-device-confirmed-stats" aria-label="Resumen confirmado de los últimos siete días">
    <div><span>Pasos medios</span><strong>${escapeHtml(steps==null?'Sin dato':Math.round(steps).toLocaleString('es-CL'))}</strong></div>
    <div><span>Sueño medio</span><strong>${escapeHtml(sleep??'Sin dato')}</strong></div>
    <div><span>FC en reposo media</span><strong>${escapeHtml(resting==null?'Sin dato':`${resting} lpm`)}</strong></div>
  </div>`;
}
export function renderClientDeviceHub(wearable,{importer='',deviceSummary='',dailyRecords='',connectionActions='',coveragePanel=''}={}){
  const summary=wearable?.summary||{};
  const providers=Array.isArray(wearable?.providers)?wearable.providers:[];
  const connections=Array.isArray(wearable?.connections)?wearable.connections:[];
  const active=connections.filter(item=>['conectado','connected'].includes(String(item?.status||item?.state||'')));
  // An imported file or an unverified legacy row must never be marketed as an automatically synced wearable.
  const automatic=active.filter(item=>['certified_native','certified_oauth'].includes(item.mode)
    &&item.policy?.productionAllowed===true
    &&providers.some(p=>p.key===item.provider&&p.usableNow===true));
  const importCount=active.length-automatic.length;
  const status=automatic.length
    ?`${automatic.length} fuente${automatic.length===1?'':'s'} vinculada${automatic.length===1?'':'s'}`
    :importCount?'Datos incorporados · sin enlace automático'
    :Number(summary.daysWithData||0)>0?'Datos de salud recibidos':'Sin mediciones confirmadas';
  const primary=MAIN_SOURCES.map(key=>providers.find(item=>item.key===key)).filter(Boolean);
  const others=providers.filter(item=>item.key!=='normalized_file'&&!MAIN_SOURCES.includes(item.key));
  const directAvailable=wearable?.productionNativeReady===true||providers.some(item=>item.usableNow&&item.nativeReady);
  const stats=deviceConfirmedStats(summary);
  return `<section class="m26-device-hub" data-m26-device-hub aria-labelledby="m26-device-hub-heading">
    <header class="m26-device-hub-heading">
      <div><p class="m26-eyebrow">TU ACTIVIDAD · IBERFIT</p>
      <h2 id="m26-device-hub-heading">Tus datos, a la vista</h2>
      <p>Lo que compartes con IBERFIT se muestra aquí sin buscar ajustes. Estas mediciones no sustituyen cómo te sientes ni cambian tu plan automáticamente.</p></div>
      <span class="m26-device-link-state" role="status">${escapeHtml(status)}</span>
    </header>
    ${stats||'<p class="m26-device-hub-empty">Aquí verás tus pasos, sueño y recuperación cuando existan datos confirmados. No es obligatorio conectar nada.</p>'}
    ${stats?`<p class="m26-data-footnote">Medias de los últimos siete días · ${escapeHtml(summary.daysWithData||0)} día(s) con datos. El reloj físico no está verificado.</p>`:''}
    <details class="m26-device-link-picker" data-m26-device-link-picker${wearable?.productionNativeReady===true&&!active.length&&Number(summary.daysWithData||0)===0?' open':''}>
      <summary class="m26-device-link-cta">${stats?'Conexión y otras fuentes':'Conectar mi actividad'} <span aria-hidden="true">↗</span></summary>
      <div class="m26-device-hub-body">
        <h3>¿Dónde registras tu actividad?</h3>
        ${wearable?.productionNativeReady===true?'<p class="m26-device-native-explanation">IBERFIT ha detectado una aplicación Android compatible. Puedes elegir las categorías que compartirás; después se sincronizarán al abrir IBERFIT. La autorización de Android se solicita por separado y puedes revocarla.</p>':''}
        <p>${directAvailable?'Selecciona una fuente certificada. Tú autorizas los permisos.':'La sincronización directa aún no está disponible en esta versión web. Estas opciones muestran el estado real; no solicitaremos claves, datos ni permisos hasta que exista una integración certificada.'}</p>
        <div class="m26-device-choice-list">${primary.map(deviceSourceChoice).join('')}</div>
        <details class="m26-device-more-sources"><summary>Otras fuentes</summary><div class="m26-device-choice-list">${others.map(deviceSourceChoice).join('')}</div></details>
      </div>
    </details>
    <details class="m26-device-import-advanced">
      <summary>Importar un archivo (opción avanzada)</summary>
      <div class="m26-device-hub-body"><p>Un archivo permite incorporar registros manualmente, pero no conecta el reloj ni activa una sincronización automática.</p>${importer}</div>
    </details>
    <details class="m26-device-data-management">
      <summary>Historial de datos y permisos</summary>
      <div class="m26-device-hub-body">${deviceSummary}${dailyRecords}${connectionActions}${coveragePanel}</div>
    </details>
  </section>`;
}
