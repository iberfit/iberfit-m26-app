import {renderExerciseMedia,renderExerciseMediaCredit} from '../library/exercise-media-ui.js';
import {formatIberfitDate} from '../domain/civil-date.js';

function e(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function fact(label,value){
  return value===null||value===undefined||value===''?'':`<span class="m26-session-detail-fact"><small>${e(label)}</small><strong>${e(value)}</strong></span>`;
}
function sessionMeta(view){
  const duration=view.durationMinutes?`${view.durationMinutes} min`:'Duración por confirmar';
  return `<div class="m26-session-summary-meta"><span>${e(view.modeLabel)}</span><span>${e(duration)}</span></div>`;
}
function renderExercise(exercise,{mediaMap,role}){
  const photo=renderExerciseMedia({
    manifest:mediaMap,
    exercise:{id:exercise.id,name_es:exercise.name},
    role,
    compact:true,
    fallback:true,
    showQuality:role!=='client',
  });
  const details=[
    fact('Series',exercise.sets),
    fact('Repeticiones o tiempo',exercise.reps),
    fact('Descanso',exercise.restSeconds===null?null:`${exercise.restSeconds} s`),
    fact('RPE',exercise.rpe),
    fact('RIR',exercise.rir),
    fact('Ritmo',exercise.tempo),
  ].join('');
  const howTo=(exercise.instructions||[]).length
    ?`<section><h5>Cómo realizarlo</h5><ol>${exercise.instructions.map((text)=>`<li>${e(text)}</li>`).join('')}</ol></section>`
    :'';
  const cues=(exercise.cues||[]).length
    ?`<section><h5>Puntos técnicos</h5><ul>${exercise.cues.map((text)=>`<li>${e(text)}</li>`).join('')}</ul></section>`
    :'';
  const precautions=(exercise.precautions||[]).length
    ?`<section><h5>Precauciones</h5><ul>${exercise.precautions.map((text)=>`<li>${e(text)}</li>`).join('')}</ul></section>`
    :'';
  const technical=howTo||cues||precautions
    ?`<details class="m26-session-technique"><summary>Técnica e indicaciones</summary><div>${howTo}${cues}${precautions}</div></details>`
    :'';
  return `<div class="m26-session-preview-exercise" data-preview-exercise="${e(exercise.id)}">${photo}<div class="m26-session-preview-copy"><h4>${e(exercise.name)}</h4>${exercise.equipment?`<p class="m26-session-exercise-equipment">Material · ${e(exercise.equipment)}</p>`:''}<div class="m26-session-prescription-facts">${details}</div>${exercise.alternative?`<p class="m26-session-alternative"><strong>Alternativa:</strong> ${e(exercise.alternative)}</p>`:''}${technical}</div></div>`;
}
export function renderSessionPrescription(view,{mediaMap=null,role='client'}={}){
  if(!view?.canInspect)return '';
  if(!view.blocks?.length)return '<p class="m26-empty-copy">El entrenador aún no ha incluido ejercicios en la sesión.</p>';
  const body=view.blocks.map((block)=>{
    const heading=block.kind==='group'
      ?`${e(block.title)}${block.rounds?` · ${e(block.rounds)} rondas`:''}`
      :`Ejercicio ${e(block.number)}`;
    return `<li class="m26-session-preview-block" data-session-preview-block><h3>${heading}</h3>${block.exercises.map((ex)=>renderExercise(ex,{mediaMap,role})).join('')}</li>`;
  }).join('');
  return `<ol class="m26-session-preview-list">${body}</ol>${mediaMap?renderExerciseMediaCredit({compact:true}):''}`;
}
export function renderClientSessionPresentation(item,{mediaMap=null}={}){
  const view=item?.sessionView;
  if(!view?.visible)return '';
  const scheduled=view.mode!=='guided';
  const when=view.startAt?formatIberfitDate(view.startAt,{includeTime:'auto'}):'';
  if(scheduled){
    // No se generan ni incorporan a la vista del cliente datos de prescripción.
    return `<article class="m26-client-content-card m26-client-session-card is-scheduled" data-client-content="session" data-session-presentation="scheduled"><div class="m26-client-session-heading"><p class="m26-eyebrow">Sesión programada</p><h3>${e(view.title)}</h3>${sessionMeta(view)}${when?`<p class="m26-session-scheduled-at">${e(when)}</p>`:''}</div><p class="m26-session-summary-hint">Tu entrenador dirigirá la sesión. Los ejercicios se gestionan durante el entrenamiento.</p></article>`;
  }
  const start=view.canStart
    ?`<button type="button" class="m26-primary-action m26-client-session-action" aria-label="Comenzar entrenamiento: ${e(view.title)}" data-workflow-action="start-published-session" data-entity-id="${e(view.id)}">Comenzar entrenamiento</button>`
    :'<p class="m26-notice is-warning" role="status">No se puede iniciar: faltan ejercicios disponibles. Contacta con tu entrenador.</p>';
  return `<article class="m26-client-content-card m26-client-session-card is-guided" data-client-content="session" data-session-presentation="guided"><div class="m26-client-session-heading"><p class="m26-eyebrow">Entrenamiento guiado</p><h3>${e(view.title)}</h3>${sessionMeta(view)}</div><details class="m26-session-preview-disclosure"><summary>Ver sesión <span aria-hidden="true">↓</span></summary><div class="m26-session-preview-content"><p class="m26-session-preview-intro">Revisa ejercicios, series, repeticiones, descansos y referencias visuales antes de comenzar.</p>${renderSessionPrescription(view,{mediaMap,role:'client'})}<div class="m26-session-preview-start">${start}<small>Consultar el contenido no inicia el entrenamiento. La disponibilidad se comprueba al empezar.</small></div></div></details></article>`;
}
export function renderCoachSessionPreview(view,{mediaMap=null}={}){
  if(!view)return '';
  const description=view.mode==='guided'
    ?'Cliente: verá la ficha completa al abrir «Ver sesión» y podrá iniciarla.'
    :'Cliente: verá solo el título, duración y cita. La prescripción es interna del entrenador.';
  return `<details class="m26-coach-session-detail"><summary>Revisar prescripción y vista del cliente</summary><div class="m26-session-preview-content"><p class="m26-eyebrow">Así lo verá el cliente</p><h4>${view.mode==='guided'?'Contenido completo que recibirá el cliente':'Resumen que recibirá el cliente'}</h4><p class="m26-eyebrow">${e(view.modeLabel)} · ${view.durationMinutes?e(`${view.durationMinutes} min`):'Duración por confirmar'}</p><p>${e(description)}</p>${renderSessionPrescription(view,{mediaMap,role:'coach'})}</div></details>`;
}
