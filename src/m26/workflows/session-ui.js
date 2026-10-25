import { currentExerciseSubstitutionScope,executionStructureUndoState,currentStep,nextExecutionStep,executionResultForStep,skippedSetForStep,hasNextExecutionStep,previousSetDraftValues,plannedSetDraftValues } from './session-execution.js';
import {exerciseMemoryDraftSuggestion,validateSessionDraft} from './session-builder.js';
import { executionElapsedMs,formatDuration,restRemainingSeconds } from './session-timer.js';
import {renderExerciseMedia,renderExerciseMediaCredit} from '../library/exercise-media-ui.js';
import {exerciseDisplayName} from '../exercises/names.js';
import {exerciseMeasurementProfile,metricPrescriptionSummary} from '../exercises/measurement-profiles.js';
import {runningPrescriptionAdvisories} from '../exercises/running-prescription-feedback.js';
import {swimmingPrescriptionAdvisories} from '../exercises/swimming-prescription-feedback.js';
import {renderSessionHealthContext} from '../wearables/client-health-snapshot.js';
import {deriveLiveSessionIntelligence} from '../intelligence/live-session-intelligence.js';
import {renderGuidanceTrigger} from '../guidance/contextual-guidance.js';
import {sessionRejectedSyncOutcome} from './session-sync-recovery-ui.js';
import {renderActionState} from '../ui/action-state.js';
function e(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function previousSetSummary(values){
  return [
    values?.reps!==null&&values?.reps!==undefined&&String(values.reps).trim()!==''?`${values.reps} reps`:null,
    values?.seconds?`${values.seconds} s`:null,
    values?.distanceKm?`${values.distanceKm} km`:null,
    values?.distanceM?`${values.distanceM} m`:null,
    values?.pacePer100M?`${values.pacePer100M} min/100 m (medido)`:null,
    values?.load||null,
    values?.rpe?`RPE ${values.rpe}`:null,
    values?.rir!=null&&Number.isFinite(Number(values.rir))?`RIR ${values.rir}`:null,
  ].filter(Boolean).join(' · ')||'Serie registrada';
}
function coachQuickRpeValues(value){
  // A missing prescription is not RPE 0; offer neutral choices without inventing an objective.
  const empty=value===null||value===undefined||(typeof value==='string'&&!value.trim());
  const raw=empty?NaN:Number(value);
  const target=Number.isFinite(raw)?Math.max(1,Math.min(10,Math.round(raw*2)/2)):7;
  const candidates=[target-1,target,target+1,target-2,target+2]
    .filter((item)=>item>=1&&item<=10);
  return [...new Set(candidates)].slice(0,3).sort((a,b)=>a-b);
}
function currentSetResultSummary(result){
  return [
    result?.reps!=null?`${result.reps} rep${Number(result.reps)===1?'':'s'}`:null,
    result?.seconds!=null?`${result.seconds} s`:null,
    result?.distanceKm!=null?`${result.distanceKm} km`:null,
    result?.distanceM!=null?`${result.distanceM} m`:null,
    result?.avgSpeedKmh!=null?`${result.avgSpeedKmh} km/h`:null,
    result?.paceMinPerKm?`${result.paceMinPerKm} min/km`:null,
    result?.pacePer100M?`${result.pacePer100M} min/100 m (medido)`:null,
    result?.avgHeartRateBpm!=null&&Number.isFinite(Number(result.avgHeartRateBpm))&&Number(result.avgHeartRateBpm)>0?`FC media ${result.avgHeartRateBpm} lpm`:null,
    result?.powerWatts!=null?`${result.powerWatts} W`:null,
    result?.load||null,
    result?.rpe!=null&&Number.isFinite(Number(result.rpe))?`RPE ${result.rpe}`:null,
    result?.rir!=null&&Number.isFinite(Number(result.rir))?`RIR ${result.rir}`:null,
  ].filter(Boolean).join(' · ')||'Serie registrada';
}
function renderCurrentExerciseHistory(execution,step){
  const totalSets=Number(step?.totalSets||0);
  const rows=Array.from({length:totalSets},(_,index)=>executionResultForStep(execution,step,index+1))
    .filter(Boolean)
    .sort((a,b)=>Number(a.setNumber)-Number(b.setNumber));
  if(!rows.length)return '';
  const items=rows.map((result)=>`<div class="m26-field"><span>Serie ${e(result.setNumber)}</span><strong>${e(currentSetResultSummary(result))}</strong></div>`).join('');
  return `<section class="m26-panel m26-panel-soft" data-session-current-exercise-history aria-label="Series registradas hoy en este ejercicio"><p class="m26-eyebrow">Hoy en este ejercicio</p><div class="m26-field-grid">${items}</div></section>`;
}
function groupName(type){return ({biserie:'Biserie',triserie:'Triserie',circuito:'Circuito',amrap:'AMRAP',tabata:'Tabata'})[type]||type;}
export function renderSessionSyncBanner(execution,{role=''}={}){
  const status=execution?.syncStatus||'clean';if(status==='clean')return '';
  if(status==='pending')return '<div class="m26-sync-banner is-pending" role="status"><span>Guardado en este dispositivo · pendiente de sincronización.</span><button type="button" class="m26-text-action" data-session-action="sync-now">Sincronizar ahora</button></div>';
  if(status==='conflict')return '<div class="m26-sync-banner is-conflict" role="alert">Existe una versión más reciente. Tu progreso local está protegido y requiere revisión.</div>';
  const specific=sessionRejectedSyncOutcome(execution,{role});
  if(specific)return `<div class="m26-sync-banner is-rejected" role="alert">${e(specific.message)}</div>`;
  return '<div class="m26-sync-banner is-rejected" role="alert">No fue posible confirmar el último cambio. El progreso local se conserva.</div>';
}
function timerStrip(execution){const elapsed=formatDuration(executionElapsedMs(execution));const rest=restRemainingSeconds(execution);return `<div class="m26-session-timers" aria-live="off"><span><small>Tiempo activo</small><strong role="timer" aria-live="off" data-session-elapsed>${e(elapsed)}</strong></span><span><small>Descanso</small><strong role="timer" aria-live="off" data-session-rest>${rest?`${rest} s`:'—'}</strong></span></div>`;}
function bpmText(value){
  if(value===null||value===undefined||typeof value==='boolean'||(typeof value==='string'&&!value.trim()))return '—';
  const number=Number(value);
  return Number.isFinite(number)&&number>0?`${Math.round(number)} lpm`:'—';
}
function bpmDeltaText(value){
  const number=Number(value);
  return value!==null&&value!==undefined&&Number.isFinite(number)&&number>=0?`${Math.round(number)} lpm`:'—';
}
function qualityText(intelligence,live){
  const grade=intelligence?.quality?.latestGrade||live?.quality||null;
  if(!grade)return 'Calidad no informada';
  const excluded=Number(intelligence?.quality?.excludedFromDerived||0);
  return excluded
    ?`Calidad ${grade} · ${excluded} muestra${excluded===1?'':'s'} excluida${excluded===1?'':'s'} de métricas`
    :`Calidad ${grade}`;
}
// A rejected/missing reading must never become a plotted zero or a NaN
// coordinate. Keep the original telemetry untouched; sanitize only the chart.
export function renderHeartRateSparkline(points=[]){
  const readings=(Array.isArray(points)?points:[])
    .filter((point)=>point&&point.bpm!==null&&point.bpm!==undefined&&
      (typeof point.bpm==='number'||(typeof point.bpm==='string'&&point.bpm.trim())))
    .map((point)=>({bpm:Number(point.bpm),at:point.at?Date.parse(point.at):NaN}))
    .filter((point)=>Number.isFinite(point.bpm)&&point.bpm>0);
  if(readings.length<2){
    return '<p class="m26-empty-copy">El timeline aparecerá cuando exista cobertura suficiente.</p>';
  }
  const min=Math.min(...readings.map((point)=>point.bpm));
  const max=Math.max(...readings.map((point)=>point.bpm));
  const span=Math.max(1,max-min);
  const timestamped=readings.every((point)=>Number.isFinite(point.at))&&
    readings.every((point,index)=>index===0||point.at>=readings[index-1].at);
  const firstAt=readings[0].at;
  const lastAt=readings.at(-1).at;
  const duration=timestamped?Math.max(1,lastAt-firstAt):1;
  const coords=readings.map(({bpm,at},index)=>({
    x:Math.round((timestamped?(at-firstAt)/duration:index/(readings.length-1))*1000)/10,
    y:Math.round((34-((bpm-min)/span)*30)*10)/10,
  }));
  // A gap over 30 seconds is not a continuous cardiovascular trace.
  // Preserve original sample timestamps and avoid fabricating intervening data.
  const segments=[];
  let segment=[];
  let gaps=0;
  for(let index=0;index<coords.length;index+=1){
    if(index>0&&timestamped&&readings[index].at-readings[index-1].at>30000){
      segments.push(segment);
      segment=[];
      gaps++;
    }
    segment.push(coords[index]);
  }
  segments.push(segment);
  const markup=segments.map((part)=>part.length>=2
    ?`<polyline points="${e(part.map((point)=>`${point.x},${point.y}`).join(' '))}"></polyline>`
    :`<circle cx="${e(part[0].x)}" cy="${e(part[0].y)}" r="1.3" fill="currentColor"></circle>`
  ).join('');
  const gapNote=gaps
    ?'<p class="m26-live-reading-note">Señal interrumpida: el gráfico no une periodos sin mediciones.</p>'
    :'';
  return `<div class="m26-live-hr-chart"><svg viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label="Evolución de frecuencia cardiaca durante la sesión; de ${e(min)} a ${e(max)} lpm${gaps?'; con interrupciones de señal':''}">${markup}</svg><div class="m26-live-hr-chart-scale"><span>${e(min)} lpm</span><span>${e(max)} lpm</span></div>${gapNote}</div>`;
}
function repeatedExerciseContext(execution,blockId,exerciseId){
  if(!blockId||!exerciseId)return '';
  const occurrences=[...new Set((execution?.queue||[])
    .filter((item)=>item?.exerciseId===exerciseId)
    .map((item)=>item?.blockId).filter(Boolean))];
  if(occurrences.length<2)return '';
  const index=occurrences.indexOf(blockId);
  return index<0?' · bloque sin identificar':` · aparición ${index+1} de ${occurrences.length}`;
}
export function liveHeartRatePresentation(intelligence){
  const current=intelligence?.liveReading||{};
  const bpm=bpmText(current.currentBpm);
  // A fixed event time remains correct on-screen even when no new sensor
  // samples arrive; a captured "hace 30 s" would silently become false.
  const lastTime=Date.parse(current.lastAt||'');
  const timeLabel=Number.isFinite(lastTime)
    ?new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit'}).format(lastTime)
    :'';
  const note=current.state==='current'
    ?''
    :current.lastBpm!==null&&current.lastBpm!==undefined
      ?`Última FC registrada: ${bpmText(current.lastBpm)}${timeLabel?` · ${timeLabel}`:''}. ${current.state==='not-connected'?'Sin señal en directo; revisa la conexión del dispositivo.':current.state==='signal-invalid'?'Lectura reciente descartada por calidad; comprueba el contacto y la señal.':'Esperando una lectura reciente del dispositivo.'}`
      :current.state==='not-connected'
        ?'Sin señal en directo. Revisa la conexión del dispositivo.'
        :'Sin lectura actual confirmada. Esperando una medición reciente.';
  return Object.freeze({bpm,note,state:String(current.state||'no-reading')});
}
function liveTelemetryStrip(execution,catalog){
  const live=execution?.liveTelemetry;
  if(!live)return '';
  const intelligence=deriveLiveSessionIntelligence(execution);
  const {bpm:currentHeartRate,note:lastNote,state:readingState}=liveHeartRatePresentation(intelligence);
  const source=
    intelligence.source.providerLabel||
    live.providerLabel||
    intelligence.source.provider||
    'Dispositivo compatible';
  const state=({
    connected:'Conectado',
    connecting:'Conectando',
    paused:'En pausa',
    stopped:'Finalizado',
    unavailable:'No disponible',
    error:'Revisar conexión',
  })[live.status]||'Preparando';

  const response=intelligence.latestResponse;
  const responseName=response?.exerciseId
    ?exerciseDisplayName(catalog?.get?.(response.exerciseId)||{})||'Ejercicio actual'
    :'Sin ejercicio correlacionado';
  const responseContext=response?repeatedExerciseContext(execution,response.blockId,response.exerciseId):'';
  const responseMarkup=response
    ?`<article class="m26-live-context-card"><span>Respuesta por ejercicio</span><strong>${e(responseName)}${e(responseContext)}</strong><p>Media ${e(bpmText(response.averageBpm))} · Máxima ${e(bpmText(response.maxBpm))} · ${e(response.sampleCount)} muestras</p></article>`
    :'<article class="m26-live-context-card"><span>Respuesta por ejercicio</span><strong>Pendiente de cobertura</strong><p>Se mostrará cuando existan muestras de trabajo correlacionadas.</p></article>';

  const recovery=intelligence.latestRecovery;
  const recoveryName=recovery?.exerciseId
    ?exerciseDisplayName(catalog?.get?.(recovery.exerciseId)||{})||'Ejercicio'
    :'Descanso';
  const recoveryContext=recovery?repeatedExerciseContext(execution,recovery.blockId,recovery.exerciseId):'';
  let recoveryMarkup='<article class="m26-live-context-card"><span>Recuperación en descanso</span><strong>Pendiente de cobertura</strong><p>Necesita al menos dos lecturas durante el mismo descanso.</p></article>';
  if(recovery?.available){
    const change=Number(recovery.dropBpm);
    const headline=change>0
      ?`Descenso observado · ${bpmDeltaText(change)}`
      :`Cambio observado · ${change<0?'+':''}${bpmDeltaText(Math.abs(change))}`;
    recoveryMarkup=`<article class="m26-live-context-card"><span>Recuperación en descanso</span><strong>${e(headline)}</strong><p>${e(recoveryName)}${e(recoveryContext)} · ${e(recovery.elapsedSeconds)} s observados · sin clasificación clínica</p></article>`;
  }

  const correlation=intelligence.latestSetCorrelation;
  const correlationName=correlation?.exerciseId
    ?exerciseDisplayName(catalog?.get?.(correlation.exerciseId)||{})||'Serie registrada'
    :'Serie registrada';
  const correlationContext=correlation?repeatedExerciseContext(execution,correlation.blockId,correlation.exerciseId):'';
  const correlationMarkup=correlation
    ?`<article class="m26-live-context-card"><span>FC + esfuerzo percibido</span><strong>${e(correlationName)}${e(correlationContext)} · serie ${e(correlation.setNumber)}</strong><p>RPE ${e(correlation.rpe??'—')} · RIR ${e(correlation.rir??'—')} · FC media ${e(bpmText(correlation.heartRate.averageBpm))} · FC máxima ${e(bpmText(correlation.heartRate.maxBpm))}</p></article>`
    :'<article class="m26-live-context-card"><span>FC + esfuerzo percibido</span><strong>Sin serie registrada todavía</strong><p>La correlación aparece después de registrar RPE/RIR.</p></article>';

  return `<section class="m26-panel m26-panel-soft m26-live-telemetry m26-live-intelligence" aria-live="off"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Inteligencia de sesión en vivo</p><h3 data-session-live-current-heading>FC actual · ${e(currentHeartRate)}</h3><p>${e(source)} · ${e(state)} · ${e(qualityText(intelligence,live))}</p><p class="m26-live-reading-note" data-session-live-reading-note data-session-live-reading-state="${e(readingState)}" data-session-live-last-at="${e(intelligence.liveReading.lastAt||'')}" role="status"${lastNote?'':' hidden'}>${e(lastNote)}</p></div></div><div class="m26-live-intelligence-grid"><div class="m26-live-intelligence-metric"><span>FC actual</span><strong data-session-live-current-value>${e(currentHeartRate)}</strong></div><div class="m26-live-intelligence-metric"><span>FC media</span><strong>${e(bpmText(intelligence.averageHeartRateBpm))}</strong></div><div class="m26-live-intelligence-metric"><span>FC máxima</span><strong>${e(bpmText(intelligence.maxHeartRateBpm))}</strong></div><div class="m26-live-intelligence-metric"><span>Cobertura</span><strong>${e(intelligence.interpretableEventCount)} / ${e(intelligence.rawEventCount)}</strong><small>interpretables / raw</small></div></div>${renderHeartRateSparkline(intelligence.timeline.points)}<div class="m26-live-context-grid">${responseMarkup}${recoveryMarkup}${correlationMarkup}</div><details class="m26-live-method"><summary>Cómo se calcula</summary><p>FC media/mínima/máxima: ${e(intelligence.methodology.heartRate)}.</p><p>Calidad: ${e(intelligence.methodology.qualityFilter)}.</p><p>Recuperación: ${e(intelligence.methodology.recovery)}.</p><p>RPE/RIR: ${e(intelligence.methodology.rpeRirCorrelation)}.</p></details><p class="m26-notice">Dato → contexto → entrenador decide. Esta información no modifica automáticamente la prescripción, las cargas, las series ni los ejercicios.</p></section>`;
}function alternativeLabel(item={}){const meta=[item.equipment,item.difficulty].map((value)=>String(value||'').trim()).filter(Boolean).join(' · ');return `${exerciseDisplayName(item)}${meta?` · ${meta}`:''}`;}
const SESSION_REASON_PRESETS=Object.freeze(['Equipo no disponible','Molestia','Fatiga','Ajuste técnico']);
function coachReasonPresets(target,isCoach){
  if(!isCoach)return '';
  return `<div class="m26-session-reason-presets" data-session-reason-presets="${e(target)}" role="group" aria-label="Motivos rápidos">${SESSION_REASON_PRESETS.map((reason)=>`<button type="button" data-session-reason-preset-target="${e(target)}" data-session-reason-preset-value="${e(reason)}">${e(reason)}</button>`).join('')}</div>`;
}
function liveAddExerciseOptions(catalog,currentExercise={}){
  const currentId=String(currentExercise?.id||'').trim();
  const pattern=String(currentExercise?.pattern||'').trim();
  const equipment=String(currentExercise?.equipment||'').trim();
  const candidates=catalog.search('').filter((item)=>item.id!==currentId);
  const samePattern=pattern?candidates.filter((item)=>String(item.pattern||'').trim()===pattern):[];
  const sameEquipment=equipment?samePattern.filter((item)=>String(item.equipment||'').trim()===equipment):[];
  const sameEquipmentIds=new Set(sameEquipment.map((item)=>item.id));
  const samePatternOther=samePattern.filter((item)=>!sameEquipmentIds.has(item.id));
  const relatedIds=new Set([...sameEquipment,...samePatternOther].map((item)=>item.id));
  const others=candidates.filter((item)=>!relatedIds.has(item.id));
  // Rank across the entire catalogue before applying the 60-option mobile cap.
  // Otherwise a matching exercise outside the first page is silently lost.
  const visibleIds=new Set([...sameEquipment,...samePatternOther,...others].slice(0,60).map((item)=>item.id));
  const visible=(items)=>items.filter((item)=>visibleIds.has(item.id));
  const option=(item)=>`<option value="${e(item.id)}">${e(alternativeLabel(item))}</option>`;
  const group=(label,items)=>items.length?`<optgroup label="${e(label)}">${items.map(option).join('')}</optgroup>`:'';
  return `${group('Mismo patrón y material',visible(sameEquipment))}${group(equipment?'Mismo patrón · otro material':'Mismo patrón',visible(samePatternOther))}${group('Otros ejercicios',visible(others))}`;
}
function alternativeOptions(catalog,currentExercise={},selectedId=null){
  const currentId=String(currentExercise?.id||currentExercise||'').trim();
  const pattern=String(currentExercise?.pattern||'').trim();
  const equipment=String(currentExercise?.equipment||'').trim();
  const candidates=catalog.search('',pattern?{pattern}:{}).filter((item)=>item.id!==currentId);
  const sameEquipment=equipment?candidates.filter((item)=>String(item.equipment||'').trim()===equipment):[];
  const sameIds=new Set(sameEquipment.map((item)=>item.id));
  const otherEquipment=candidates.filter((item)=>!sameIds.has(item.id));
  const preferred=sameEquipment.slice(0,10);
  const secondary=otherEquipment.slice(0,18);
  const visibleIds=new Set([...preferred,...secondary].map((item)=>item.id));
  const selected=selectedId&&!visibleIds.has(selectedId)?catalog.get(selectedId):null;
  const option=(item)=>`<option value="${e(item.id)}"${item.id===selectedId?' selected':''}>${e(alternativeLabel(item))}</option>`;
  const group=(label,items)=>items.length?`<optgroup label="${e(label)}">${items.map(option).join('')}</optgroup>`:'';
  return `<option value=""${selectedId?'':' selected'}>Sin alternativa fijada</option>${selected?group('Alternativa actual',[selected]):''}${group('Mismo patrón y material',preferred)}${group(equipment?'Mismo patrón · otro material':'Mismo patrón',secondary)}`;
}
function liveAlternativeOptions(catalog,currentExercise={},plannedAlternativeId=null){
  const currentId=String(currentExercise?.id||'').trim();
  const pattern=String(currentExercise?.pattern||'').trim();
  const equipment=String(currentExercise?.equipment||'').trim();
  const plannedId=String(plannedAlternativeId||'').trim();
  const candidates=catalog.search('',pattern?{pattern}:{}).filter((item)=>item.id!==currentId);
  const sameEquipment=equipment?candidates.filter((item)=>String(item.equipment||'').trim()===equipment):[];
  const sameIds=new Set(sameEquipment.map((item)=>item.id));
  const otherEquipment=candidates.filter((item)=>!sameIds.has(item.id));
  const preferred=sameEquipment.slice(0,6);
  const secondary=otherEquipment.slice(0,6);
  const visibleIds=new Set([...preferred,...secondary].map((item)=>item.id));
  const planned=plannedId&&plannedId!==currentId&&!visibleIds.has(plannedId)?catalog.get(plannedId):null;
  const option=(item)=>`<option value="${e(item.id)}"${item.id===plannedId?' selected':''}>${e(alternativeLabel(item))}</option>`;
  const group=(label,items)=>items.length?`<optgroup label="${e(label)}">${items.map(option).join('')}</optgroup>`:'';
  const markup=`${planned?group('Alternativa planificada',[planned]):''}${group('Mismo patrón y material',preferred)}${group(equipment?'Mismo patrón · otro material':'Mismo patrón',secondary)}`;
  return Object.freeze({markup,count:preferred.length+secondary.length+(planned?1:0)});
}
function blockField({blockId,exerciseId='',field,label,value,type='text',min='',max='',step='',maxLength='',placeholder=''}){const guidance=field==='targetRpe'?renderGuidanceTrigger('training-load',{label:'Ayuda sobre carga, RPE y RIR'}):'';return `<label><span class="m26-guidance-inline">${e(label)}${guidance}</span><input type="${e(type)}" value="${e(value)}" data-session-block-field="${e(field)}" data-block-id="${e(blockId)}"${exerciseId?` data-exercise-id="${e(exerciseId)}"`:''}${min!==''?` min="${e(min)}"`:''}${max!==''?` max="${e(max)}"`:''}${step!==''?` step="${e(step)}"`:''}${maxLength!==''?` maxlength="${e(maxLength)}"`:''}${placeholder?` placeholder="${e(placeholder)}"`:''}></label>`;}
function blockTextarea({blockId,exerciseId='',field,label,value='',maxLength=500,placeholder=''}){return `<label class="m26-wide"><span>${e(label)}</span><textarea data-session-block-field="${e(field)}" data-block-id="${e(blockId)}"${exerciseId?` data-exercise-id="${e(exerciseId)}"`:''} maxlength="${e(maxLength)}"${placeholder?` placeholder="${e(placeholder)}"`:''}>${e(value)}</textarea></label>`;}
function prescriptionWorkFields(blockId,exerciseId,exercise,p={},grouped=false){
  const profile=exerciseMeasurementProfile({...exercise,measurementProfile:p.measurementProfile});
  const field=(key,label,value,type='text',extra={})=>blockField({blockId,exerciseId,field:key,label,value,type,...extra});
  if(profile.cardio){
    return `${grouped?'':field('sets','Bloques',p.sets??1,'number',{min:1,max:100})}
      ${field('plannedDurationMinutes','Duración objetivo (min)',p.plannedDurationMinutes||'','number',{min:0,step:0.1,max:1440})}
      ${profile.sport==='swimming'?field('plannedDistanceM','Distancia objetivo (m)',p.plannedDistanceM||'','number',{min:0,step:1,max:100000}):field('plannedDistanceKm','Distancia objetivo (km)',p.plannedDistanceKm||'','number',{min:0,step:0.01,max:1000})}
      ${profile.sport==='swimming'?field('poolLengthM','Longitud de piscina (m) · opcional',p.poolLengthM??'','number',{min:15,step:1,max:100}):''}
      ${field('plannedWarmupMinutes','Calentamiento (min) · opcional',p.plannedWarmupMinutes??'','number',{min:0,step:0.5,max:240})}
      ${field('plannedCooldownMinutes','Vuelta a la calma (min) · opcional',p.plannedCooldownMinutes??'','number',{min:0,step:0.5,max:240})}
      <p class="m26-builder-metric-hint m26-wide">Duración y distancia objetivo corresponden al bloque completo; especifica las fases solo cuando formen parte del plan.</p>
      ${profile.kind==='intervals'?field('intervalRepetitions','Repeticiones de intervalos',p.intervalRepetitions||'','number',{min:1,max:1000}):''}
      ${profile.kind==='intervals'?field('intervalWorkSeconds','Trabajo por intervalo (s)',p.intervalWorkSeconds||'','number',{min:1,max:86400}):''}
      ${profile.kind==='intervals'?field('intervalRecoverySeconds','Recuperación entre repeticiones (s)',p.intervalRecoverySeconds??'','number',{min:0,max:86400}):''}
      ${profile.kind==='intervals'?field('intervalDistanceM','Distancia por repetición (m) · opcional',p.intervalDistanceM??'','number',{min:1,max:100000}):''}
      ${profile.kind==='intervals'?'<p class="m26-builder-metric-hint m26-wide">El tiempo total incluye calentamiento, repeticiones, recuperaciones y vuelta a la calma cuando se indiquen.</p>':''}`;
  }
  const title=profile.kind==='isometric'?'Tiempo por serie (ej. 30 s)':profile.kind==='carry'?'Recorrido/tiempo objetivo':'Repeticiones/tiempo objetivo';
  return `${grouped?'':field('sets','Series',p.sets??3,'number',{min:1,max:100})}
    ${field('reps',title,p.reps??'', 'text',{maxLength:80})}
    ${profile.kind==='carry'?field('plannedDistanceM','Distancia (m)',p.plannedDistanceM||'','number',{min:0,step:1,max:100000}):''}
    ${profile.kind==='isometric'||profile.kind==='carry'||profile.kind==='strength'||profile.kind==='power'?field('plannedLoad','Carga planificada',p.plannedLoad||'','text',{maxLength:80,placeholder:'Ej. 10 kg o peso corporal'}):''}
    ${field('restSeconds','Descanso (s)',p.restSeconds??60,'number',{min:0,max:3600})}`;
}
function prescriptionAdvancedFields(blockId,exerciseId,exercise,p={}){
  const profile=exerciseMeasurementProfile({...exercise,measurementProfile:p.measurementProfile});
  const field=(key,label,value,type='text',extra={})=>blockField({blockId,exerciseId,field:key,label,value,type,...extra});
  const cardio=profile.cardio;
  const sport=profile.sport;
  const runningAdvice=cardio&&sport==='running'
    ?runningPrescriptionAdvisories(p,{...exercise,measurementProfile:p.measurementProfile})
      .map(({level,message})=>`<p class="m26-builder-metric-hint" data-running-prescription-advice="${e(level)}">${e(message)}</p>`).join('')
    :'';
  const swimmingAdvice=cardio&&sport==='swimming'
    ?swimmingPrescriptionAdvisories(p,{...exercise,measurementProfile:p.measurementProfile})
      .map(({level,message})=>`<p class="m26-builder-metric-hint" data-swimming-prescription-advice="${e(level)}">${e(message)}</p>`).join('')
    :'';
  return `${cardio&&['running','walking'].includes(sport)?field('plannedPace','Ritmo objetivo (min/km)',p.plannedPace||'', 'text',{maxLength:16,placeholder:'Ej. 06:00'}):''}
    ${cardio&&sport==='swimming'?field('plannedPacePer100M','Ritmo objetivo (min/100 m)',p.plannedPacePer100M||'', 'text',{maxLength:16,placeholder:'Ej. 01:55'}):''}
    ${cardio&&sport==='cycling'?field('plannedSpeedKmh','Velocidad objetivo (km/h)',p.plannedSpeedKmh||'','number',{min:0,step:0.1,max:120}):''}
    ${cardio?field('targetHeartRateZone','Zona de FC',p.targetHeartRateZone||'','text',{maxLength:12,placeholder:'Ej. Z2'}):''}
    ${cardio?field('targetHeartRateBpm','FC objetivo (lpm o rango)',p.targetHeartRateBpm||'','text',{maxLength:24,placeholder:'Ej. 120-140'}):''}
    ${cardio&&sport==='cycling'?field('plannedCadenceRpm','Cadencia objetivo (rpm)',p.plannedCadenceRpm||'','number',{min:0,max:250}):''}
    ${cardio&&sport==='cycling'?field('plannedPowerWatts','Potencia objetivo (W)',p.plannedPowerWatts||'','number',{min:0,max:2500}):''}
    ${cardio?field('plannedElevationM','Desnivel positivo (m)',p.plannedElevationM||'','number',{min:0,max:15000}):''}
    ${!cardio&&profile.kind!=='isometric'?field('tempo','Ritmo de ejecución',p.tempo||'controlado','text',{maxLength:80}):''}
    ${field('targetRpe','RPE objetivo',p.targetRpe??7,'number',{min:1,max:10,step:0.5})}
    ${!cardio?field('targetRir','RIR objetivo',p.targetRir??3,'number',{min:0,max:10,step:0.5}):''}
    ${cardio?'<p class="m26-builder-metric-hint">Ritmo, FC y potencia son objetivos orientativos. Registra solo datos medidos durante la actividad.</p>':''}${runningAdvice}${swimmingAdvice}`;
}
function templateHistoryCoverage(draft={},exerciseMemoryFor=null){
  const items=[];
  for(const block of draft.blocks||[]){
    if(block.type==='exercise'&&block.exerciseId)items.push({blockId:block.id,exerciseId:block.exerciseId});
    else for(const exerciseId of block.exerciseIds||[])items.push({blockId:block.id,exerciseId});
  }
  let confirmed=0,firstMissingBlockId=null;
  for(const item of items){
    if(exerciseMemoryFor?.(item.exerciseId)?.latest)confirmed+=1;
    else if(!firstMissingBlockId)firstMissingBlockId=item.blockId;
  }
  return Object.freeze({total:items.length,confirmed,firstMissingBlockId});
}
function draftMetrics(draft={}){
  let exercises=0,workUnits=0,groups=0;
  for(const block of draft.blocks||[]){
    if(block.type==='exercise'){
      exercises+=1;
      workUnits+=Number(block.sets||0);
    }else{
      const count=(block.exerciseIds||[]).length;
      groups+=1;
      exercises+=count;
      workUnits+=Number(block.rounds||0)*count;
    }
  }
  return {exercises,workUnits,groups,blocks:(draft.blocks||[]).length};
}
function plural(value,singular,pluralForm){return `${value} ${value===1?singular:pluralForm}`;}
function nextExecutionCopy(execution,catalog){
  const item=currentStep(execution);
  if(!item)return {label:'Finalizar ejercicio',detail:''};
  const next=nextExecutionStep(execution);
  if(!next)return {label:'Continuar al cierre',detail:'Última serie completada'};
  const sameExercise=next.blockId===item.blockId&&next.exerciseId===item.exerciseId;
  const ex=catalog.get(next.exerciseId);
  if(sameExercise){
    return {
      label:`Continuar · serie ${next.setNumber}`,
      detail:exerciseDisplayName(ex||{})||'Mismo ejercicio',
    };
  }
  return {
    label:'Continuar al siguiente',
    detail:exerciseDisplayName(ex||{})||'Siguiente ejercicio',
  };
}
function nextSessionPreparation(execution,catalog,mediaMap,role){
  const item=currentStep(execution);
  if(!item)return '';
  const next=nextExecutionStep(execution);
  if(!next)return '';
  const sameExercise=next.blockId===item.blockId&&next.exerciseId===item.exerciseId;
  const isCoach=String(role||'').trim().toLowerCase()==='coach';
  const exercise=catalog.get(next.exerciseId)||{id:next.exerciseId,name_es:'Siguiente ejercicio'};
  const visual=sameExercise?'':renderExerciseMedia({
    manifest:mediaMap,
    exercise:{...exercise,id:next.exerciseId},
    role,
    compact:true,
    fallback:false,
  });
  const planned=next.prescription||{};
  const target=[
    planned.reps||null,
    planned.plannedLoad?`carga ${planned.plannedLoad}`:null,
    planned.tempo?`ritmo ${planned.tempo}`:null,
    explicitSessionEffort(planned.targetRpe,{min:1,max:10})!==null?`RPE ${planned.targetRpe}`:null,
    explicitSessionEffort(planned.targetRir,{min:0})!==null?`RIR ${planned.targetRir}`:null,
  ].filter(Boolean).join(' · ')||'Según indicación';
  const media=visual
    ?`<div class="m26-session-next-exercise-media" data-session-next-exercise-media aria-label="Vista previa del siguiente ejercicio">${visual}</div>`
    :'';
  const preparationAttribute=sameExercise
    ?'data-session-next-set-preparation'
    :'data-session-next-exercise-preparation';
  const label=sameExercise?'Próxima serie':'Próximo objetivo';
  const ariaLabel=sameExercise?'Preparación de la próxima serie':'Preparación del siguiente ejercicio';

  if(!isCoach||sameExercise){
    return `<div class="m26-session-next-exercise-preparation" data-session-next-step-preparation ${preparationAttribute} aria-label="${ariaLabel}">${media}<div class="m26-field-grid"><div class="m26-field"><span>${label}</span><strong>${e(target)}</strong></div></div></div>`;
  }

  const alternative=planned.alternativeId?catalog.get(planned.alternativeId):null;
  const alternativeName=alternative?exerciseDisplayName(alternative):'';
  const prescriptionGuidance=String(planned.prescriptionNotes||'').trim();
  const cueGuidance=Array.isArray(exercise.cues)
    ?exercise.cues.map((item)=>String(item||'').trim()).filter(Boolean).slice(0,2).join(' · ')
    :'';
  const guidance=prescriptionGuidance||cueGuidance;

  return `<div class="m26-session-next-exercise-preparation m26-session-next-exercise-handoff" data-session-next-step-preparation data-session-next-exercise-preparation data-session-coach-next-exercise-handoff aria-label="${ariaLabel}">
    ${media}
    <div class="m26-session-next-exercise-handoff-body">
      <div class="m26-session-next-exercise-handoff-heading">
        <span>Cambio de ejercicio</span>
        <strong>${e(exerciseDisplayName(exercise)||'Siguiente ejercicio')}</strong>
      </div>
      <div class="m26-session-next-exercise-facts">
        <div class="m26-field"><span>Series</span><strong>${e(Number(next.sets)||1)}</strong></div>
        <div class="m26-field"><span>Próximo objetivo</span><strong>${e(target)}</strong></div>
        ${explicitSessionEffort(planned.restSeconds,{min:0,max:3600})!==null?`<div class="m26-field"><span>Descanso</span><strong>${e(planned.restSeconds)} s</strong></div>`:''}
        ${guidance?`<div class="m26-field m26-session-next-exercise-guidance"><span>Indicaciones</span><strong>${e(guidance)}</strong></div>`:''}
        ${alternativeName?`<div class="m26-field"><span>Alternativa prevista</span><strong>${e(alternativeName)}</strong></div>`:''}
      </div>
    </div>
  </div>`;
}
function exerciseMemorySetText(set){
  const parts=[];

  if(set?.load?.raw){
    parts.push(set.load.raw);
  }

  if(Number.isFinite(set?.reps)){
    parts.push(`${set.reps} rep${set.reps===1?'':'s'}`);
  }

  if(Number.isFinite(set?.seconds)){
    parts.push(`${set.seconds} s`);
  }

  if(Number.isFinite(set?.rpe)){
    parts.push(`RPE ${set.rpe}`);
  }

  if(Number.isFinite(set?.rir)){
    parts.push(`RIR ${set.rir}`);
  }

  return parts.join(' · ')||'Serie confirmada';
}

function exerciseMemoryDate(memory){
  const value=memory?.latest?.completedAt;

  if(!value){
    return 'Fecha no disponible';
  }

  const date=new Date(value);

  if(!Number.isFinite(date.getTime())){
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat(
    'es-CL',
    {
      day:'numeric',
      month:'short',
      year:'numeric',
    },
  ).format(date);
}

function exerciseMemoryChange(memory){
  const delta=memory?.comparison?.lastLoad;

  if(
    !delta||
    !Number.isFinite(delta.value)
  ){
    return 'Sin comparación equivalente todavía';
  }

  const sign=delta.value>0?'+':'';
  const unit=delta.unit?` ${delta.unit}`:'';
  const percent=
    Number.isFinite(delta.percent)
      ?` · ${delta.percent>0?'+':''}${delta.percent}%`
      :'';

  return `${sign}${delta.value}${unit}${percent}`;
}

function renderExerciseMemoryInline(memory,{blockId,exerciseId,group=false}={}){
  const latest=memory?.latest;
  if(!latest)return '';
  const load=
    latest.lastLoad?.raw||
    (
      Number.isFinite(latest.totalSeconds)
        ?`${latest.totalSeconds} s acumulados`
        :'Sin carga registrada'
    );
  const sets=(latest.sets||[])
    .slice(0,3)
    .map(exerciseMemorySetText)
    .join(' · ');
  const suggestion=exerciseMemoryDraftSuggestion(memory);
  const action=suggestion&&blockId&&exerciseId
    ?`<div class="m26-session-repeat-actions">
        <button
          type="button"
          data-session-action="reuse-exercise-memory"
          data-block-id="${e(blockId)}"
          data-exercise-id="${e(exerciseId)}"
          data-reference-sets="${e(group?'':suggestion.sets??'')}"
          data-reference-reps="${e(suggestion.reps||'')}"
          data-reference-load="${e(suggestion.plannedLoad||'')}"
          aria-label="Usar la última referencia confirmada como punto de partida y revisarla"
        >Usar referencia y revisar</button>
      </div>
      <small>Solo prepara el borrador · ${group?'reps y carga':'series, reps y carga'}. Descanso y esfuerzo objetivo no cambian.</small>`
    :'';
  return `<div
    class="m26-field-grid"
    data-exercise-memory="builder"
  >
    <div class="m26-field">
      <span>Última vez · ${e(exerciseMemoryDate(memory))}</span>
      <strong>${e(load)}</strong>
    </div>
    <div class="m26-field">
      <span>Referencia confirmada</span>
      <strong>${e(sets||'Sin detalle de series')}</strong>
      ${action}
    </div>
    <div class="m26-field" data-exercise-memory-context="exposures">
      <span>Exposiciones confirmadas</span>
      <strong>${e(memory.exposureCount||1)}</strong>
    </div>
    <div class="m26-field" data-exercise-memory-context="comparison">
      <span>Cambio vs. anterior</span>
      <strong>${e(exerciseMemoryChange(memory))}</strong>
    </div>
  </div>`;
}

function renderExerciseMemorySession(memory){
  const latest=memory?.latest;

  if(!latest){
    return '';
  }

  const load=
    latest.lastLoad?.raw||
    'Sin carga registrada';

  const sets=(latest.sets||[])
    .slice(0,4)
    .map(exerciseMemorySetText)
    .join(' · ');

  const effort=[
    Number.isFinite(latest.averageRpe)
      ?`RPE medio ${latest.averageRpe}`
      :null,
    Number.isFinite(latest.averageRir)
      ?`RIR medio ${latest.averageRir}`
      :null,
  ].filter(Boolean).join(' · ')||'Esfuerzo sin dato';

  return `<section
    class="m26-panel m26-panel-soft"
    data-exercise-memory="session"
    aria-label="Última referencia confirmada del ejercicio"
  >
    <div class="m26-panel-heading">
      <div>
        <p class="m26-eyebrow">Memoria de rendimiento</p>
        <h3>Última vez · ${e(exerciseMemoryDate(memory))}</h3>
        <p>${e(sets||'Sin detalle de series disponible.')}</p>
      </div>
    </div>

    <div class="m26-field-grid">
      <div class="m26-field">
        <span>Última carga</span>
        <strong>${e(load)}</strong>
      </div>

      <div class="m26-field">
        <span>Esfuerzo observado</span>
        <strong>${e(effort)}</strong>
      </div>

      <div class="m26-field">
        <span>Exposiciones confirmadas</span>
        <strong>${e(memory.exposureCount)}</strong>
      </div>

      <div class="m26-field">
        <span>Cambio vs. anterior</span>
        <strong>${e(exerciseMemoryChange(memory))}</strong>
      </div>
    </div>

    <small>
      Referencia histórica. No modifica automáticamente la carga ni la prescripción actual.
    </small>
  </section>`;
}
function exerciseEditor(block,catalog,index,mediaMap,role,exerciseMemoryFor,totalBlocks){
  const exercise=catalog.get(block.exerciseId)||{id:block.exerciseId,name_es:block.name||block.exerciseId,pattern:''};
  const visual=renderExerciseMedia({manifest:mediaMap,exercise,role,compact:true,fallback:true});
  const memory=exerciseMemoryFor?.(block.exerciseId)||null;
  const name=exerciseDisplayName(exercise);
  return `<article class="m26-builder-block m26-builder-editor" data-block-id="${e(block.id)}" tabindex="-1">
    <header>
      ${visual}
      <span>${index+1}</span>
      <div><strong>${e(name)}</strong><small>${e(exercise.pattern||'Ejercicio')} · bloque individual</small></div>
      <div class="m26-inline-actions">
        <button type="button" data-session-action="move-up" data-block-id="${e(block.id)}" aria-label="Mover ${e(name)} hacia arriba"${index===0?' disabled aria-disabled="true"':''}>↑</button>
        <button type="button" data-session-action="move-down" data-block-id="${e(block.id)}" aria-label="Mover ${e(name)} hacia abajo"${index===totalBlocks-1?' disabled aria-disabled="true"':''}>↓</button>
        <button type="button" data-session-action="duplicate-block" data-block-id="${e(block.id)}">Duplicar</button>
        <button type="button" data-session-action="remove-block" data-block-id="${e(block.id)}">Eliminar</button>
      </div>
    </header>
    ${renderExerciseMemoryInline(memory,{blockId:block.id,exerciseId:block.exerciseId})}
    <div class="m26-field-grid m26-builder-core-prescription">
      ${prescriptionWorkFields(block.id,'',exercise,block)}
    </div>
    <details class="m26-builder-prescription-details">
      <summary>Prescripción y alternativas</summary>
      <div class="m26-field-grid">
        ${prescriptionAdvancedFields(block.id,'',exercise,block)}
        <label>Alternativa<select data-session-block-field="alternativeId" data-block-id="${e(block.id)}">${alternativeOptions(catalog,exercise,block.alternativeId)}</select><small class="m26-builder-alternative-note">Prioriza mismo patrón y material; IBERFIT no cambia el ejercicio automáticamente.</small></label>
        ${blockTextarea({blockId:block.id,field:'prescriptionNotes',label:'Indicaciones para la ejecución',value:block.prescriptionNotes||'',maxLength:1000,placeholder:'Claves técnicas o ajustes específicos para esta sesión'})}
        ${blockTextarea({blockId:block.id,field:'progression',label:'Progresión prevista',value:block.progression||'',maxLength:500,placeholder:'Criterio para avanzar o retroceder en próximas exposiciones'})}
      </div>
    </details>
  </article>`;
}
function groupExerciseEditor(group,exerciseId,catalog,mediaMap,role,exerciseMemoryFor){
  const exercise=catalog.get(exerciseId)||{id:exerciseId,name_es:exerciseId,pattern:''};
  const p=group.prescriptions?.[exerciseId]||{};
  const visual=renderExerciseMedia({manifest:mediaMap,exercise,role,compact:true,fallback:true});
  const memory=exerciseMemoryFor?.(exerciseId)||null;
  return `<section class="m26-group-prescription">
    <div class="m26-group-prescription-heading">${visual}<h4>${e(exerciseDisplayName(exercise))}</h4></div>
    ${renderExerciseMemoryInline(memory,{blockId:group.id,exerciseId,group:true})}
    <div class="m26-field-grid m26-builder-core-prescription">
      ${prescriptionWorkFields(group.id,exerciseId,exercise,p,true)}
    </div>
    <details class="m26-builder-prescription-details">
      <summary>Prescripción y alternativas</summary>
      <div class="m26-field-grid">
        ${prescriptionAdvancedFields(group.id,exerciseId,exercise,p)}
        <label>Alternativa<select data-session-block-field="alternativeId" data-block-id="${e(group.id)}" data-exercise-id="${e(exerciseId)}">${alternativeOptions(catalog,exercise,p.alternativeId)}</select><small class="m26-builder-alternative-note">Prioriza mismo patrón y material; IBERFIT no cambia el ejercicio automáticamente.</small></label>
        ${blockTextarea({blockId:group.id,exerciseId,field:'prescriptionNotes',label:'Indicaciones para la ejecución',value:p.prescriptionNotes||'',maxLength:1000})}
        ${blockTextarea({blockId:group.id,exerciseId,field:'progression',label:'Progresión prevista',value:p.progression||'',maxLength:500})}
      </div>
    </details>
  </section>`;
}
function groupEditor(group,catalog,index,mediaMap,role,exerciseMemoryFor,totalBlocks){
  const exercises=(group.exerciseIds||[]).map((id)=>groupExerciseEditor(group,id,catalog,mediaMap,role,exerciseMemoryFor)).join('')||'<p class="m26-empty-copy">Selecciona ejercicios desde la biblioteca.</p>';
  return `<article class="m26-builder-block m26-builder-editor" data-block-id="${e(group.id)}" tabindex="-1">
    <header>
      <span>${index+1}</span>
      <div><strong>${e(groupName(group.type))}</strong><small>${e((group.exerciseIds||[]).length)} ejercicios</small></div>
      <div class="m26-inline-actions">
        <button type="button" data-session-action="move-up" data-block-id="${e(group.id)}" aria-label="Mover grupo hacia arriba"${index===0?' disabled aria-disabled="true"':''}>↑</button>
        <button type="button" data-session-action="move-down" data-block-id="${e(group.id)}" aria-label="Mover grupo hacia abajo"${index===totalBlocks-1?' disabled aria-disabled="true"':''}>↓</button>
        <button type="button" data-session-action="duplicate-block" data-block-id="${e(group.id)}">Duplicar</button>
        <button type="button" data-session-action="remove-block" data-block-id="${e(group.id)}">Eliminar</button>
      </div>
    </header>
    <div class="m26-field-grid">${blockField({blockId:group.id,field:'rounds',label:'Rondas',value:group.rounds,type:'number',min:1,max:100})}</div>
    ${exercises}
  </article>`;
}
function prescriptionPreviewDetails(p={},exercise={}){
  const profile=exerciseMeasurementProfile(exercise);
  const optional=[
    !profile.cardio&&p.plannedLoad?`Carga ${e(p.plannedLoad)}`:'',
    !profile.cardio&&p.tempo?`tempo ${e(p.tempo)}`:'',
    explicitSessionEffort(p.targetRpe,{min:1,max:10})!==null?`RPE ${e(p.targetRpe)}`:'',
    !profile.cardio&&explicitSessionEffort(p.targetRir,{min:0})!==null?`RIR ${e(p.targetRir)}`:'',
  ].filter(Boolean).join(' · ');
  const guidance=[
    p.prescriptionNotes?`<p><strong>Indicaciones:</strong> ${e(p.prescriptionNotes)}</p>`:'',
    p.progression?`<p><strong>Progresión:</strong> ${e(p.progression)}</p>`:'',
  ].join('');
  return `<p>${e(metricPrescriptionSummary(p,exercise))}${optional?` · ${optional}`:''}</p>${guidance}`;
}
function renderProfessionalSessionClientContext(clientContext,role){
  const normalizedRole=String(role||'').trim().toLowerCase();
  if(!clientContext?.id||!['coach','admin'].includes(normalizedRole))return '';
  return `<aside class="m26-session-client-context" aria-label="Cliente de trabajo activo">
    <span>Trabajando con</span>
    <strong>${e(clientContext.name||'Cliente')}</strong>
    <small>${e(clientContext.modality||'Modalidad por definir')}</small>
  </aside>`;
}
function previewMarkup(draft,catalog,mediaMap,role){
  const blocks=draft.blocks.map((block,index)=>{
    if(block.type==='exercise'){
      const ex=catalog.get(block.exerciseId)||{id:block.exerciseId,name_es:block.name||block.exerciseId};
      const visual=renderExerciseMedia({manifest:mediaMap,exercise:ex,role,compact:true,fallback:true});
      return `<li class="m26-session-preview-item" data-session-preview-block="${e(block.id)}">${visual}<div><strong>${index+1}. ${e(exerciseDisplayName(ex))}</strong><p>${e(block.sets)} ${exerciseMeasurementProfile({...ex,measurementProfile:block.measurementProfile}).cardio?'bloque(s)':'series'} · ${e(metricPrescriptionSummary(block,{...ex,measurementProfile:block.measurementProfile}))}${exerciseMeasurementProfile({...ex,measurementProfile:block.measurementProfile}).cardio?'':` · descanso ${e(block.restSeconds)} s`}</p>${prescriptionPreviewDetails(block,{...ex,measurementProfile:block.measurementProfile})}<button type="button" class="m26-session-preview-edit" data-session-action="edit-preview" data-block-id="${e(block.id)}">Editar este bloque</button></div></li>`;
    }
    const exerciseLines=(block.exerciseIds||[]).map((id)=>{
      const ex=catalog.get(id)||{id,name_es:id};
      const p=block.prescriptions?.[id]||{};
      return `<span class="m26-session-preview-exercise">${renderExerciseMedia({manifest:mediaMap,exercise:ex,role,compact:true,fallback:true})}<span><strong>${e(exerciseDisplayName(ex))}</strong><small>${e(metricPrescriptionSummary(p,{...ex,measurementProfile:p.measurementProfile}))}${!exerciseMeasurementProfile({...ex,measurementProfile:p.measurementProfile}).cardio&&p.plannedLoad?` · ${e(p.plannedLoad)}`:''}</small></span></span>`;
    }).join('');
    return `<li class="m26-session-preview-group" data-session-preview-block="${e(block.id)}"><strong>${index+1}. ${e(groupName(block.type))} · ${e(block.rounds)} rondas</strong><div>${exerciseLines}</div><button type="button" class="m26-session-preview-edit" data-session-action="edit-preview" data-block-id="${e(block.id)}">Editar este bloque</button></li>`;
  }).join('');
  return `<section class="m26-panel m26-session-preview" aria-label="Vista previa de la sesión">
    <p class="m26-eyebrow">Revisión previa</p>
    <h3>${e(draft.title)}</h3>
    <p>${e(draft.durationMinutes)} minutos · ${e(draft.blocks.length)} bloques</p>
    <p class="m26-session-delivery-review" data-session-delivery-review><strong>${draft.deliveryModality==='presencial'?'Presencial con Coach':'Guiada autónoma en la aplicación'}</strong> · ${draft.deliveryModality==='presencial'?'El Coach registra la ejecución; el Cliente recibe cita, resumen y seguimiento.':'El Cliente realiza la sesión paso a paso y registra sus resultados desde IBERFIT.'}</p>
    <ol>${blocks}</ol>
    ${mediaMap?renderExerciseMediaCredit():''}
    <div class="m26-inline-actions">
      <button type="button" data-session-action="edit-preview">Seguir editando</button>
      <button type="button" class="m26-primary-action" data-session-action="publish">Publicar sesión</button>
    </div>
  </section>`;
}
function builderFacetOptions(values=[],selected='',allLabel='Todos'){
  const current=String(selected||'').trim();
  return `<option value="">${e(allLabel)}</option>${(values||[]).map((value)=>`<option value="${e(value)}"${String(value)===current?' selected':''}>${e(value)}</option>`).join('')}`;
}
function builderActiveFilterCount(filters={}){
  return ['pattern','equipment','difficulty','intent'].reduce((count,key)=>count+(String(filters?.[key]||'').trim()?1:0),0);
}
export function renderSessionLibraryResults({draft,catalog,query='',filters={},mediaMap,role='coach',visibleLimit=24}={}){
  const matchingExercises=catalog.search(query,filters);
  // Render only the visible page. Previously hundreds of hidden cards (with
  // media) were rebuilt on every prefix keystroke, slowing Coach sessions.
  // Every match remains reachable through progressive pages, without truncation.
  const requested=Number(visibleLimit);
  const safeLimit=Number.isFinite(requested)?Math.min(matchingExercises.length,Math.max(24,Math.ceil(requested/24)*24)):24;
  const visible=matchingExercises.slice(0,safeLimit);
  const results=visible.slice(0,24);
  const expanded=visible.slice(24);
  const remainingCount=matchingExercises.length-visible.length;
  const activeGroup=draft?.activeGroupId?(draft.blocks||[]).find(block=>block.id===draft.activeGroupId):null;
  const activeGroupExerciseIds=new Set(activeGroup?.exerciseIds||[]);
  const cards=results.map((item)=>{const alreadyGrouped=activeGroupExerciseIds.has(item.id);return `<button type="button" class="m26-exercise-result" data-session-action="add-exercise" data-exercise-id="${e(item.id)}"${alreadyGrouped?' disabled aria-disabled="true" title="Ya incluido en el grupo activo"':''}>${renderExerciseMedia({manifest:mediaMap,exercise:item,role,compact:true,fallback:true})}<span class="m26-exercise-result-copy"><strong>${e(exerciseDisplayName(item))}</strong><small>${e(item.pattern)} · ${e(item.equipment)}</small><em>${e((item.primary_muscles||[]).join(' · ')||'Musculatura no especificada')}</em></span><span class="m26-exercise-result-add" aria-hidden="true">${alreadyGrouped?'✓':'＋'}</span></button>`;}).join('')||'<p class="m26-empty-copy">No hay coincidencias.</p>';
  const remainingCards=expanded.map((item)=>{const alreadyGrouped=activeGroupExerciseIds.has(item.id);return `<button type="button" class="m26-list-card" data-session-action="add-exercise" data-exercise-id="${e(item.id)}"${alreadyGrouped?' disabled aria-disabled="true" title="Ya incluido en el grupo activo"':''}><span><strong>${e(exerciseDisplayName(item))}</strong><small>${e(item.pattern)} · ${e(item.equipment)}</small></span><span aria-hidden="true">${alreadyGrouped?'✓':'＋'}</span></button>`;}).join('');
  const more=remainingCount>0
    ?`<button type="button" class="m26-builder-library-more" data-session-action="load-more-library" aria-label="Mostrar ${e(Math.min(24,remainingCount))} ejercicios más; quedan ${e(remainingCount)} por mostrar">Mostrar otros ${e(Math.min(24,remainingCount))} ejercicios <span>${e(visible.length)} de ${e(matchingExercises.length)}</span></button>`
    :'';

  const activeFilterCount=builderActiveFilterCount(filters);
  const reset=(String(query||'').trim()||activeFilterCount)?'<button type="button" class="m26-builder-library-reset" data-session-action="clear-library-filters">Limpiar búsqueda y filtros</button>':'';
  return Object.freeze({count:matchingExercises.length,shown:visible.length,
    markup:`${reset}<div class="m26-exercise-results">${cards}${remainingCards}</div>${more}`});
}
// SIGNATURE B10: show the same domain validation before the Coach taps Review.
// A partial test/legacy catalog may not implement has(); the domain still
// validates the actual command at review and publication (never bypassed).
export function sessionBuilderReviewReadiness(draft,catalog){
  if(!Array.isArray(draft?.blocks)||!draft.blocks.length)
    return {ready:false,reason:'Añade al menos un ejercicio para revisar la sesión.',next:'library'};
  if(typeof catalog?.has!=='function')
    return {ready:true,reason:'',next:null};
  const {ok,errors}=validateSessionDraft(draft,catalog);
  if(ok)return {ready:true,reason:'',next:null};
  const has=prefix=>errors.some(code=>code===prefix||String(code).startsWith(prefix+':'));
  const guidance=has('clientId')?'Selecciona un Cliente antes de revisar.':
    has('title')?'Indica un título válido para la sesión.':
    has('durationMinutes')?'La duración debe estar entre 10 y 240 minutos.':
    has('deliveryModality')?'Elige si la sesión es presencial o guiada en la aplicación.':
    has('blocks')?'Añade ejercicios a la sesión antes de revisar.':
    has('group')?'Completa el grupo de entrenamiento o ciérralo para corregirlo.':
    has('rounds')?'Revisa las rondas de los grupos.':
    has('exercise')?'Hay un ejercicio que ya no está disponible en la biblioteca.':
    has('prescription')?'Revisa las series, repeticiones y descansos de los ejercicios.':
    has('metrics')?'Revisa el tiempo, la distancia y las métricas prescritas.':
    has('alternative')?'Revisa el ejercicio alternativo seleccionado.':
    'Revisa los datos de la sesión antes de continuar.';
  return {ready:false,reason:guidance,next:has('blocks')?'library':null};
}
export function renderSessionBuilder({draft,catalog,query='',filters={},libraryVisibleLimit=24,templates=[],actionState,undoRemoval=null,templateUndo=null,templateAdaptation=null,mediaMap,role='coach',clientContext=null,exerciseMemoryFor=null}={}){
  const searchResults=renderSessionLibraryResults({draft,catalog,query,filters,mediaMap,role,visibleLimit:libraryVisibleLimit});
  const matchingExercises={length:searchResults.count};
  const activeGroup=draft.activeGroupId?(draft.blocks||[]).find((block)=>block.id===draft.activeGroupId):null;

  const activeGroupLimit=activeGroup?.type==='biserie'?2:activeGroup?.type==='triserie'?3:activeGroup?12:0;
  const activeGroupTargetMarkup=activeGroup?`<div class="m26-builder-group-target" data-session-active-group-target role="status" aria-live="polite"><span><small>Añadiendo al grupo activo</small><strong>${e(groupName(activeGroup.type))} · ${e(activeGroup.exerciseIds.length)}/${e(activeGroupLimit)} ejercicios</strong></span><button type="button" data-session-action="close-group">Cerrar grupo</button></div>`:'';
  const totalBlocks=(draft.blocks||[]).length;
  const blocks=(draft.blocks||[]).map((block,index)=>block.type==='exercise'?exerciseEditor(block,catalog,index,mediaMap,role,exerciseMemoryFor,totalBlocks):groupEditor(block,catalog,index,mediaMap,role,exerciseMemoryFor,totalBlocks)).join('')||`<div class="m26-builder-program-empty" data-session-builder-empty><strong>Empieza por el primer ejercicio</strong><p>Busca en la biblioteca y construye el orden de la sesión. La revisión será necesaria antes de publicar.</p><button type="button" data-session-jump="library">Buscar ejercicios</button></div>`;
  // SIGNATURE B13 · Coach navigation on long sessions. Existing read-only
  // focus handler scrolls to the real editor; this never changes a draft.
  const blockIndex=draft.previewAccepted||totalBlocks<2?'':`<details class="m26-builder-block-index" data-session-builder-block-index>
    <summary><span>Ir directamente a un bloque</span><strong>${e(totalBlocks)} bloques</strong></summary>
    <div class="m26-builder-block-index-links" role="group" aria-label="Elegir bloque de la sesión">
      ${(draft.blocks||[]).map((block,index)=>{
        const current=block.type==='exercise'?catalog.get(block.exerciseId):null;
        const label=block.type==='exercise'?exerciseDisplayName(current||{name_es:block.name||block.exerciseId||'Ejercicio'}):groupName(block.type);
        return `<button type="button" data-session-review-block="${e(block.id)}">${e(index+1)}. ${e(label)}</button>`;
      }).join('')}
    </div>
  </details>`;
  const metrics=draftMetrics(draft);
  const reviewReadiness=sessionBuilderReviewReadiness(draft,catalog);
  const reviewUnavailable=reviewReadiness.ready?'':' disabled aria-disabled="true" aria-describedby="m26-builder-review-readiness"';
  const templateHistory=templateAdaptation?.templateName?templateHistoryCoverage(draft,exerciseMemoryFor):null;
  const undoRemovalMarkup=undoRemoval?.block?.id?`<div class="m26-notice m26-builder-undo" data-session-builder-undo role="status"><span>Bloque eliminado del borrador.</span><button type="button" data-session-action="restore-block">Deshacer</button></div>`:'';
  const templateUndoMarkup=templateUndo?.draft?.id?`<div class="m26-notice m26-builder-undo" data-session-template-undo role="status"><span>Plantilla aplicada al borrador.</span><button type="button" data-session-action="restore-template-load">Deshacer plantilla</button></div>`:'';
  const facets=catalog.facets||{};
  const activeFilterCount=builderActiveFilterCount(filters);
  const filterControls=`<div class="m26-builder-library-filters" role="group" aria-label="Filtrar biblioteca">
    <label>Patrón<select data-session-filter="pattern">${builderFacetOptions(facets.patterns,filters.pattern,'Todos los patrones')}</select></label>
    <label>Material<select data-session-filter="equipment">${builderFacetOptions(facets.equipment,filters.equipment,'Todos los materiales')}</select></label>
    <label>Dificultad<select data-session-filter="difficulty">${builderFacetOptions(facets.difficulty,filters.difficulty,'Todas las dificultades')}</select></label>
    <label>Objetivo<select data-session-filter="intent">${builderFacetOptions(facets.intent,filters.intent,'Todos los objetivos')}</select></label>
  </div>`;

  const primary=draft.previewAccepted?'':`<button type="button" class="m26-primary-action" data-session-action="preview"${reviewUnavailable}>Revisar sesión</button>`;
  const reviewGuidance=draft.previewAccepted||reviewReadiness.ready?'':`<p id="m26-builder-review-readiness" class="m26-builder-review-readiness" data-session-review-readiness role="status">${e(reviewReadiness.reason)}${reviewReadiness.next==='library'?'<button type="button" data-session-jump="library">Ir a la biblioteca</button>':''}</p>`;
  const templateOptions=(templates||[]).map((item)=>`<option value="${e(item.id)}">${e(item.name)} · v${e(item.version)} · ${e(item.blockCount)} bloques</option>`).join('');
  const adaptationSource=templateAdaptation?.source==='cycle'?'ciclo':templateAdaptation?.source==='profile'?'perfil':null;
  const adaptationDuration=Number(templateAdaptation?.clientDurationMinutes);
  const hasClientDuration=Boolean(adaptationSource&&Number.isInteger(adaptationDuration)&&adaptationDuration>=10&&adaptationDuration<=240);
  const durationAligned=hasClientDuration&&Number(draft.durationMinutes)===adaptationDuration;
  const templateAdaptationMarkup=templateAdaptation?.templateName?`<div class="m26-builder-template-adaptation" data-session-template-adaptation role="status">
    <div class="m26-builder-template-copy">
      <small>Adaptación al cliente</small>
      <strong>${e(templateAdaptation.templateName)} · v${e(templateAdaptation.templateVersion||1)}</strong>
      <p>${hasClientDuration?`Duración del ${e(adaptationSource)}: ${e(adaptationDuration)} min · borrador actual: ${e(draft.durationMinutes)} min.`:'Este cliente no tiene una duración específica definida en ciclo o perfil.'}</p>
      ${templateHistory?.total?`<p data-session-template-history-coverage>${e(templateHistory.confirmed)}/${e(templateHistory.total)} ejercicios con historial confirmado.</p>`:''}
      <small>La plantilla aporta estructura; revisa el historial y ajusta la prescripción antes de publicar.</small>
    </div>
    <div class="m26-inline-actions">
      ${hasClientDuration?(durationAligned?'<span class="m26-builder-template-aligned">Duración alineada</span>':`<button type="button" data-session-action="apply-client-duration" data-duration-minutes="${e(adaptationDuration)}">Usar duración del cliente</button>`):''}
      ${templateHistory?.firstMissingBlockId?`<button type="button" data-session-review-block="${e(templateHistory.firstMissingBlockId)}">Revisar primer bloque sin historial</button>`:templateHistory?.total?'<span class="m26-builder-template-aligned">Historial disponible para todos</span>':''}
    </div>
  </div>`:'';
  const templateControls=['coach','admin'].includes(String(role||''))?`<details class="m26-panel m26-panel-soft m26-builder-template-drawer" data-session-template-tools>
    <summary><span><small>Reutilización</small><strong>Plantillas versionadas</strong></span><span>${templates?.length||0} guardadas</span></summary>
    <div class="m26-builder-template-body">
      <p>Se guardan en este dispositivo para tu usuario y no contienen el identificador del cliente.</p>
      <div class="m26-field-grid">
        <label>Plantilla guardada<select data-session-template-select><option value="">Seleccionar plantilla…</option>${templateOptions}</select></label>
        <label>Guardar sesión actual como plantilla<input data-session-template-name maxlength="60" placeholder="Ej. Fuerza base A"></label>
      </div>
      <div class="m26-inline-actions">
        <button type="button" data-session-action="load-template"${templateOptions?'':' disabled aria-disabled="true"'}>Usar plantilla</button>
        <button type="button" data-session-action="save-template">Guardar nueva versión</button>
      </div>
      ${templateAdaptationMarkup}
    </div>
  </details>`:'';
  return `<section class="m26-session-builder m26-session-builder-v2" data-session-builder-workbench-v2 data-session-builder-has-blocks="${draft.blocks?.length?'true':'false'}">
    <header class="m26-builder-commandbar">
      <div>
        <p class="m26-eyebrow">Constructor de sesión</p>
        <h2>${e(draft.title)}</h2>
        <p>Construye rápido; la revisión final sigue siendo obligatoria antes de publicar.</p>
      </div>
      <div class="m26-inline-actions m26-builder-command-actions">
        <button type="button" data-session-action="save-draft">Guardar borrador</button>
        <details class="m26-builder-secondary-actions" data-session-builder-secondary-actions>
          <summary class="m26-text-action">Más opciones</summary>
          <div class="m26-builder-secondary-panel">
            <button type="button" data-session-action="exit-session">Salir</button>
            <details class="m26-draft-discard">
              <summary class="m26-text-action">Descartar borrador</summary>
              <div class="m26-notice">
                <p>Elimina este borrador del dispositivo y de la sincronización. No modifica ninguna sesión publicada.</p>
                <button type="button" data-session-action="discard-draft">Eliminar este borrador</button>
              </div>
            </details>
          </div>
        </details>
        ${primary}
      </div>
    </header>
    ${reviewGuidance}
    ${renderProfessionalSessionClientContext(clientContext,role)}
    ${renderActionState(actionState)}
    ${undoRemovalMarkup}
    ${templateUndoMarkup}
    <section class="m26-builder-session-strip" aria-label="Resumen de sesión · ${e(plural(metrics.exercises,'ejercicio','ejercicios'))} · ${e(plural(metrics.workUnits,'serie/ronda','series/rondas'))}">
      <div><span>Ejercicios</span><strong>${e(metrics.exercises)}</strong></div>
      <div><span>Trabajo</span><strong>${e(metrics.workUnits)}</strong><small>series / rondas</small></div>
      <div><span>Bloques</span><strong>${e(metrics.blocks)}</strong>${metrics.groups?`<small>${e(metrics.groups)} grupos</small>`:''}</div>
      <div><span>Duración</span><strong>${e(draft.durationMinutes)} min</strong></div>
    </section>
    <section class="m26-panel m26-panel-soft m26-builder-session-meta">
      <div class="m26-field-grid">
        <label>Título<input data-session-draft-field="title" maxlength="120" value="${e(draft.title)}"></label>
        <label>Duración estimada (min)<input type="number" min="10" max="240" data-session-draft-field="durationMinutes" value="${e(draft.durationMinutes)}"></label>
        <label class="m26-session-delivery-select">¿Cómo se realiza esta sesión?<select data-session-draft-field="deliveryModality" aria-describedby="m26-session-delivery-help" required><option value="" disabled${draft.deliveryModality===null?' selected':''}>Seleccionar modo de sesión</option><option value="presencial"${draft.deliveryModality==='presencial'?' selected':''}>Presencial · dirigida por Coach</option><option value="guiada_en_app"${draft.deliveryModality!==null&&draft.deliveryModality!=='presencial'?' selected':''}>Guiada autónoma · desde la app</option></select></label>
      </div>
      <p id="m26-session-delivery-help" class="m26-field-help">Elige el tipo de esta sesión, independientemente de si el plan del Cliente es presencial, híbrido u online. En presencial registra el Coach; en guiada, el Cliente puede iniciar y registrar en IBERFIT.</p>
    </section>
    ${templateControls}
    ${draft.previewAccepted?'':`<nav class="m26-builder-mobile-nav" aria-label="Navegación del constructor">
      <button type="button" data-session-jump="program">Editar sesión</button>
      <button type="button" data-session-jump="library">Añadir ejercicios</button>
    </nav>`}
    ${draft.previewAccepted?previewMarkup(draft,catalog,mediaMap,role):`<div class="m26-builder-grid m26-builder-workbench-grid">
      <aside id="m26-session-builder-library" class="m26-panel m26-builder-library" data-session-jump-target="library" tabindex="-1" aria-label="Biblioteca de ejercicios">
        <div class="m26-builder-column-heading"><div><p class="m26-eyebrow">Añadir</p><h3>Biblioteca</h3></div><span data-session-library-result-count aria-live="polite">${e(plural(matchingExercises.length,'resultado','resultados'))}${activeFilterCount?` · ${e(plural(activeFilterCount,'filtro','filtros'))}`:''}</span></div>
        <label>Buscar ejercicio<input type="search" value="${e(query)}" data-session-search autocomplete="off" placeholder="Nombre, patrón o material"></label>
        ${filterControls}
        ${activeGroupTargetMarkup}
        <div data-session-search-results>${searchResults.markup}</div>
        ${mediaMap?renderExerciseMediaCredit({compact:true}):''}
      </aside>
      <main id="m26-session-builder-program" class="m26-panel m26-builder-program" data-session-jump-target="program" tabindex="-1" aria-label="Estructura de la sesión">
        <div class="m26-builder-column-heading"><div><p class="m26-eyebrow">Sesión</p><h3>Orden y prescripción</h3></div><span>${e(metrics.blocks)} bloques</span></div>
        <div class="m26-builder-toolbar" aria-label="Añadir estructura de entrenamiento">
          <button type="button" ${draft.activeGroupId?'disabled title="Cierra primero el grupo activo"':''} data-session-action="add-group" data-group-type="biserie">Biserie</button>
          <button type="button" ${draft.activeGroupId?'disabled title="Cierra primero el grupo activo"':''} data-session-action="add-group" data-group-type="triserie">Triserie</button>
          <button type="button" ${draft.activeGroupId?'disabled title="Cierra primero el grupo activo"':''} data-session-action="add-group" data-group-type="circuito">Circuito</button>
          <button type="button" ${draft.activeGroupId?'disabled title="Cierra primero el grupo activo"':''} data-session-action="add-group" data-group-type="amrap">AMRAP</button>
          <button type="button" ${draft.activeGroupId?'disabled title="Cierra primero el grupo activo"':''} data-session-action="add-group" data-group-type="tabata">Tabata</button>
          ${draft.activeGroupId?'<button type="button" data-session-action="close-group">Cerrar grupo activo</button>':''}
        </div>
        ${draft.activeGroupId?'<p class="m26-notice" role="status">Añade ejercicios o cierra el grupo actual antes de crear otro. Si cierras un grupo incompleto, los ejercicios ya añadidos pasarán a ser individuales conservando sus prescripciones.</p>':''}
        ${blockIndex}
        <div class="m26-builder-blocks">${blocks}</div>
        ${metrics.blocks?`<footer class="m26-builder-finish" data-session-builder-finish aria-label="Siguiente paso del constructor"><div class="m26-builder-finish-copy"><span>Antes de publicar</span><strong>Revisa la sesión completa</strong><p>Confirma modalidad y prescripción. Guardar borrador no publica el entrenamiento.</p></div><div class="m26-inline-actions m26-builder-finish-actions"><button type="button" data-session-jump="library">Añadir otro ejercicio</button><button type="button" data-session-action="save-draft">Guardar borrador</button><button type="button" class="m26-primary-action" data-session-action="preview"${reviewUnavailable}>Revisar sesión</button></div></footer>`:''}
      </main>
    </div>`}
  </section>`;
}
// RC71_1_SESSION_LIVE_UX_BEGIN
// A missing prescription must never be presented as prescribed zero.
export function explicitSessionEffort(value,{min=0,max=Number.POSITIVE_INFINITY}={}){
  if(value===null||value===undefined)return null;
  const raw=String(value).trim().replace(',','.');
  if(!/^\d+(?:\.\d+)?$/u.test(raw))return null;
  const parsed=Number(raw);
  return Number.isFinite(parsed)&&parsed>=min&&parsed<=max?parsed:null;
}
function executionTotals(execution){
  const queue=Array.isArray(execution?.queue)?execution.queue:[];
  const resultMap=execution?.results||{};
  const skippedMap=execution?.skippedSets||{};
  const results=Object.values(resultMap);
  const resultKeys=Object.keys(resultMap);
  const skippedKeys=Object.keys(skippedMap);
  const totalSets=queue.reduce(
    (sum,item)=>sum+Math.max(0,Number(item?.sets||0)),
    0,
  );
  const completedSets=results.length;
  const skippedSets=skippedKeys.filter((key)=>!Object.prototype.hasOwnProperty.call(resultMap,key)).length;
  const resolvedSets=Math.min(totalSets,new Set([...resultKeys,...skippedKeys]).size);
  const completedExercises=queue.filter((item)=>{
    const sets=Math.max(0,Number(item?.sets||0));
    for(let setNumber=1;setNumber<=sets;setNumber+=1){
      const step={...item,setNumber,totalSets:item.sets};
      if(executionResultForStep(execution,step,setNumber))return true;
    }
    return false;
  }).length;

  return {
    completedSets,
    skippedSets,
    resolvedSets,
    totalSets,
    completedExercises,
    totalExercises:queue.length,
  };
}

function sessionGoalText(session){
  const value=
    session?.goal??
    session?.objective??
    session?.description??
    null;

  const text=String(value||'').trim();
  return text?text.slice(0,320):null;
}

function syncStateText(execution){
  return ({
    clean:'Sin cambios pendientes',
    pending:'Pendiente de sincronización',
    conflict:'Requiere revisión de sincronización',
    rejected:'Guardado localmente',
  })[execution?.syncStatus||'clean']||'Estado de sincronización disponible';
}

// A published prescription is immutable from the Client's preview. Disclose
// contradictory durations without inventing an observed time or changing the
// Coach's authoritative plan. Warm-up/cool-down may already be included in
// the exercise duration, so never sum them here.
export function sessionDurationConsistency(execution,session){
  const total=Number(session?.durationMinutes);
  if(!Number.isFinite(total)||total<=0)return null;
  const durations=(execution?.queue||[])
    .map(item=>Number(item?.prescription?.plannedDurationMinutes))
    .filter(value=>Number.isFinite(value)&&value>total);
  if(!durations.length)return null;
  return Object.freeze({sessionMinutes:total,exerciseMinutes:Math.max(...durations)});
}

function sessionDurationConsistencyNotice(execution,session,{role='client'}={}){
  const mismatch=sessionDurationConsistency(execution,session);
  if(!mismatch)return '';
  const summary=`La sesión indica ${mismatch.sessionMinutes} min, pero un ejercicio tiene ${mismatch.exerciseMinutes} min previstos.`;
  const guidance=role==='coach'
    ?'Revisa los tiempos antes de ajustar y volver a publicar la prescripción.'
    :'Puedes revisar el entrenamiento. Consulta con tu Coach si necesitas aclarar los tiempos antes de empezar.';
  return `<div class="m26-session-duration-consistency" data-session-duration-consistency role="status"><strong>Revisión de tiempos del plan</strong><p>${e(summary)} ${e(guidance)}</p></div>`;
}

function sessionLiveSummary(execution,session,{ready=false}={}){
  const totals=executionTotals(execution);
  const plannedMinutes=Number(session?.durationMinutes);
  const durationValue=ready
    ?(
      Number.isFinite(plannedMinutes)&&plannedMinutes>0
        ?`${Math.round(plannedMinutes)} min`
        :'No indicada'
    )
    :formatDuration(executionElapsedMs(execution));

  const setsValue=ready
    ?`${totals.totalSets}`
    :`${totals.resolvedSets} / ${totals.totalSets}`;

  const setLabel=ready
    ?'Series planificadas'
    :(totals.skippedSets?'Series resueltas':'Series completadas');
  const setsDetail=!ready&&totals.skippedSets
    ?`${plural(totals.completedSets,'registrada','registradas')} · ${plural(totals.skippedSets,'omitida','omitidas')}`
    :'';

  return `<div
    class="m26-session-live-summary"
    data-session-live-summary
  >
    <div>
      <span>${ready?'Duración prevista':'Tiempo activo'}</span>
      <strong>${e(durationValue)}</strong>
    </div>
    <div>
      <span>Ejercicios</span>
      <strong>${e(totals.totalExercises)}</strong>
    </div>
    <div>
      <span>${e(setLabel)}</span>
      <strong>${e(setsValue)}</strong>
      ${setsDetail?`<small>${e(setsDetail)}</small>`:''}
    </div>
    <div>
      <span>Guardado</span>
      <strong>${e(syncStateText(execution))}</strong>
    </div>
  </div>`;
}

function sessionLiveGoal(session){
  const goal=sessionGoalText(session);
  if(!goal)return '';

  return `<div class="m26-session-live-goal">
    <span>Objetivo de la sesión</span>
    <strong>${e(goal)}</strong>
  </div>`;
}

export function sessionAdjustmentCounts(execution){
  const events=Array.isArray(execution?.events)?execution.events:[];
  const count=(type)=>events.reduce((total,item)=>total+(item?.type===type?1:0),0);
  return {
    substitutions:count('EXERCISE_SUBSTITUTED'),
    skippedSets:count('SET_SKIPPED'),
    skippedExercises:count('EXERCISE_SKIPPED'),
    extraSets:Math.max(0,count('SET_ADDED')-count('SET_ADD_UNDONE')),
    extraRounds:Math.max(0,count('GROUP_ROUND_ADDED')-count('GROUP_ROUND_ADD_UNDONE')),
    addedExercises:Math.max(0,count('EXERCISE_ADDED')-count('EXERCISE_ADD_UNDONE')),
  };
}
function renderSessionAdjustmentSummary(execution){
  const counts=sessionAdjustmentCounts(execution);
  const items=[
    ['Sustituciones',counts.substitutions],
    ['Series omitidas',counts.skippedSets],
    ['Ejercicios omitidos',counts.skippedExercises],
    ['Series extra',counts.extraSets],
    ['Rondas extra',counts.extraRounds],
    ['Ejercicios añadidos',counts.addedExercises],
  ].filter(([,value])=>value>0);
  if(!items.length)return '';
  const detail=items.map(([label,value])=>'<span><span>'+e(label)+'</span> <strong>'+e(value)+'</strong></span>').join('<span aria-hidden="true"> · </span>');
  return '<div class="m26-notice m26-session-adjustments" data-session-adjustments><strong>'+e('Ajustes realizados')+'</strong><span>'+detail+'</span></div>';
}
function completedSessionFeedback(execution){
  const feedback=execution?.feedback||{};
  const comment=String(feedback.comment??'').trim();
  const painNotes=feedback.pain===true?String(feedback.painNotes??'').trim():'';
  const painLabel=feedback.pain===true?'Molestias registradas para seguimiento'
    :feedback.pain===false?'Sin molestias registradas':'Molestias: sin dato registrado';
  return `<div class="m26-notice m26-session-final-feedback" data-session-final-feedback>
    <strong>Feedback de cierre</strong>
    <p>${e(painLabel)}</p>
    ${comment?`<p><strong>Observación:</strong> ${e(comment)}</p>`:''}
    ${painNotes?`<p><strong>Detalle de molestias:</strong> ${e(painNotes)}</p>`:''}
  </div>`;
}
function coachCompletionCue(execution){
  const changes=sessionAdjustmentCounts(execution);
  if(execution?.feedback?.pain===true)
    return 'El feedback recoge molestias. Valora esa señal antes de adaptar la próxima sesión.';
  if([changes.substitutions,changes.skippedSets,changes.skippedExercises,changes.extraSets,changes.extraRounds,changes.addedExercises].some((n)=>n>0))
    return 'Revisa las adaptaciones registradas y sus motivos antes de reutilizar la planificación.';
  return 'La sesión está cerrada. Revisa los resultados y el feedback antes de preparar la siguiente sesión.';
}
// Evidence is derived from the execution's immutable plan snapshot and recorded
// results; missing sets or values remain unknown, never assumed or estimated.
export function renderCoachCompletionEvidence(execution,session,catalog){
  const queue=Array.isArray(execution?.queue)?execution.queue:[];
  if(!queue.length)return '';
  const snapshot=execution?.planSnapshot?.sessionId===execution?.sessionId
    ?execution.planSnapshot:null;
  const historical=Array.isArray(snapshot?.queue)?snapshot.queue:[];
  const blocks=Array.isArray(snapshot?.blocks)?snapshot.blocks:[];
  const units=historical.filter((item)=>item?.exerciseId).map((planned)=>({planned,actualItems:[]}));
  for(const item of queue){
    if(!item?.exerciseId)continue;
    const slot=units.find(({planned})=>planned?.blockId===item.blockId
      &&(item.groupType?planned.groupOrder===item.groupOrder:!planned.groupType));
    if(slot)slot.actualItems.push(item);
    else units.push({planned:null,actualItems:[item]});
  }
  const count=(value)=>{
    const number=Number(value);
    return Number.isInteger(number)&&number>0&&number<=100?number:0;
  };
  const recorded=(result)=>Boolean(result&&typeof result==='object'&&[
    result.reps,result.seconds,result.distanceKm,result.distanceM,result.intervalsCompleted,
  ].some((value)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))));
  const nameFor=(exerciseId,block)=>{
    if(block?.type==='exercise'&&block.exerciseId===exerciseId&&block.name)return String(block.name);
    const catalogName=typeof catalog?.get==='function'?catalog.get(exerciseId)?.name_es:null;
    return String(catalogName||'Ejercicio sin nombre en catálogo').trim();
  };
  const rows=units.map(({planned,actualItems},index)=>{
    const first=actualItems[0]||planned;
    const block=blocks.find((candidate)=>candidate?.id===(planned?.blockId||first?.blockId))||null;
    const originalName=planned?nameFor(planned.exerciseId,block):null;
    const recordedNames=[...new Set(actualItems.map((item)=>nameFor(item.exerciseId,block)))];
    const changed=Boolean(planned&&actualItems.some((item)=>item.exerciseId!==planned.exerciseId));
    const displayName=originalName||recordedNames[0]||`Ejercicio ${index+1}`;
    const prescription=planned?.prescription||{};
    const profile=exerciseMeasurementProfile({id:planned?.exerciseId||first?.exerciseId,name_es:displayName});
    const plannedGoal=planned&&(profile.cardio||profile.kind==='carry')?metricPrescriptionSummary(prescription,{id:planned.exerciseId,name_es:displayName,measurementProfile:prescription.measurementProfile}):planned?[
      String(prescription.reps??'').trim()||null,
      String(prescription.plannedLoad??'').trim()?`Carga ${String(prescription.plannedLoad).trim()}`:null,
      explicitSessionEffort(prescription.targetRpe,{min:1,max:10})!==null?`RPE ${prescription.targetRpe}`:null,
      explicitSessionEffort(prescription.targetRir,{min:0,max:10})!==null?`RIR ${prescription.targetRir}`:null,
    ].filter(Boolean).join(' · ')||'Sin objetivo cuantitativo confirmado'
      :snapshot?'Añadido durante la sesión; no figuraba en el plan original'
        :'Sin snapshot histórico confirmado';
    const actual=[];
    const omissions=[];
    let totalSets=0;
    for(const item of actualItems){
      const sets=count(item.sets);
      totalSets+=sets;
      for(let number=1;number<=sets;number+=1){
        const step={...item,setNumber:number,totalSets:sets};
        const result=executionResultForStep(execution,step,number);
        if(recorded(result))actual.push({number,result,exerciseId:item.exerciseId});
        else{
          const skipped=skippedSetForStep(execution,step,number);
          if(skipped)omissions.push({number,reason:skipped.reason,exerciseId:item.exerciseId});
        }
      }
    }
    const setList=actual.map(({number,result,exerciseId})=>
      `<li><span>${e(nameFor(exerciseId,block))} · Serie ${e(number)}</span><strong>${e(currentSetResultSummary(result))}</strong>${result.notes?`<p>${e(result.notes)}</p>`:''}</li>`
    ).join('');
    const omittedList=omissions.map(({number,reason,exerciseId})=>
      `<li><span>${e(nameFor(exerciseId,block))} · Serie ${e(number)}</span><strong>Omitida explícitamente</strong>${reason?`<p>${e(reason)}</p>`:''}</li>`
    ).join('');
    const missing=Math.max(0,totalSets-actual.length-omissions.length);
    const extra=planned?Math.max(0,totalSets-count(planned.sets)):0;
    const changeNote=changed?`<p>Sustitución registrada: ${e(originalName)} → ${e(recordedNames.join(' / '))}</p>`:'';
    const planCount=planned?`${e(count(planned.sets))} series · `:'';
    const extraNote=extra>0?`<p>${e(extra)} serie${extra===1?'':'s'} adicional${extra===1?'':'es'} respecto del plan original.</p>`:'';
    return `<li class="m26-session-completion-evidence-item" data-completion-evidence-block="${e(first?.blockId||'')}">
      <div class="m26-session-completion-evidence-heading"><strong>${e(displayName)}</strong><span>${e(actual.length)} de ${e(totalSets)} series registradas</span></div>
      <p><span>Previsto:</span> ${planCount}${e(plannedGoal)}</p>
      ${changeNote}
      <ol>${setList}${omittedList||(!actual.length?'<li>Sin series registradas</li>':'')}</ol>
      ${omissions.length?`<p>${e(omissions.length)} serie${omissions.length===1?'':'s'} omitida${omissions.length===1?'':'s'} expresamente.</p>`:''}
      ${missing?`<p>${e(missing)} serie${missing===1?'':'s'} sin registro; no se considera${missing===1?'':'n'} realizada${missing===1?'':'s'} ni omitida${missing===1?'':'s'}.</p>`:''}
      ${extraNote}
    </li>`;
  });
  if(!rows.length)return '';
  return `<details class="m26-session-options m26-session-completion-evidence" data-coach-completion-evidence>
    <summary>Revisar planificado y registrado</summary>
    <p>Datos de esta ejecución. Las series sin registro no se tratan como realizadas y las cargas no se convierten ni se suman automáticamente.</p>
    <ol class="m26-session-completion-evidence-list">${rows.join('')}</ol>
  </details>`;
}
function completedSessionSummary(execution){
  const totals=executionTotals(execution);
  const feedback=execution?.feedback||{};
  const sessionRpe=explicitSessionEffort(feedback.sessionRpe,{min:1,max:10});

  return `<div class="m26-session-completion-grid">
    <div>
      <span>Tiempo activo</span>
      <strong>${e(formatDuration(executionElapsedMs(execution)))}</strong>
    </div>
    <div>
      <span>${totals.skippedSets?'Series resueltas':'Series'}</span>
      <strong>${e(totals.resolvedSets)} / ${e(totals.totalSets)}</strong>
      ${totals.skippedSets?`<small>${e(plural(totals.completedSets,'registrada','registradas'))} · ${e(plural(totals.skippedSets,'omitida','omitidas'))}</small>`:''}
    </div>
    <div>
      <span>Ejercicios registrados</span>
      <strong>${e(totals.completedExercises)} / ${e(totals.totalExercises)}</strong>
    </div>
    <div>
      <span>RPE de sesión</span>
      <strong>${sessionRpe!==null?e(sessionRpe)+'/10':'Pendiente'}</strong>
    </div>
  </div>`;
}

