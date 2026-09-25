export * from './echarts-element.js';
export * from './data-trust.js';
export {__longitudinalUiInternals} from './longitudinal-ui.js';

import {renderLongitudinalDataExperience as renderBaseLongitudinalDataExperience} from './longitudinal-ui.js';

const MATERIAL_ADHERENCE_DELTA=0.10;

function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function finiteRate(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)&&number>=0&&number<=1?number:null;
}

function roundPoints(value){
  return Math.round(value*1000)/10;
}

function professionalRole(role){
  return ['coach','admin'].includes(String(role||'client').trim().toLowerCase());
}

function trajectoryResult({kind,level,title,detail,action,d7,d28,d90,recentDelta,longDelta}){
  return Object.freeze({
    available:true,
    kind,
    level,
    title,
    detail,
    action,
    d7,
    d28,
    d90,
    recentDelta,
    longDelta,
    recentDeltaPoints:roundPoints(recentDelta),
    longDeltaPoints:roundPoints(longDelta),
    thresholdPoints:roundPoints(MATERIAL_ADHERENCE_DELTA),
    provenance:'confirmed-adherence-7-28-90',
  });
}

export function deriveAdherenceTrajectory(adherence={}){
  const d7=finiteRate(adherence?.d7);
  const d28=finiteRate(adherence?.d28);
  const d90=finiteRate(adherence?.d90);

  if(d7===null||d28===null||d90===null){
    return Object.freeze({
      available:false,
      kind:'insufficient',
      level:'neutral',
      title:'Trayectoria pendiente de datos suficientes',
      detail:'Se necesitan valores confirmados de 7, 28 y 90 días para interpretar cambios de adherencia.',
      action:'Mantener el dato como ausente hasta disponer de las tres ventanas.',
      provenance:'confirmed-adherence-7-28-90',
    });
  }

  const recentDelta=d7-d28;
  const longDelta=d28-d90;

  if(recentDelta<=-MATERIAL_ADHERENCE_DELTA){
    return trajectoryResult({
      kind:'recent_drop',
      level:'warning',
      title:'Descenso reciente de adherencia',
      detail:`La adherencia de 7 días está ${roundPoints(Math.abs(recentDelta))} pp por debajo de la referencia de 28 días.`,
      action:'Revisar barreras recientes de agenda, ejecución o comprensión antes de modificar el plan.',
      d7,d28,d90,recentDelta,longDelta,
    });
  }

  if(recentDelta>=MATERIAL_ADHERENCE_DELTA){
    return trajectoryResult({
      kind:'recent_improvement',
      level:'success',
      title:'Mejora reciente de adherencia',
      detail:`La adherencia de 7 días está ${roundPoints(recentDelta)} pp por encima de la referencia de 28 días.`,
      action:'Confirmar qué ha facilitado la continuidad y mantenerlo si sigue siendo sostenible.',
      d7,d28,d90,recentDelta,longDelta,
    });
  }

  if(longDelta<=-MATERIAL_ADHERENCE_DELTA){
    return trajectoryResult({
      kind:'below_long_term',
      level:'warning',
      title:'Adherencia por debajo del patrón de 90 días',
      detail:`La ventana de 28 días está ${roundPoints(Math.abs(longDelta))} pp por debajo de la referencia de 90 días.`,
      action:'Revisar si la pérdida de continuidad se mantiene y acordar una intervención concreta con el cliente.',
      d7,d28,d90,recentDelta,longDelta,
    });
  }

  if(longDelta>=MATERIAL_ADHERENCE_DELTA){
    return trajectoryResult({
      kind:'above_long_term',
      level:'success',
      title:'Adherencia por encima del patrón de 90 días',
      detail:`La ventana de 28 días está ${roundPoints(longDelta)} pp por encima de la referencia de 90 días.`,
      action:'Mantener los facilitadores actuales y comprobar que la mejora continúa sin añadir fricción.',
      d7,d28,d90,recentDelta,longDelta,
    });
  }

  return trajectoryResult({
    kind:'stable',
    level:'neutral',
    title:'Adherencia estable',
    detail:'Las diferencias entre 7, 28 y 90 días permanecen dentro del margen de variación definido.',
    action:'Mantener el seguimiento habitual y priorizar otros datos si requieren una decisión.',
    d7,d28,d90,recentDelta,longDelta,
  });
}

function trajectoryPanel(trajectory){
  if(!trajectory?.available)return '';
  const badge=trajectory.level==='warning'
    ?'Revisar'
    :trajectory.level==='success'
      ?'Evolución favorable'
      :'Estable';
  return `<section class="m26-panel m26-panel-soft m26-data-adherence-trajectory" aria-label="Lectura profesional de trayectoria de adherencia">
    <div class="m26-panel-heading">
      <div><p class="m26-eyebrow">Adherencia · lectura profesional</p><h3>${escapeHtml(trajectory.title)}</h3></div>
      <span class="m26-badge is-${escapeHtml(trajectory.level)}">${escapeHtml(badge)}</span>
    </div>
    <p>${escapeHtml(trajectory.detail)}</p>
    <p><strong>Siguiente decisión:</strong> ${escapeHtml(trajectory.action)}</p>
    <small>Señal determinista basada en ventanas confirmadas 7/28/90. No modifica el plan automáticamente.</small>
  </section>`;
}

export function renderLongitudinalDataExperience(aggregate,{role='client'}={}){
  const base=renderBaseLongitudinalDataExperience(aggregate,{role});
  if(!base||!professionalRole(role))return base;
  return `${base}${trajectoryPanel(deriveAdherenceTrajectory(aggregate?.adherence))}`;
}

export const __adherenceTrajectoryInternals=Object.freeze({
  MATERIAL_ADHERENCE_DELTA,
  finiteRate,
  roundPoints,
  professionalRole,
  trajectoryPanel,
});