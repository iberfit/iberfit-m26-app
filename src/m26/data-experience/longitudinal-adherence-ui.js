import {renderLongitudinalDataExperience as renderBaseLongitudinalDataExperience} from './longitudinal-ui.js';
import {deriveAdherenceTrajectory} from './adherence-trajectory.js';

function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function professionalRole(role){
  return ['coach','admin'].includes(String(role||'client').trim().toLowerCase());
}

function tone(level){
  if(level==='warning')return 'warning';
  if(level==='success')return 'success';
  return 'neutral';
}

function trajectoryPanel(trajectory){
  if(!trajectory?.available)return '';
  return `<section class="m26-panel m26-panel-soft m26-data-adherence-trajectory" aria-label="Lectura profesional de trayectoria de adherencia">
    <div class="m26-panel-heading">
      <div><p class="m26-eyebrow">Adherencia · lectura profesional</p><h3>${escapeHtml(trajectory.title)}</h3></div>
      <span class="m26-badge is-${escapeHtml(tone(trajectory.level))}">${escapeHtml(trajectory.level==='warning'?'Revisar':trajectory.level==='success'?'Evolución favorable':'Estable')}</span>
    </div>
    <p>${escapeHtml(trajectory.detail)}</p>
    <p><strong>Siguiente decisión:</strong> ${escapeHtml(trajectory.action)}</p>
    <small>Señal determinista basada en ventanas confirmadas 7/28/90. No modifica el plan automáticamente.</small>
  </section>`;
}

export function renderLongitudinalDataExperience(aggregate,{role='client'}={}){
  const base=renderBaseLongitudinalDataExperience(aggregate,{role});
  if(!base||!professionalRole(role))return base;
  const trajectory=deriveAdherenceTrajectory(aggregate?.adherence);
  return `${base}${trajectoryPanel(trajectory)}`;
}

export const __longitudinalAdherenceUiInternals=Object.freeze({
  professionalRole,
  tone,
  trajectoryPanel,
});