function sessionSetFocus({step,planned,previousSet,exerciseMemory,restActive=false,exercise={}}={}){
  const profile=exerciseMeasurementProfile({...exercise,measurementProfile:planned?.measurementProfile});
  const target=(profile.cardio||profile.kind==='carry')
    ?metricPrescriptionSummary(planned,{...exercise,measurementProfile:planned?.measurementProfile})
    :[
      planned?.reps||null,
      planned?.plannedLoad?`Carga ${planned.plannedLoad}`:null,
      explicitSessionEffort(planned?.targetRpe,{min:1,max:10})!==null?`RPE ${planned.targetRpe}`:null,
      explicitSessionEffort(planned?.targetRir,{min:0})!==null?`RIR ${planned.targetRir}`:null,
    ].filter(Boolean).join(' · ')||'Según indicación';

  const previous=previousSet
    ?previousSetSummary(previousSet)
    :exerciseMemory?.latest?.lastLoad?.raw||null;

  return `<section
    class="m26-session-set-focus${restActive?' is-rest':''}"
    data-session-touch-focus
    aria-label="Serie actual y referencia"
  >
    <div class="m26-session-set-focus-number">
      <span>${restActive?'Completada':'Serie actual'}</span>
      <strong>${e(step?.setNumber||1)}<small>/${e(step?.totalSets||1)}</small></strong>
    </div>
    <div>
      <span>Objetivo</span>
      <strong>${e(target)}</strong>
    </div>
    <div>
      <span>Referencia anterior</span>
      <strong>${e(previous||'Sin referencia confirmada')}</strong>
    </div>
    ${explicitSessionEffort(planned?.restSeconds,{min:0,max:3600})!==null?`<div><span>Descanso previsto</span><strong>${e(planned.restSeconds)} s</strong></div>`:''}
  </section>`;
}

function carrySetEntryFields(planned={},isCoach=false){
  return `<div class="${isCoach?'m26-session-coach-set-fields':'m26-field-grid m26-session-set-fields'}" data-session-carry-entry>
    <div class="m26-field-grid">
      <label>Distancia realizada (m)<input type="number" min="0" max="100000" step="1" inputmode="decimal" data-set-field="distanceM" placeholder="${e(planned.plannedDistanceM||'')}"></label>
      <label>Tiempo realizado (s)<input type="number" min="0" max="86400" step="1" inputmode="decimal" data-set-field="seconds"></label>
      <label>Carga transportada<input type="text" maxlength="80" data-set-field="load" placeholder="${e(planned.plannedLoad||'')}"></label>
      <label>RPE real<input type="number" min="1" max="10" step="0.5" inputmode="decimal" data-set-field="rpe" required></label>
    </div>
    <small>Registra distancia, tiempo o ambos; la carga sigue siendo opcional si corresponde.</small>
  </div>`;
}
function recordedSportCorrectionFields(profile,recorded={}){
  const field=(name,label,options={})=>{
    const type=options.type||'number';
    const attrs=type==='number'?' min="'+e(options.min??0)+'" max="'+e(options.max??86400)+'" step="'+e(options.step??'any')+'"':'';
    return '<label>'+e(label)+'<input type="'+e(type)+'"'+attrs+' value="'+e(options.value??'')+'" data-set-field="'+e(name)+'"></label>';
  };
  const actual=(key)=>recorded?.[key]??'';
  const rpe=['rpe','RPE real',{min:1,max:10,step:0.5,value:actual('rpe')}];
  if(profile.cardio){
    const minutes=recorded.seconds==null?'':Number((Number(recorded.seconds)/60).toFixed(6));
    const entries=[
      ['durationMinutes','Tiempo realizado (min)',{max:1440,value:minutes}],
      ...(profile.sport==='swimming'?[['distanceM','Metros nadados',{max:100000,step:1,value:actual('distanceM')}]]:[['distanceKm','Distancia realizada (km)',{max:1000,value:actual('distanceKm')}]]),
      ...(profile.kind==='intervals'?[['intervalsCompleted','Intervalos completados',{min:1,max:1000,step:1,value:actual('intervalsCompleted')}]]:[]),
      ['avgHeartRateBpm','FC media (lpm) · opcional',{min:30,max:250,step:1,value:actual('avgHeartRateBpm')}],
      ...(['running','walking'].includes(profile.sport)?[['paceMinPerKm','Ritmo medio (min/km)',{type:'text',value:actual('paceMinPerKm')}]]:[]),
      ...(profile.sport==='swimming'?[['pacePer100M','Ritmo medido (min/100 m)',{type:'text',value:actual('pacePer100M')}]]:[]),
      ...(profile.sport==='cycling'?[
        ['avgSpeedKmh','Velocidad media (km/h)',{max:140,value:actual('avgSpeedKmh')}],
        ['cadenceRpm','Cadencia (rpm)',{max:250,value:actual('cadenceRpm')}],
        ['powerWatts','Potencia (W)',{max:2500,value:actual('powerWatts')}],
      ]:[]),
      ...(profile.sport==='swimming'?[]:[['elevationGainM','Desnivel positivo (m)',{max:15000,value:actual('elevationGainM')}]]),rpe,
    ];
    return entries.map(([key,label,options])=>field(key,label,options)).join('');
  }
  if(profile.kind==='carry')return [
    ['distanceM','Distancia realizada (m)',{max:100000,value:actual('distanceM')}],
    ['seconds','Tiempo (s)',{max:86400,value:actual('seconds')}],
    ['load','Carga transportada',{type:'text',value:actual('load')}],rpe,
  ].map(([key,label,options])=>field(key,label,options)).join('');
  return [
    ['reps','Repeticiones',{max:10000,step:1,value:actual('reps')}],
    ['seconds','Tiempo (s)',{max:86400,step:1,value:actual('seconds')}],
    ['load','Carga',{type:'text',value:actual('load')}],rpe,
    ['rir','RIR',{max:10,step:0.5,value:actual('rir')}],
  ].map(([key,label,options])=>field(key,label,options)).join('');
}
function cardioSetEntryFields(profile,planned={},isCoach=false){
 const field=(name,label,{max='',min=0,step='any',type='number',inputmode='decimal',placeholder=''}={})=>`<label data-session-field-priority="primary">${e(label)}<input type="${e(type)}"${max!==''?` max="${e(max)}"`:''} min="${e(min)}" step="${e(step)}" inputmode="${e(inputmode)}" enterkeyhint="next" data-set-field="${e(name)}"${placeholder?` placeholder="${e(placeholder)}"`:''}></label>`;
 const duration=field('durationMinutes','Tiempo realizado (min)',{max:1440,step:0.1,placeholder:planned.plannedDurationMinutes||''});
 const distance=profile.sport==='swimming'?field('distanceM','Metros nadados',{max:100000,step:1,placeholder:planned.plannedDistanceM||''}):field('distanceKm','Distancia realizada (km)',{max:1000,step:0.01,placeholder:planned.plannedDistanceKm||''});
 const interval=profile.kind==='intervals'?field('intervalsCompleted','Intervalos completados',{max:1000,step:1,placeholder:planned.intervalRepetitions||''}):'';
 const hr=field('avgHeartRateBpm','FC media (lpm) · opcional',{min:30,max:250,step:1});
 const pace=['running','walking'].includes(profile.sport)?field('paceMinPerKm','Ritmo medio (min/km) · opcional',{type:'text',inputmode:'text',step:'',placeholder:'06:00'}):profile.sport==='swimming'?field('pacePer100M','Ritmo medido (min/100 m) · opcional',{type:'text',inputmode:'text',step:'',placeholder:'01:55'}):'';
 const speed=profile.sport==='cycling'?field('avgSpeedKmh','Velocidad media (km/h) · opcional',{max:140,step:0.1}):'';
 const cadence=profile.sport==='cycling'?field('cadenceRpm','Cadencia media (rpm) · opcional',{max:250,step:1}):'';
 const power=profile.sport==='cycling'?field('powerWatts','Potencia media (W) · opcional',{max:2500,step:1}):'';
 const elevation=profile.sport==='swimming'?'':field('elevationGainM','Desnivel positivo (m) · opcional',{max:15000,step:1});
 const rpe=field('rpe','RPE real · obligatorio',{min:1,max:10,step:0.5,placeholder:planned.targetRpe||7});
 return `<div class="${isCoach?'m26-session-coach-set-fields':'m26-field-grid m26-session-set-fields'}" data-session-cardio-entry data-session-metric-kind="${e(profile.kind)}">
  <div class="m26-field-grid m26-session-cardio-core">${duration}${distance}${interval}${rpe}</div>
  <details class="m26-session-options"><summary>${profile.sport==='swimming'?'Ritmo medido, FC y contexto · opcionales':'FC, ritmo y datos de actividad · opcionales'}</summary><div class="m26-field-grid">${hr}${pace}${speed}${cadence}${power}${elevation}</div><small>Introduce únicamente mediciones reales. No se estiman a partir de la carga o las repeticiones.</small></details>
 </div>`;
}
export function renderLiveModalityPrescription(planned={},profile={},exercise={},role='client'){
  if(profile.cardio||profile.kind==='carry'){
    const objective=metricPrescriptionSummary(planned,{...exercise,measurementProfile:planned.measurementProfile});
    return `<div class="m26-field-grid">
      <div class="m26-field"><span>${profile.kind==='carry'?'Objetivo de transporte':'Objetivo de resistencia'}</span><strong>${e(objective)}</strong></div>
      ${profile.kind==='carry'&&planned.plannedLoad?`<div class="m26-field"><span>Carga prevista</span><strong>${e(planned.plannedLoad)}</strong><small>Confirma la carga realmente utilizada durante la ejecución.</small></div>`:''}
      ${explicitSessionEffort(planned.targetRpe,{min:1,max:10})!==null?`<div class="m26-field"><span>RPE objetivo</span><strong>${e(planned.targetRpe)}</strong></div>`:''}
      ${explicitSessionEffort(planned.restSeconds,{min:0,max:3600})!==null?`<div class="m26-field"><span>Descanso</span><strong>${e(planned.restSeconds)} s</strong></div>`:''}
    </div>`;
  }
  return `          <div class="m26-field-grid">
            <div class="m26-field">
              <span>Repeticiones/tiempo</span>
              <strong>${e(planned.reps||'Según indicación')}</strong>
            </div>
            ${planned.plannedLoad?`<div class="m26-field"><span>Carga planificada</span><strong>${e(planned.plannedLoad)}</strong><small>${role==='coach'?'Puede prepararse como borrador editable; confirma la carga realizada':'No se autocompleta la carga realizada'}</small></div>`:''}
            ${explicitSessionEffort(planned.restSeconds,{min:0,max:3600})!==null?`<div class="m26-field"><span>Descanso</span><strong>${e(planned.restSeconds)} s</strong></div>`:''}
            ${String(planned.tempo??'').trim()?`<div class="m26-field"><span>Ritmo prescrito</span><strong>${e(planned.tempo)}</strong></div>`:''}
            ${explicitSessionEffort(planned.targetRpe,{min:1,max:10})!==null||explicitSessionEffort(planned.targetRir,{min:0,max:10})!==null
              ?`<div class="m26-field"><span>Esfuerzo objetivo</span><strong>${e([explicitSessionEffort(planned.targetRpe,{min:1,max:10})!==null?`RPE ${planned.targetRpe}`:null,explicitSessionEffort(planned.targetRir,{min:0,max:10})!==null?`RIR ${planned.targetRir}`:null].filter(Boolean).join(' · '))}</strong></div>`
              :''}
          </div>`;
}

export function renderGuidedExecution({execution,session,catalog,actionState,mediaMap,role='client',clientContext=null,wearableContext=null,exerciseMemoryFor=null}={}){
  const state=renderActionState(actionState);
  const sync=renderSessionSyncBanner(execution,{role});
  const goal=sessionLiveGoal(session);

  const isCoach=String(role||'').trim().toLowerCase()==='coach';
  const professionalClientContext=renderProfessionalSessionClientContext(clientContext,role);

  // In the ready state, show the useful sport target without requiring the
  // client to start the clock. Objectives are never displayed as measurements.
  const readySportTargets=execution?.status==='ready'&&Array.isArray(execution?.queue)
    ?execution.queue.map(item=>{
      const exercise=catalog?.get?.(item?.exerciseId)||{};
      const prescription=item?.prescription||{};
      const profile=exerciseMeasurementProfile({...exercise,measurementProfile:prescription.measurementProfile});
      if(!profile.cardio)return null;
      return '<div class="m26-field"><span>'+e(exerciseDisplayName(exercise))+'</span><strong>'
        +e(metricPrescriptionSummary(prescription,{...exercise,measurementProfile:prescription.measurementProfile}))
        +'</strong></div>';
    }).filter(Boolean).slice(0,4).join(''):'';
  const readySportPreview=readySportTargets
    ?'<section class="m26-session-ready-sport-preview" data-session-ready-sport-preview aria-label="Objetivos previstos de la sesión"><p class="m26-eyebrow">Objetivos deportivos · previstos</p><div class="m26-field-grid">'+readySportTargets+'</div></section>'
    :'';

  if(execution.status==='ready'){
    return `<section class="m26-guided m26-session-live" data-session-live-state="ready">
      ${professionalClientContext}${state}
      ${sync}
      <div class="m26-panel m26-session-live-hero">
        <div class="m26-session-live-heading">
          <div>
            <p class="m26-eyebrow">${isCoach?'Sesión programada':'Tu próxima sesión'}</p>
            <h2>${e(session.title||'Sesión IBERFIT')}</h2>
            <p>${isCoach?'Confirma el contexto y empieza a trabajar con el cliente.':'Revisa el plan y empieza cuando estés preparado.'}</p>
          </div>
          <span class="m26-session-live-status">Preparada</span>
        </div>
        ${sessionLiveSummary(execution,session,{ready:true})}
        ${goal}
        ${readySportPreview}
        ${sessionDurationConsistencyNotice(execution,session,{role})}
        ${isCoach?'':renderSessionHealthContext(wearableContext)}
        <div class="m26-session-live-actions">
          <button type="button" data-session-action="exit-session">Volver</button>
          <button type="button" class="m26-primary-action" data-session-action="start">Comenzar entrenamiento</button>
        </div>
      </div>
    </section>`;
  }

  if(execution.status==='awaiting_feedback'){
    const feedbackIntro=isCoach
      ?'La ejecución ya está registrada. Completa el cierre con el feedback del cliente.'
      :'Tu ejecución ya está registrada. Añade el feedback final para completar el seguimiento.';
    const feedbackTitle=isCoach?'Registra el feedback del cliente':'Cuéntanos cómo te fue';
    const rpeLabel=isCoach?'RPE del cliente':'RPE de la sesión';
    const commentLabel=isCoach?'Feedback / percepción del cliente':'Comentario';
    const painLabel=isCoach?'El cliente reportó dolor o molestia':'Tuve dolor o molestia';
    const feedbackPrivacyNote=isCoach
      ?'Este feedback forma parte del registro del cliente. Para observaciones internas utiliza Notas privadas del entrenador.'
      :'';
    const feedbackQuickRpe='<div class="m26-session-feedback-rpe-quick" data-session-feedback-rpe-quick role="group" aria-label="RPE real al finalizar la sesión"><span>Esfuerzo global real · del 1 al 10</span>'+Array.from({length:10},(_,index)=>index+1).map((value)=>'<button type="button" data-session-action="set-session-rpe-quick" data-rpe-value="'+e(value)+'" aria-label="RPE '+e(value)+'" aria-pressed="false">'+e(value)+'</button>').join('')+'</div>';
    const reviewLastSetAction=Array.isArray(execution?.queue)&&execution.queue.length
      ?'<button type="button" data-session-action="previous">Revisar última serie</button>'
      :'';
    const feedbackNeedsReview=Boolean(execution?.finalFeedbackDraft?.needsReview);
    const feedbackReviewNotice=feedbackNeedsReview
      ?'<p class="m26-notice" data-session-feedback-review-required>El entrenamiento cambió después de escribir este feedback. Revísalo antes de finalizar para confirmar que sigue representando la sesión completa.</p>'
      :'';
    return `<section class="m26-guided m26-session-live" data-session-live-state="feedback">
      ${professionalClientContext}${state}
      ${sync}
      ${timerStrip(execution)}
      <div class="m26-panel" data-session-live-feedback>
        <p class="m26-eyebrow">Feedback final</p>
        <h2>${e(feedbackTitle)}</h2>
        <div class="m26-field-grid">
          <label>${e(rpeLabel)}<input type="number" min="1" max="10" inputmode="numeric" data-session-feedback-rpe required></label>
          ${feedbackQuickRpe}
          <label>${e(commentLabel)}<textarea data-session-feedback-comment maxlength="2000" required></textarea></label>
          <label><input type="checkbox" data-session-feedback-pain aria-controls="m26-session-feedback-pain-detail" aria-expanded="false"> ${e(painLabel)}</label>
          <label data-session-feedback-pain-detail hidden>Detalle de dolor <small>Obligatorio si marcas dolor o molestia</small><textarea id="m26-session-feedback-pain-detail" data-session-feedback-pain-notes maxlength="1000"></textarea></label>
        </div>
        ${feedbackPrivacyNote?`<p class="m26-notice" data-session-coach-feedback-privacy>${e(feedbackPrivacyNote)}</p>`:''}
        ${feedbackReviewNotice}
        <p class="m26-notice">Puedes salir y terminar después. El feedback escrito se conserva en este dispositivo y la sesión no se marcará como completada hasta confirmar el cierre.</p>
        <div class="m26-session-live-actions">
          ${reviewLastSetAction}
          <button type="button" data-session-action="exit-session">Guardar y salir</button>
          <button type="button" class="m26-primary-action" data-session-action="finish">Finalizar y guardar</button>
        </div>
      </div>
      <div class="m26-panel m26-session-live-hero">
        <div class="m26-session-live-heading">
          <div>
            <p class="m26-eyebrow">Entrenamiento terminado</p>
            <h2>Último paso: cerrar la sesión</h2>
            <p>${e(feedbackIntro)}</p>
          </div>
          <span class="m26-session-live-status">Cierre</span>
        </div>
        ${completedSessionSummary(execution)}
        ${renderSessionAdjustmentSummary(execution)}
      </div>
      ${liveTelemetryStrip(execution,catalog)}
    </section>`;
  }

  if(execution.status==='paused'){
    return `<section class="m26-guided m26-session-live" data-session-live-state="paused">
      ${professionalClientContext}${state}
      ${sync}
      ${timerStrip(execution)}
      <div class="m26-panel m26-session-live-hero">
        <p class="m26-eyebrow">Sesión en pausa</p>
        <div class="m26-session-live-actions" data-session-paused-early-controls>
          <button type="button" class="m26-primary-action" data-session-action="resume">Reanudar sesión</button>
          <button type="button" class="m26-session-live-exit-action" data-session-action="exit-session">Guardar y salir</button>
        </div>
        <div class="m26-session-live-heading">
          <div>
            <h2>${e(session.title||'Sesión IBERFIT')}</h2>
            <p>${isCoach?'El registro del cliente sigue protegido. El tiempo activo se detiene hasta reanudar.':'Tu registro sigue protegido. El tiempo activo se detiene y podrás continuar donde lo dejaste.'}</p>
          </div>
          <span class="m26-session-live-status">Pausada</span>
        </div>
        ${sessionLiveSummary(execution,session)}
        <details class="m26-session-options">
          <summary>Cancelar esta sesión</summary>
          <label>Motivo para cancelar<input data-session-cancel-reason maxlength="500"></label>
          <button type="button" data-session-action="cancel">Cancelar sesión</button>
        </details>
      </div>
      ${liveTelemetryStrip(execution,catalog)}
    </section>`;
  }

  if(execution.status==='cancelled'){
    return `<section class="m26-guided m26-session-live" data-session-live-state="cancelled">
      ${professionalClientContext}${state}
      ${sync}
      <div class="m26-panel m26-session-live-hero">
        <p class="m26-eyebrow">Sesión cancelada</p>
        <h2>${e(session.title||'Sesión IBERFIT')}</h2>
        <p>${e(execution.cancellationReason||'La sesión fue cancelada.')}</p>
        <p>${execution.syncStatus==='clean'?'Cancelación confirmada.':'Cancelación guardada localmente; aún no está confirmada.'}</p>
        ${sessionLiveSummary(execution,session)}
        <button type="button" class="m26-primary-action" data-session-action="exit-session">Volver a sesiones</button>
      </div>
    </section>`;
  }

  if(execution.status==='completed'){
    const confirmed=execution.syncStatus==='clean';
    const feedbackSummary=completedSessionFeedback(execution);
    const progressActionLabel=isCoach?'Revisar seguimiento':'Ver mi progreso';
    const progressActionArea=isCoach?'expediente':'progreso';
    const continuityCopy=isCoach
      ?coachCompletionCue(execution)
      :'Tu seguimiento ya puede continuar desde Progreso.';
    const completedProgressAction=isCoach
      ?`<button type="button" class="m26-primary-action" data-m26-coach-action="true" data-m26-client-id="${e(execution.clientId||session.clientId||'')}" data-m26-target-area="expediente" data-m26-target-focus="action-outcome">${e(progressActionLabel)}</button>`
      :`<button type="button" class="m26-primary-action" data-m26-area="${e(progressActionArea)}">${e(progressActionLabel)}</button>`;
    const completedActions=confirmed
      ?`<div class="m26-session-live-actions"><button type="button" data-session-action="exit-session">Volver a sesiones</button>${completedProgressAction}</div>`
      :`<button type="button" class="m26-primary-action" data-session-action="exit-session">Volver a sesiones</button>`;

    return `<section class="m26-guided m26-session-live" data-session-live-state="completed">
      ${professionalClientContext}${state}
      ${sync}
      <div class="m26-panel m26-session-live-hero">
        <div class="m26-session-live-heading">
          <div>
            <p class="m26-eyebrow">Entrenamiento guardado</p>
            <h2>Sesión completada</h2>
            <p>${confirmed
              ?e(isCoach?'Los resultados y el feedback registrado quedaron confirmados.':'Los resultados y tu feedback quedaron confirmados.')
              :'Los resultados están guardados en este dispositivo y pendientes de sincronización.'}</p>
          </div>
          <span class="m26-session-live-status">${confirmed?'Confirmada':'Pendiente'}</span>
        </div>
        ${completedSessionSummary(execution)}
        ${renderSessionAdjustmentSummary(execution)}
        ${isCoach?renderCoachCompletionEvidence(execution,session,catalog):''}
        ${feedbackSummary}
        ${confirmed?`<p>${e(continuityCopy)}</p>`:''}
        ${completedActions}
      </div>
    </section>`;
  }

  const step=currentStep(execution,session);
  if(!step)return '<section class="m26-panel"><h2>Sesión finalizada</h2></section>';

  const ex=catalog.get(step.exerciseId)||step.exercise||{};
const planned=step.prescription||{};
const executionProfile=exerciseMeasurementProfile({...ex,measurementProfile:planned.measurementProfile});
const explicitRpe=explicitSessionEffort(planned.targetRpe,{min:1,max:10});
const explicitRir=explicitSessionEffort(planned.targetRir,{min:0,max:10});
const coachQuickRpe=isCoach
  ?`<div class="m26-session-coach-rpe-quick" role="group" aria-label="Registrar RPE real rápido"><span>RPE real</span>${coachQuickRpeValues(planned.targetRpe).map((value)=>`<button type="button" data-session-action="set-rpe-quick" data-rpe-value="${e(value)}" aria-label="RPE ${e(value)}" aria-pressed="false">${e(value)}</button>`).join('')}</div>`
  :'';
const clientQuickRpe=!isCoach
  ?`<div class="m26-session-client-rpe-quick" data-session-client-rpe-quick role="group" aria-label="Registrar esfuerzo real de la serie"><span>Selecciona tu RPE real · del 1 al 10</span>${Array.from({length:10},(_,index)=>index+1).map((value)=>`<button type="button" data-session-action="set-rpe-quick" data-rpe-value="${e(value)}" aria-label="RPE ${e(value)}" aria-pressed="false">${e(value)}</button>`).join('')}</div>`
  :'';
const setEntryRule=executionProfile.sport==='swimming'
  ?'Registra tiempo y metros nadados. Si mides el ritmo, utiliza min/100 m; el RPE real es obligatorio.'
  :['running','walking'].includes(executionProfile.sport)
    ?'Registra tiempo y distancia realizados. El ritmo medido se expresa en min/km; el RPE real es obligatorio.'
    :executionProfile.cardio
      ?'Registra tiempo o distancia realizados, sin confundir objetivos con medidas. El RPE real es obligatorio.'
      :executionProfile.kind==='carry'
        ?'Registra distancia o tiempo realizados y RPE real. La carga es opcional.'
        :'Registra repeticiones o tiempo. La carga es opcional; el RPE es obligatorio.';
const isTimedStrength=executionProfile.kind==='isometric';
// Make the measured action the first field while retaining both observation
// keys (reps and seconds), so no historical recording capability is removed.
const repetitionObservationField=`<label data-session-field-priority="${isTimedStrength?'secondary':'primary'}" data-session-observed-metric="reps">Repeticiones${isTimedStrength?' <small>Opcional</small>':''}<input type="number" min="0" max="10000" inputmode="numeric" enterkeyhint="next" data-set-field="reps"></label>`;
const durationObservationField=`<label data-session-field-priority="${isTimedStrength?'primary':'secondary'}" data-session-observed-metric="seconds">Tiempo (s)${isTimedStrength?'':' <small>Opcional</small>'}<input type="number" min="0" max="86400" inputmode="numeric" enterkeyhint="next" data-set-field="seconds"></label>`;
const strengthObservationFields=isTimedStrength
  ?`${durationObservationField}${repetitionObservationField}`
  :`${repetitionObservationField}${durationObservationField}`;
const setEntryFields=executionProfile.cardio
  ?cardioSetEntryFields(executionProfile,planned,isCoach)
  :executionProfile.kind==='carry'?carrySetEntryFields(planned,isCoach)
  :isCoach
  ?`<div class="m26-session-coach-set-fields" data-session-coach-set-fields>
      <div class="m26-session-coach-work-fields" data-session-entry-group="work">
        ${strengthObservationFields}
      </div>
      <label class="m26-session-coach-load-field" data-session-field-priority="primary" data-session-entry-group="load">Carga<input type="text" maxlength="80" enterkeyhint="next" data-set-field="load"></label>
      <div class="m26-session-coach-effort-fields" data-session-entry-group="effort">
        <div class="m26-session-coach-effort-pair">
          <label data-session-field-priority="primary">RPE<input type="number" min="1" max="10" step="0.5" inputmode="decimal" enterkeyhint="done" data-set-field="rpe" data-session-enter-complete required placeholder="${e(explicitRpe===null?'RPE real':`Objetivo ${explicitRpe}`)}"></label>
          <label data-session-field-priority="secondary">RIR <small>Opcional</small><input type="number" min="0" max="10" step="0.5" inputmode="decimal" enterkeyhint="done" data-set-field="rir" placeholder="${e(explicitRir===null?'RIR real':`Objetivo ${explicitRir}`)}"></label>
        </div>
        ${coachQuickRpe}
      </div>
      <small class="m26-session-guided-entry-note">IBERFIT completa automáticamente lo seguro. Revisa los datos y registra el RPE real.</small>
    </div>`
  :`<div class="m26-field-grid m26-session-set-fields">
      ${strengthObservationFields}
      <label data-session-field-priority="primary">Carga<input type="text" maxlength="80" enterkeyhint="next" data-set-field="load"></label>
      <label data-session-field-priority="primary">RPE<input type="number" min="1" max="10" step="0.5" inputmode="decimal" enterkeyhint="done" data-set-field="rpe" required placeholder="${e(explicitRpe===null?'RPE real':`Objetivo ${explicitRpe}`)}"></label>
      <label data-session-field-priority="secondary">RIR <small>Opcional</small><input type="number" min="0" max="10" step="0.5" inputmode="decimal" enterkeyhint="done" data-set-field="rir" placeholder="${e(explicitRir===null?'RIR real':`Objetivo ${explicitRir}`)}"></label>
    </div>`;
const previousSet=previousSetDraftValues(execution);
const plannedSetPreset=isCoach&&!previousSet?plannedSetDraftValues(execution,session):null;
const plannedSetReuse=plannedSetPreset
  ?`<div class="m26-field-grid" data-session-planned-set><div class="m26-field"><span>Punto de partida</span><strong>${e(previousSetSummary(plannedSetPreset))}</strong><div class="m26-session-repeat-actions"><button type="button" data-session-action="reuse-planned-set" aria-label="Usar el objetivo planificado como borrador y revisarlo antes de confirmar">Usar objetivo y revisar</button></div><small class="m26-session-repeat-note">Solo completa el borrador · confirma después lo que realmente se hizo.</small></div></div>`
  :'';
const previousSetReuse=previousSet
  ?`<div class="m26-field-grid" data-session-previous-set><div class="m26-field"><span>Serie anterior</span><strong>${e(previousSetSummary(previousSet))}</strong><div class="m26-session-repeat-actions"><button type="button" data-session-action="reuse-previous-set" aria-label="Usar los datos de la serie anterior y revisarlos antes de confirmar">Usar y revisar</button>${isCoach&&!executionProfile.cardio?`<button type="button" class="m26-session-fast-action" data-session-action="repeat-previous-set" data-rest-seconds="${e(planned.restSeconds??60)}" data-rpe-value="${e(previousSet.rpe||'')}" aria-label="Confirmar que el esfuerzo real de esta serie fue RPE ${e(previousSet.rpe||'sin indicar')} y repetir el trabajo anterior">Repetir y completar</button>`:''}</div>${isCoach?'<small class="m26-session-repeat-note">Si el esfuerzo fue igual, confirma RPE anterior en un toque. Si cambió, indica el RPE real antes de repetir. No copia notas ni RIR.</small>':''}</div></div>`
  :'';
const currentExerciseHistory=renderCurrentExerciseHistory(execution,step);
const exerciseMemory=exerciseMemoryFor?.(step.exerciseId)||null;
  const totals=executionTotals(execution);
  const progress=Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (totals.resolvedSets/Math.max(1,totals.totalSets))*100,
      ),
    ),
  );
  const progressLabel=totals.skippedSets
    ?`${totals.resolvedSets} de ${totals.totalSets} series resueltas · ${plural(totals.skippedSets,'omitida','omitidas')}`
    :`${totals.completedSets} de ${totals.totalSets} series`;
  const liveAddOptions=isCoach?liveAddExerciseOptions(catalog,ex):'';
  const liveAlternatives=liveAlternativeOptions(catalog,ex,planned.alternativeId);
  const alternatives=liveAlternatives.markup;
  const substitutionUnavailable=liveAlternatives.count===0;
  const visual=renderExerciseMedia({
    manifest:mediaMap,
    exercise:{...ex,id:step.exerciseId},
    role,
    showCredit:true,
    fallback:false,
  });
  const recorded=executionResultForStep(execution,step);
  const currentQueueItem=execution?.queue?.[execution.index]||null;
  const structureUndo=isCoach?executionStructureUndoState(execution):null;
  const hasNextPlannedStep=hasNextExecutionStep(execution);
  const coachExtraSetReady=Boolean(
    isCoach&&
    recorded&&
    !currentQueueItem?.groupType&&
    Number(execution.setIndex)+1===Number(currentQueueItem?.sets||0)&&
    Number(currentQueueItem?.sets||0)<100
  );
  const currentGroupItems=currentQueueItem?.groupType
    ?execution.queue.map((item,index)=>({item,index})).filter(({item})=>item.blockId===currentQueueItem.blockId&&item.groupType===currentQueueItem.groupType)
    :[];
  const groupRoundCounts=[...new Set(currentGroupItems.map(({item})=>Number(item.sets||0)))];
  const coachExtraGroupRoundReady=Boolean(
    isCoach&&recorded&&currentGroupItems.length>1&&groupRoundCounts.length===1&&
    execution.index===currentGroupItems[currentGroupItems.length-1]?.index&&
    Number(execution.setIndex)+1===Number(currentQueueItem?.sets||0)&&
    Number(currentQueueItem?.sets||0)<100
  );
  const substitutionScope=currentExerciseSubstitutionScope(execution);
  const substitutionLocked=substitutionScope==='locked';
  const substitutionDisabled=substitutionLocked||substitutionUnavailable;
  const substitutionTitle=substitutionLocked
    ?'Este ejercicio ya no puede sustituirse sin alterar trabajo registrado'
    :(substitutionUnavailable?'No hay alternativas compatibles disponibles':'');
  const substitutionActionLabel=substitutionScope==='remaining'?'Usar alternativa en las series restantes':'Usar alternativa';
  const restSeconds=restRemainingSeconds(execution);
  const restActive=Boolean(recorded&&restSeconds>0);
  const nextStep=nextExecutionStep(execution,session);
  const nextCopy=nextExecutionCopy(execution,catalog);
  const nextExercisePreview=restActive
  ?nextSessionPreparation(execution,catalog,mediaMap,role)
  :'';
  const transitionsToNextExercise=Boolean(
    restActive&&
    nextStep&&
    (
      nextStep.blockId!==step.blockId||
      nextStep.exerciseId!==step.exerciseId
    )
  );
  const coachNextExerciseHandoff=Boolean(isCoach&&transitionsToNextExercise);
  const restCurrentMedia=restActive
    ?(
      coachNextExerciseHandoff
        ?`<details class="m26-session-rest-current-reference" data-session-rest-current-reference><summary>Ejercicio completado · ver referencia</summary><div class="m26-session-rest-current-media" aria-label="Ejercicio actual">${visual}</div></details>`
        :`<div class="m26-session-rest-current-media" aria-label="Ejercicio actual">${visual}</div>`
    )
    :'';
  const restTransitionContext=coachNextExerciseHandoff
    ?`<p data-session-next-preview>Siguiente: <strong>${e(nextCopy.detail||nextCopy.label)}</strong></p>${nextExercisePreview}${restCurrentMedia}`
    :`${restCurrentMedia}<p data-session-next-preview>Siguiente: <strong>${e(nextCopy.detail||nextCopy.label)}</strong></p>${nextExercisePreview}`;
  const recordedGuidance=restActive
    ?'Tu serie ya está guardada. Descansa o continúa cuando estés preparado.'
    :hasNextPlannedStep
      ?'Tu serie ya está guardada. Continúa cuando estés preparado.'
      :'Última serie guardada. Revísala o continúa al cierre.';
  const resultSummary=recorded
    ?[
        recorded.reps!=null?`${recorded.reps} rep${Number(recorded.reps)===1?'':'s'}`:null,
        recorded.seconds!=null?`${recorded.seconds} s`:null,
        recorded.load||null,
        recorded.rpe!=null&&String(recorded.rpe).trim()!==''&&Number.isFinite(Number(recorded.rpe))&&Number(recorded.rpe)>0?`RPE ${recorded.rpe}`:null,
        recorded.rir!=null&&Number.isFinite(Number(recorded.rir))?`RIR ${recorded.rir}`:null,
      ].filter(Boolean).join(' · ')
    :'';
  const touchFocus=sessionSetFocus({
    step,
    planned,
    previousSet,
    exerciseMemory,
    restActive,
    exercise:ex,
  });
  const liveTelemetry=liveTelemetryStrip(execution,catalog);
  const liveTelemetryDisclosure=liveTelemetry
    ?`<details class="m26-session-live-data">
        <summary>Datos en vivo y contexto</summary>
        ${liveTelemetry}
      </details>`
    :'';

  const setPanel=recorded
    ?`<article
        class="m26-panel m26-panel-soft m26-session-rest-focus m26-session-rest-focus-v3${restActive?' is-active':''}"
        data-session-rest-focus
        data-session-rest-active="${restActive?'true':'false'}"
      >
        <div class="m26-session-live-heading">
          <div>
            <p class="m26-eyebrow">${restActive?'Descanso activo':'Serie registrada'}</p>
            <h3>${e(resultSummary||'Resultado guardado')}</h3>
          </div>
          <div class="m26-session-rest-countdown" aria-live="off">
            <span>${restActive?'Descanso':'Listo'}</span>
            <strong role="timer" aria-live="off"${restActive?' data-session-rest-countdown-value':''}>${restActive?e(restSeconds)+' s':'Continuar'}</strong>
          </div>
        </div>
        <p class="m26-session-rest-guidance">${e(recordedGuidance)}</p>
        ${restTransitionContext}
        <details class="m26-session-options" data-session-rest-correction>
          <summary>Corregir esta serie</summary>
          <p>La corrección queda registrada como un evento distinto; no borra silenciosamente el dato anterior.</p>
          <div class="m26-field-grid" data-session-correction-profile="${e(executionProfile.kind)}">
            ${recordedSportCorrectionFields(executionProfile,recorded)}
          </div>
          <label>Notas<textarea maxlength="1000" data-set-field="notes">${e(recorded.notes||'')}</textarea></label>
          <button type="button" data-session-action="correct-set">Guardar corrección</button>
        </details>
        ${state}
        <div class="m26-session-live-actions">
          ${restActive?'<button type="button" data-session-action="rest-minus">−15 s</button><button type="button" data-session-action="rest-plus">+15 s</button>':''}
          ${coachExtraSetReady?'<button type="button" class="m26-session-fast-action m26-session-extra-set-action" data-session-action="extra-set-now" aria-label="Añadir una serie extra y continuar directamente con ella">+ 1 serie y seguir</button>':''}${coachExtraGroupRoundReady?'<button type="button" class="m26-session-fast-action m26-session-extra-set-action" data-session-action="extra-group-round-now" aria-label="Añadir una ronda extra al bloque y continuar directamente con ella">+ 1 ronda y seguir</button>':''}
          <button type="button" class="m26-primary-action" data-session-action="next">${restActive?'Continuar ahora':e(nextCopy.label)}</button>
        </div>
      </article>`
    :`<article class="m26-panel m26-session-live-entry m26-session-live-entry-v3" data-session-live-entry data-session-set-entry="current">
        <p class="m26-eyebrow">Serie ${e(step.setNumber)} de ${e(step.totalSets)}</p>
        <h3>Registra lo que realmente hiciste</h3>
        <p class="m26-session-set-rule">${e(setEntryRule)}</p>
        ${plannedSetReuse}
        ${previousSetReuse}
        ${setEntryFields}
        ${clientQuickRpe}
        <details>
          <summary>Añadir una nota a esta serie</summary>
          <label>Notas<textarea maxlength="1000" data-set-field="notes"></textarea></label>
        </details>
        ${state}
        <button type="button" class="m26-primary-action" data-session-action="complete-set" data-rest-seconds="${e(planned.restSeconds??60)}">Completar serie</button>
        <details class="m26-session-options">
          <summary>No realizar esta serie</summary>
          <label>Motivo<input maxlength="500" data-session-skip-set-reason placeholder="Ej. molestia, fatiga o ajuste técnico"></label>
          ${coachReasonPresets('skip-set',isCoach)}
          <button type="button" data-session-action="skip-set">Omitir serie con motivo</button>
        </details>
      </article>`;

  const cues=(ex.cues||[]).join(' · ');

  return `<section class="m26-guided m26-session-live m26-session-live-v2 m26-session-live-v3" data-session-live-state="${restActive?'rest':'active'}" data-session-live-v3 data-session-role="${isCoach?'coach':'client'}">
    ${professionalClientContext}
    ${sync}
    <header class="m26-session-live-hero">
      <div class="m26-session-live-heading">
        <div>
          <p class="m26-eyebrow">${restActive?'Descanso entre series':'En entrenamiento'}</p>
          <h2>${e(ex.name_es||ex.name||step.exerciseId)}</h2>
          <p>Ejercicio ${e(execution.index+1)} de ${e(execution.queue.length)} · Serie ${e(step.setNumber)} de ${e(step.totalSets)}</p>
        </div>
        <div class="m26-session-live-progress-badge">
          <strong>${e(progress)}%</strong>
          <small data-session-progress-label>${e(progressLabel)}</small>
        </div>
      </div>
      <div class="m26-session-live-quick-exit"><button type="button" class="m26-session-live-exit-action" data-session-action="exit-session">Guardar y salir</button></div>
      ${timerStrip(execution)}
      <progress class="m26-progress" max="100" value="${progress}" aria-label="Progreso ${progress}%">${progress}%</progress>
      ${goal}
    </header>

    <div role="group" class="m26-session-live-quick-actions" data-session-quick-controls ${isCoach?'data-session-coach-quick-controls':'data-session-client-quick-controls'} aria-label="${isCoach?'Acciones rápidas del Coach':'Acciones rápidas del entrenamiento'}">
      <button type="button" class="m26-session-live-quick-pause" data-session-action="pause" aria-label="Pausar el entrenamiento">${isCoach?'Pausar sesión':'Pausar entrenamiento'}</button>
      ${(Number(execution.index)>0||Number(execution.setIndex)>0)?'<button type="button" data-session-action="previous">Anterior</button>':''}
      ${isCoach?'<button type="button" data-session-open-substitution>Ajustar ejercicio</button>':''}
    </div>

    ${touchFocus}

    <div class="m26-session-live-workbench is-${restActive?'rest':'active'}">
      <main class="m26-session-live-primary" aria-label="Registro de la serie actual">
        ${setPanel}
      </main>

      <aside class="m26-session-live-context m26-session-live-context-v3" aria-label="Contexto del ejercicio actual">
        ${restActive?'':visual}
        <section class="m26-panel m26-prescription-summary" data-session-live-prescription>
          <p class="m26-eyebrow">Objetivo de esta serie</p>
          ${renderLiveModalityPrescription(planned,executionProfile,ex,role)}
        </section>
        ${planned.prescriptionNotes?`<section class="m26-session-live-cues" aria-label="Indicaciones planificadas"><span>Indicaciones del Coach</span><strong>${e(planned.prescriptionNotes)}</strong></section>`:''}
        ${planned.progression?`<details class="m26-session-options m26-session-progression"><summary>Progresión prevista</summary><p>${e(planned.progression)}</p><small>Referencia de planificación; no modifica automáticamente la ejecución de hoy.</small></details>`:''}
        ${cues?`<section class="m26-session-live-cues" aria-label="Indicaciones del ejercicio"><span>Claves técnicas</span><strong>${e(cues)}</strong></section>`:''}
        <details class="m26-session-live-secondary-context" data-session-live-secondary-context>
          <summary>Historial, datos y ajustes</summary>
          <div class="m26-session-live-secondary-body">
            ${renderExerciseMemorySession(exerciseMemory)}
            ${currentExerciseHistory}
            <section class="m26-panel m26-panel-soft m26-session-live-options">
              <h3>Ajustes de sesión</h3>
              <details class="m26-session-options" data-session-substitution-panel>
                <summary>Ajustes y alternativas</summary>
            <p>Estos cambios afectan únicamente a la ejecución de hoy; no modifican el plan futuro.</p>
            <label>Alternativa<select data-session-substitute ${substitutionUnavailable?'disabled aria-disabled="true"':''}>${alternatives||'<option value="">Sin alternativas compatibles</option>'}</select></label>
            <label>Motivo de sustitución<input maxlength="500" data-session-substitute-reason></label>
            ${coachReasonPresets('substitute',isCoach)}
            <button type="button" data-session-action="substitute" data-from-exercise-id="${e(step.exerciseId)}" ${substitutionDisabled?`disabled aria-disabled="true" title="${e(substitutionTitle)}"`:''}>${e(substitutionActionLabel)}</button>
            <label>Motivo para omitir el resto del ejercicio<input maxlength="500" data-session-skip-exercise-reason></label>
            ${coachReasonPresets('skip-exercise',isCoach)}
            <button type="button" data-session-action="skip-exercise">Omitir ejercicio restante</button>
            ${isCoach?`<div class="m26-session-live-coach-tools">
              <h4>Ajuste estructural del Coach</h4>
              <button type="button" data-session-action="add-set">Añadir una serie a este ejercicio</button>
              ${currentQueueItem?.groupType?'<button type="button" data-session-action="add-group-round">Añadir una ronda al bloque</button>':''}
              ${structureUndo?'<button type="button" class="m26-text-action" data-session-action="undo-structure-add">'+e(structureUndo.label)+'</button>':''}
              <label>Añadir ejercicio después del actual<select data-session-live-add-exercise><option value="">Seleccionar ejercicio…</option>${liveAddOptions}</select></label>
              <div class="m26-field-grid">
                <label>Series<input type="number" min="1" max="100" value="1" data-session-live-add-sets></label>
                <label>Repeticiones/tiempo<input maxlength="40" value="10" data-session-live-add-reps></label>
                <label>Descanso (s)<input type="number" min="0" max="3600" value="60" data-session-live-add-rest></label>
                <label>Ritmo<input maxlength="40" value="controlado" data-session-live-add-tempo></label>
                <label>RPE objetivo<input type="number" min="1" max="10" step="0.5" value="7" data-session-live-add-rpe></label>
                <label>RIR objetivo<input type="number" min="0" max="10" step="0.5" value="3" data-session-live-add-rir></label>
              </div>
              <button type="button" data-session-action="add-live-exercise">Añadir ejercicio a la sesión de hoy</button>
            </div>`:''}
          </details>
              <details class="m26-session-options">
                <summary>${isCoach?'Cancelar sesión':'Pausa o cancelación'}</summary>
                ${isCoach?'':'<button type="button" data-session-action="pause">Pausar sesión</button>'}
                <label>Motivo para cancelar<input maxlength="500" data-session-cancel-reason></label>
                <button type="button" data-session-action="cancel">Cancelar sesión</button>
              </details>
            </section>
          </div>
        </details>
      </aside>
    </div>

    ${liveTelemetryDisclosure}
  </section>`;
}
// RC71_1_SESSION_LIVE_UX_END
