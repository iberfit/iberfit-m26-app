import { currentStep } from './session-execution.js';
import { executionElapsedMs,formatDuration,restRemainingSeconds } from './session-timer.js';
import {renderExerciseMedia,renderExerciseMediaCredit} from '../library/exercise-media-ui.js';
import {deriveLiveSessionIntelligence} from '../intelligence/live-session-intelligence.js';
import {renderGuidanceTrigger} from '../guidance/contextual-guidance.js';
function e(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function groupName(type){return ({biserie:'Biserie',triserie:'Triserie',circuito:'Circuito',amrap:'AMRAP',tabata:'Tabata'})[type]||type;}
function syncBanner(execution){
  const status=execution?.syncStatus||'clean';if(status==='clean')return '';
  if(status==='pending')return '<div class="m26-sync-banner is-pending" role="status">Guardado en este dispositivo · pendiente de sincronización.</div>';
  if(status==='conflict')return '<div class="m26-sync-banner is-conflict" role="alert">Existe una versión más reciente. Tu progreso local está protegido y requiere revisión.</div>';
  return '<div class="m26-sync-banner is-rejected" role="alert">No fue posible confirmar el último cambio. El progreso local se conserva.</div>';
}
function timerStrip(execution){const elapsed=formatDuration(executionElapsedMs(execution));const rest=restRemainingSeconds(execution);return `<div class="m26-session-timers" aria-live="polite"><span><small>Tiempo activo</small><strong data-session-elapsed>${e(elapsed)}</strong></span><span><small>Descanso</small><strong data-session-rest>${rest?`${rest} s`:'—'}</strong></span></div>`;}
function bpmText(value){
  const number=Number(value);
  return Number.isFinite(number)?`${Math.round(number)} lpm`:'—';
}
function qualityText(intelligence,live){
  const grade=intelligence?.quality?.latestGrade||live?.quality||null;
  if(!grade)return 'Calidad no informada';
  const excluded=Number(intelligence?.quality?.excludedFromDerived||0);
  return excluded
    ?`Calidad ${grade} · ${excluded} muestra${excluded===1?'':'s'} excluida${excluded===1?'':'s'} de métricas`
    :`Calidad ${grade}`;
}
function telemetrySparkline(points=[]){
  if(points.length<2){
    return '<p class="m26-empty-copy">El timeline aparecerá cuando exista cobertura suficiente.</p>';
  }
  const values=points
    .map((point)=>Number(point.bpm))
    .filter(Number.isFinite);
  if(values.length<2)return '';
  const min=Math.min(...values);
  const max=Math.max(...values);
  const span=Math.max(1,max-min);
  const coordinates=points.map((point,index)=>{
    const x=points.length===1?0:(index/(points.length-1))*100;
    const y=34-((Number(point.bpm)-min)/span)*30;
    return `${Math.round(x*10)/10},${Math.round(y*10)/10}`;
  }).join(' ');
  return `<div class="m26-live-hr-chart"><svg viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label="Evolución de frecuencia cardiaca durante la sesión"><polyline points="${e(coordinates)}"></polyline></svg><div class="m26-live-hr-chart-scale"><span>${e(min)} lpm</span><span>${e(max)} lpm</span></div></div>`;
}
function liveTelemetryStrip(execution,catalog){
  const live=execution?.liveTelemetry;
  if(!live)return '';
  const intelligence=deriveLiveSessionIntelligence(execution);
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
    ?catalog?.get?.(response.exerciseId)?.name_es||'Ejercicio actual'
    :'Sin ejercicio correlacionado';
  const responseMarkup=response
    ?`<article class="m26-live-context-card"><span>Respuesta por ejercicio</span><strong>${e(responseName)}</strong><p>Media ${e(bpmText(response.averageBpm))} · Máxima ${e(bpmText(response.maxBpm))} · ${e(response.sampleCount)} muestras</p></article>`
    :'<article class="m26-live-context-card"><span>Respuesta por ejercicio</span><strong>Pendiente de cobertura</strong><p>Se mostrará cuando existan muestras de trabajo correlacionadas.</p></article>';

  const recovery=intelligence.latestRecovery;
  const recoveryName=recovery?.exerciseId
    ?catalog?.get?.(recovery.exerciseId)?.name_es||'Ejercicio'
    :'Descanso';
  let recoveryMarkup='<article class="m26-live-context-card"><span>Recuperación en descanso</span><strong>Pendiente de cobertura</strong><p>Necesita al menos dos lecturas durante el mismo descanso.</p></article>';
  if(recovery?.available){
    const change=Number(recovery.dropBpm);
    const headline=change>=0
      ?`Descenso observado · ${bpmText(change)}`
      :`Cambio observado · +${bpmText(Math.abs(change))}`;
    recoveryMarkup=`<article class="m26-live-context-card"><span>Recuperación en descanso</span><strong>${e(headline)}</strong><p>${e(recoveryName)} · ${e(recovery.elapsedSeconds)} s observados · sin clasificación clínica</p></article>`;
  }

  const correlation=intelligence.latestSetCorrelation;
  const correlationName=correlation?.exerciseId
    ?catalog?.get?.(correlation.exerciseId)?.name_es||'Serie registrada'
    :'Serie registrada';
  const correlationMarkup=correlation
    ?`<article class="m26-live-context-card"><span>FC + esfuerzo percibido</span><strong>${e(correlationName)} · serie ${e(correlation.setNumber)}</strong><p>RPE ${e(correlation.rpe??'—')} · RIR ${e(correlation.rir??'—')} · FC media ${e(bpmText(correlation.heartRate.averageBpm))} · FC máxima ${e(bpmText(correlation.heartRate.maxBpm))}</p></article>`
    :'<article class="m26-live-context-card"><span>FC + esfuerzo percibido</span><strong>Sin serie registrada todavía</strong><p>La correlación aparece después de registrar RPE/RIR.</p></article>';

  return `<section class="m26-panel m26-panel-soft m26-live-telemetry m26-live-intelligence" aria-live="polite"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Inteligencia de sesión en vivo</p><h3>FC actual · ${e(bpmText(intelligence.currentHeartRateBpm))}</h3><p>${e(source)} · ${e(state)} · ${e(qualityText(intelligence,live))}</p></div></div><div class="m26-live-intelligence-grid"><div class="m26-live-intelligence-metric"><span>FC actual</span><strong>${e(bpmText(intelligence.currentHeartRateBpm))}</strong></div><div class="m26-live-intelligence-metric"><span>FC media</span><strong>${e(bpmText(intelligence.averageHeartRateBpm))}</strong></div><div class="m26-live-intelligence-metric"><span>FC máxima</span><strong>${e(bpmText(intelligence.maxHeartRateBpm))}</strong></div><div class="m26-live-intelligence-metric"><span>Cobertura</span><strong>${e(intelligence.interpretableEventCount)} / ${e(intelligence.rawEventCount)}</strong><small>interpretables / raw</small></div></div>${telemetrySparkline(intelligence.timeline.points)}<div class="m26-live-context-grid">${responseMarkup}${recoveryMarkup}${correlationMarkup}</div><details class="m26-live-method"><summary>Cómo se calcula</summary><p>FC media/mínima/máxima: ${e(intelligence.methodology.heartRate)}.</p><p>Calidad: ${e(intelligence.methodology.qualityFilter)}.</p><p>Recuperación: ${e(intelligence.methodology.recovery)}.</p><p>RPE/RIR: ${e(intelligence.methodology.rpeRirCorrelation)}.</p></details><p class="m26-notice">Dato → contexto → entrenador decide. Esta información no modifica automáticamente la prescripción, las cargas, las series ni los ejercicios.</p></section>`;
}function alternativeOptions(catalog,currentExerciseId,pattern='',selectedId=null){return `<option value=""${selectedId?'':' selected'}>Sin alternativa fijada</option>${catalog.search('',pattern?{pattern}:{}).filter((item)=>item.id!==currentExerciseId).slice(0,40).map((item)=>`<option value="${e(item.id)}"${item.id===selectedId?' selected':''}>${e(item.name_es)}</option>`).join('')}`;}
function blockField({blockId,exerciseId='',field,label,value,type='text',min='',max='',step='',maxLength=''}){const guidance=field==='targetRpe'?renderGuidanceTrigger('training-load',{label:'Ayuda sobre carga, RPE y RIR'}):'';return `<label><span class="m26-guidance-inline">${e(label)}${guidance}</span><input type="${e(type)}" value="${e(value)}" data-session-block-field="${e(field)}" data-block-id="${e(blockId)}"${exerciseId?` data-exercise-id="${e(exerciseId)}"`:''}${min!==''?` min="${e(min)}"`:''}${max!==''?` max="${e(max)}"`:''}${step!==''?` step="${e(step)}"`:''}${maxLength!==''?` maxlength="${e(maxLength)}"`:''}></label>`;}
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
  const item=execution?.queue?.[execution.index];
  if(!item)return {label:'Finalizar ejercicio',detail:''};
  if(execution.setIndex+1<item.sets){
    const ex=catalog.get(item.exerciseId);
    return {label:`Continuar · serie ${execution.setIndex+2}`,detail:ex?.name_es||'Mismo ejercicio'};
  }
  const next=execution.queue[execution.index+1];
  if(!next)return {label:'Continuar al cierre',detail:'Última serie completada'};
  const ex=catalog.get(next.exerciseId);
  return {label:'Continuar al siguiente',detail:ex?.name_es||'Siguiente ejercicio'};
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

  return `vs. exposición anterior ${sign}${delta.value}${unit}${percent}`;
}

function renderExerciseMemoryInline(memory){
  const latest=memory?.latest;

  if(!latest){
    return '';
  }

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
        <span>Cambio comparable</span>
        <strong>${e(exerciseMemoryChange(memory))}</strong>
      </div>
    </div>

    <small>
      Referencia histórica. No modifica automáticamente la carga ni la prescripción actual.
    </small>
  </section>`;
}
function exerciseEditor(block,catalog,index,mediaMap,role,exerciseMemoryFor){const exercise=catalog.get(block.exerciseId)||{id:block.exerciseId,name_es:block.name||block.exerciseId,pattern:''};const visual=renderExerciseMedia({manifest:mediaMap,exercise,role,compact:true,fallback:true});const memory=exerciseMemoryFor?.(block.exerciseId)||null;return `<article class="m26-builder-block m26-builder-editor" data-block-id="${e(block.id)}"><header>${visual}<span>${index+1}</span><div><strong>${e(exercise.name_es)}</strong><small>${e(exercise.pattern||'Ejercicio')} · bloque individual</small></div><div class="m26-inline-actions"><button type="button" data-session-action="move-up" data-block-id="${e(block.id)}" aria-label="Mover ${e(exercise.name_es)} hacia arriba">↑</button><button type="button" data-session-action="move-down" data-block-id="${e(block.id)}" aria-label="Mover ${e(exercise.name_es)} hacia abajo">↓</button><button type="button" data-session-action="duplicate-block" data-block-id="${e(block.id)}">Duplicar</button><button type="button" data-session-action="remove-block" data-block-id="${e(block.id)}">Eliminar</button></div></header>${renderExerciseMemoryInline(memory)}<div class="m26-field-grid">${blockField({blockId:block.id,field:'sets',label:'Series',value:block.sets,type:'number',min:1,max:100})}${blockField({blockId:block.id,field:'reps',label:'Repeticiones/tiempo objetivo',value:block.reps,maxLength:80})}${blockField({blockId:block.id,field:'restSeconds',label:'Descanso (s)',value:block.restSeconds,type:'number',min:1,max:3600})}${blockField({blockId:block.id,field:'tempo',label:'Ritmo de ejecución',value:block.tempo,maxLength:80})}${blockField({blockId:block.id,field:'targetRpe',label:'RPE objetivo',value:block.targetRpe,type:'number',min:1,max:10,step:.5})}${blockField({blockId:block.id,field:'targetRir',label:'RIR objetivo',value:block.targetRir,type:'number',min:0,max:10,step:.5})}<label>Alternativa<select data-session-block-field="alternativeId" data-block-id="${e(block.id)}">${alternativeOptions(catalog,block.exerciseId,exercise.pattern,block.alternativeId)}</select></label></div></article>`;}
function groupExerciseEditor(group,exerciseId,catalog,mediaMap,role,exerciseMemoryFor){const exercise=catalog.get(exerciseId)||{id:exerciseId,name_es:exerciseId,pattern:''};const p=group.prescriptions?.[exerciseId]||{};const visual=renderExerciseMedia({manifest:mediaMap,exercise,role,compact:true,fallback:true});const memory=exerciseMemoryFor?.(exerciseId)||null;return `<section class="m26-group-prescription"><div class="m26-group-prescription-heading">${visual}<h4>${e(exercise.name_es)}</h4></div>${renderExerciseMemoryInline(memory)}<div class="m26-field-grid">${blockField({blockId:group.id,exerciseId,field:'reps',label:'Repeticiones/tiempo',value:p.reps||'8–12',maxLength:80})}${blockField({blockId:group.id,exerciseId,field:'restSeconds',label:'Descanso (s)',value:p.restSeconds||60,type:'number',min:1,max:3600})}${blockField({blockId:group.id,exerciseId,field:'tempo',label:'Ritmo de ejecución',value:p.tempo||'controlado',maxLength:80})}${blockField({blockId:group.id,exerciseId,field:'targetRpe',label:'RPE',value:p.targetRpe||7,type:'number',min:1,max:10,step:.5})}${blockField({blockId:group.id,exerciseId,field:'targetRir',label:'RIR',value:p.targetRir??3,type:'number',min:0,max:10,step:.5})}<label>Alternativa<select data-session-block-field="alternativeId" data-block-id="${e(group.id)}" data-exercise-id="${e(exerciseId)}">${alternativeOptions(catalog,exerciseId,exercise.pattern,p.alternativeId)}</select></label></div></section>`;}
function groupEditor(group,catalog,index,mediaMap,role,exerciseMemoryFor){const exercises=(group.exerciseIds||[]).map((id)=>groupExerciseEditor(group,id,catalog,mediaMap,role,exerciseMemoryFor)).join('')||'<p class="m26-empty-copy">Selecciona ejercicios desde la biblioteca.</p>';return `<article class="m26-builder-block m26-builder-editor" data-block-id="${e(group.id)}"><header><span>${index+1}</span><div><strong>${e(groupName(group.type))}</strong><small>${e((group.exerciseIds||[]).length)} ejercicios</small></div><div class="m26-inline-actions"><button type="button" data-session-action="move-up" data-block-id="${e(group.id)}" aria-label="Mover grupo hacia arriba">↑</button><button type="button" data-session-action="move-down" data-block-id="${e(group.id)}" aria-label="Mover grupo hacia abajo">↓</button><button type="button" data-session-action="duplicate-block" data-block-id="${e(group.id)}">Duplicar</button><button type="button" data-session-action="remove-block" data-block-id="${e(group.id)}">Eliminar</button></div></header><div class="m26-field-grid">${blockField({blockId:group.id,field:'rounds',label:'Rondas',value:group.rounds,type:'number',min:1,max:100})}</div>${exercises}</article>`;}
function previewMarkup(draft,catalog,mediaMap,role){const blocks=draft.blocks.map((block,index)=>{if(block.type==='exercise'){const ex=catalog.get(block.exerciseId)||{id:block.exerciseId,name_es:block.name||block.exerciseId};const visual=renderExerciseMedia({manifest:mediaMap,exercise:ex,role,compact:true,fallback:true});return `<li class="m26-session-preview-item">${visual}<div><strong>${index+1}. ${e(ex.name_es)}</strong><p>${e(block.sets)} series · ${e(block.reps)} · descanso ${e(block.restSeconds)} s · RPE ${e(block.targetRpe)}</p></div></li>`;}const exerciseLines=(block.exerciseIds||[]).map((id)=>{const ex=catalog.get(id)||{id,name_es:id};return `<span class="m26-session-preview-exercise">${renderExerciseMedia({manifest:mediaMap,exercise:ex,role,compact:true,fallback:true})}<strong>${e(ex.name_es)}</strong></span>`;}).join('');return `<li class="m26-session-preview-group"><strong>${index+1}. ${e(groupName(block.type))} · ${e(block.rounds)} rondas</strong><div>${exerciseLines}</div></li>`;}).join('');return `<section class="m26-panel m26-session-preview" aria-label="Vista previa de la sesión"><p class="m26-eyebrow">Revisión previa</p><h3>${e(draft.title)}</h3><p>${e(draft.durationMinutes)} minutos · ${e(draft.blocks.length)} bloques</p><ol>${blocks}</ol>${mediaMap?renderExerciseMediaCredit():''}<div class="m26-inline-actions"><button type="button" data-session-action="edit-preview">Seguir editando</button><button type="button" class="m26-primary-action" data-session-action="publish">Publicar sesión</button></div></section>`;}
export function renderSessionBuilder({draft,catalog,query='',filters={},templates=[],actionState,mediaMap,role='coach',exerciseMemoryFor=null}={}){
  const results=catalog.search(query,filters).slice(0,24);
  const blocks=(draft.blocks||[]).map((block,index)=>block.type==='exercise'?exerciseEditor(block,catalog,index,mediaMap,role,exerciseMemoryFor):groupEditor(block,catalog,index,mediaMap,role,exerciseMemoryFor)).join('')||'<p class="m26-empty-copy">Añade ejercicios desde la biblioteca.</p>';
  const metrics=draftMetrics(draft);
  const cards=results.map((item)=>`<button type="button" class="m26-exercise-result" data-session-action="add-exercise" data-exercise-id="${e(item.id)}">${renderExerciseMedia({manifest:mediaMap,exercise:item,role,compact:true,fallback:true})}<span class="m26-exercise-result-copy"><strong>${e(item.name_es)}</strong><small>${e(item.pattern)} · ${e(item.equipment)}</small><em>${e((item.primary_muscles||[]).join(' · ')||'Musculatura no especificada')}</em></span></button>`).join('')||'<p class="m26-empty-copy">No hay coincidencias.</p>';
  const primary=draft.previewAccepted?'':`<button type="button" class="m26-primary-action" data-session-action="preview">Revisar sesión</button><button type="button" data-session-action="publish" disabled aria-disabled="true" title="Revisa la sesión antes de publicarla">Publicar sesión</button>`;
  const templateOptions=(templates||[]).map((item)=>`<option value="${e(item.id)}">${e(item.name)} · v${e(item.version)} · ${e(item.blockCount)} bloques</option>`).join('');
  const templateControls=['coach','admin'].includes(String(role||''))?`<section class="m26-panel m26-panel-soft" data-session-template-tools><div class="m26-panel-heading"><div><p class="m26-eyebrow">Reutilización</p><h3>Plantillas versionadas</h3><p>Se guardan en este dispositivo para tu usuario y no contienen el identificador del cliente.</p></div></div><div class="m26-field-grid"><label>Plantilla guardada<select data-session-template-select><option value="">Seleccionar plantilla…</option>${templateOptions}</select></label><label>Guardar sesión actual como plantilla<input data-session-template-name maxlength="60" placeholder="Ej. Fuerza base A"></label></div><div class="m26-inline-actions"><button type="button" data-session-action="load-template"${templateOptions?'':' disabled aria-disabled="true"'}>Usar plantilla</button><button type="button" data-session-action="save-template">Guardar nueva versión</button></div></section>`:'';
  return `<section class="m26-session-builder"><header><div><p class="m26-eyebrow">Constructor</p><h2>${e(draft.title)}</h2></div><div class="m26-inline-actions"><button type="button" data-session-action="save-draft">Guardar borrador</button><button type="button" data-session-action="exit-session">Salir</button>${primary}</div></header>${actionState?`<div class="m26-action-state is-${e(actionState.status)}" role="status">${e(actionState.message)}</div>`:''}${templateControls}<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Resumen de sesión</p><h3>${plural(metrics.exercises,'ejercicio','ejercicios')} · ${plural(metrics.workUnits,'serie/ronda','series/rondas')}</h3><p>${plural(metrics.blocks,'bloque','bloques')}${metrics.groups?` · ${plural(metrics.groups,'grupo','grupos')}`:''} · ${e(draft.durationMinutes)} min previstos</p></div></div></section><section class="m26-panel m26-panel-soft"><div class="m26-field-grid"><label>Título<input data-session-draft-field="title" maxlength="120" value="${e(draft.title)}"></label><label>Duración estimada (min)<input type="number" min="10" max="240" data-session-draft-field="durationMinutes" value="${e(draft.durationMinutes)}"></label></div></section>${draft.previewAccepted?previewMarkup(draft,catalog,mediaMap,role):`<div class="m26-builder-grid"><div class="m26-panel"><label>Buscar ejercicio<input type="search" value="${e(query)}" data-session-search autocomplete="off"></label><div class="m26-exercise-results">${cards}</div>${mediaMap?renderExerciseMediaCredit({compact:true}):''}</div><div class="m26-panel"><div class="m26-builder-toolbar"><button type="button" data-session-action="add-group" data-group-type="biserie">Biserie</button><button type="button" data-session-action="add-group" data-group-type="triserie">Triserie</button><button type="button" data-session-action="add-group" data-group-type="circuito">Circuito</button><button type="button" data-session-action="add-group" data-group-type="amrap">AMRAP</button><button type="button" data-session-action="add-group" data-group-type="tabata">Tabata</button>${draft.activeGroupId?'<button type="button" data-session-action="close-group">Cerrar grupo activo</button>':''}</div>${draft.activeGroupId?'<p class="m26-notice">Selecciona ejercicios para completar el grupo activo.</p>':''}<div class="m26-builder-blocks">${blocks}</div></div></div>`}</section>`;
}
// RC71_1_SESSION_LIVE_UX_BEGIN
function executionTotals(execution){
  const queue=Array.isArray(execution?.queue)?execution.queue:[];
  const results=Object.values(execution?.results||{});
  const totalSets=queue.reduce(
    (sum,item)=>sum+Math.max(0,Number(item?.sets||0)),
    0,
  );
  const completedSets=results.length;
  const completedExercises=new Set(
    results
      .map((item)=>item?.exerciseId)
      .filter(Boolean),
  ).size;

  return {
    completedSets,
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
    :`${totals.completedSets} / ${totals.totalSets}`;

  const setLabel=ready
    ?'Series planificadas'
    :'Series completadas';

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

function completedSessionSummary(execution){
  const totals=executionTotals(execution);
  const feedback=execution?.feedback||{};
  const sessionRpe=Number(feedback.sessionRpe);

  return `<div class="m26-session-completion-grid">
    <div>
      <span>Tiempo activo</span>
      <strong>${e(formatDuration(executionElapsedMs(execution)))}</strong>
    </div>
    <div>
      <span>Series</span>
      <strong>${e(totals.completedSets)} / ${e(totals.totalSets)}</strong>
    </div>
    <div>
      <span>Ejercicios registrados</span>
      <strong>${e(totals.completedExercises)} / ${e(totals.totalExercises)}</strong>
    </div>
    <div>
      <span>RPE de sesión</span>
      <strong>${Number.isFinite(sessionRpe)?e(sessionRpe)+'/10':'Pendiente'}</strong>
    </div>
  </div>`;
}

export function renderGuidedExecution({execution,session,catalog,actionState,mediaMap,role='client',exerciseMemoryFor=null}={}){
  const state=actionState&&actionState.status!=='idle'
    ?`<div class="m26-action-state is-${e(actionState.status)}" role="${actionState.status==='error'||actionState.status==='retry'?'alert':'status'}" aria-live="polite">${e(actionState.message|| (actionState.status==='loading'?'Procesando…':''))}</div>`
    :'';
  const sync=syncBanner(execution);
  const goal=sessionLiveGoal(session);

  const isCoach=String(role||'').trim().toLowerCase()==='coach';

  if(execution.status==='ready'){
    return `<section class="m26-guided m26-session-live" data-session-live-state="ready">
      ${state}
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
        <div class="m26-session-live-actions">
          <button type="button" data-session-action="exit-session">Volver</button>
          <button type="button" class="m26-primary-action" data-session-action="start">${isCoach?'Iniciar entrenamiento':'Iniciar sesión'}</button>
        </div>
      </div>
    </section>`;
  }

  if(execution.status==='awaiting_feedback'){
    return `<section class="m26-guided m26-session-live" data-session-live-state="feedback">
      ${state}
      ${sync}
      ${timerStrip(execution)}
      ${liveTelemetryStrip(execution,catalog)}
      <div class="m26-panel m26-session-live-hero">
        <div class="m26-session-live-heading">
          <div>
            <p class="m26-eyebrow">Entrenamiento terminado</p>
            <h2>Último paso: cerrar la sesión</h2>
            <p>Tu ejecución ya está registrada. Añade el feedback final para completar el seguimiento.</p>
          </div>
          <span class="m26-session-live-status">Cierre</span>
        </div>
        ${completedSessionSummary(execution)}
      </div>
      <div class="m26-panel" data-session-live-feedback>
        <p class="m26-eyebrow">Feedback final</p>
        <h2>Cuéntanos cómo te fue</h2>
        <div class="m26-field-grid">
          <label>RPE de la sesión<input type="number" min="1" max="10" data-session-feedback-rpe required></label>
          <label>Comentario<textarea data-session-feedback-comment maxlength="2000" required></textarea></label>
          <label><input type="checkbox" data-session-feedback-pain> Tuve dolor o molestia</label>
          <label>Detalle de dolor <small>Obligatorio si marcas dolor o molestia</small><textarea data-session-feedback-pain-notes maxlength="1000"></textarea></label>
        </div>
        <button type="button" class="m26-primary-action" data-session-action="finish">Finalizar y guardar</button>
      </div>
    </section>`;
  }

  if(execution.status==='paused'){
    return `<section class="m26-guided m26-session-live" data-session-live-state="paused">
      ${state}
      ${sync}
      ${timerStrip(execution)}
      ${liveTelemetryStrip(execution,catalog)}
      <div class="m26-panel m26-session-live-hero">
        <div class="m26-session-live-heading">
          <div>
            <p class="m26-eyebrow">Sesión en pausa</p>
            <h2>${e(session.title||'Sesión IBERFIT')}</h2>
            <p>Tu progreso está conservado. El tiempo activo permanece detenido hasta reanudar.</p>
          </div>
          <span class="m26-session-live-status">Pausada</span>
        </div>
        ${sessionLiveSummary(execution,session)}
        <div class="m26-session-live-actions">
          <button type="button" class="m26-primary-action" data-session-action="resume">Reanudar sesión</button>
        </div>
        <details class="m26-session-options">
          <summary>Cancelar esta sesión</summary>
          <label>Motivo para cancelar<input data-session-cancel-reason maxlength="500"></label>
          <button type="button" data-session-action="cancel">Cancelar sesión</button>
        </details>
      </div>
    </section>`;
  }

  if(execution.status==='cancelled'){
    return `<section class="m26-guided m26-session-live" data-session-live-state="cancelled">
      ${state}
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
    const feedback=execution.feedback||{};
    const sessionRpe=Number(feedback.sessionRpe);
    const feedbackSummary=Number.isFinite(sessionRpe)
      ?`<p><strong>RPE de sesión ${e(sessionRpe)}/10</strong> · ${feedback.pain?'Molestia registrada para seguimiento.':'Sin dolor o molestia registrada.'}</p>`
      :'';
    const completedActions=confirmed
      ?`<div class="m26-session-live-actions"><button type="button" data-session-action="exit-session">Volver a sesiones</button><button type="button" class="m26-primary-action" data-m26-area="progreso">Ver mi progreso</button></div>`
      :`<button type="button" class="m26-primary-action" data-session-action="exit-session">Volver a sesiones</button>`;

    return `<section class="m26-guided m26-session-live" data-session-live-state="completed">
      ${state}
      ${sync}
      <div class="m26-panel m26-session-live-hero">
        <div class="m26-session-live-heading">
          <div>
            <p class="m26-eyebrow">Entrenamiento guardado</p>
            <h2>Sesión completada</h2>
            <p>${confirmed?'Los resultados y tu feedback quedaron confirmados.':'Los resultados están guardados en este dispositivo y pendientes de sincronización.'}</p>
          </div>
          <span class="m26-session-live-status">${confirmed?'Confirmada':'Pendiente'}</span>
        </div>
        ${completedSessionSummary(execution)}
        ${feedbackSummary}
        ${confirmed?'<p>Tu seguimiento ya puede continuar desde Progreso.</p>':''}
        ${completedActions}
      </div>
    </section>`;
  }

  const step=currentStep(execution,session);
  if(!step)return '<section class="m26-panel"><h2>Sesión finalizada</h2></section>';

  const ex=catalog.get(step.exerciseId)||step.exercise||{};
  const planned=step.prescription||{};
  const exerciseMemory=exerciseMemoryFor?.(step.exerciseId)||null;
  const totals=executionTotals(execution);
  const progress=Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (totals.completedSets/Math.max(1,totals.totalSets))*100,
      ),
    ),
  );
  const liveAddOptions=isCoach
    ?catalog.search('').filter((item)=>item.id!==step.exerciseId).slice(0,60).map((item)=>`<option value="${e(item.id)}">${e(item.name_es)}</option>`).join('')
    :'';
  const alternatives=catalog.search('',{pattern:ex.pattern})
    .filter((item)=>item.id!==step.exerciseId)
    .slice(0,8)
    .map((item)=>`<option value="${e(item.id)}"${item.id===planned.alternativeId?' selected':''}>${e(item.name_es)}</option>`)
    .join('');
  const visual=renderExerciseMedia({
    manifest:mediaMap,
    exercise:{...ex,id:step.exerciseId},
    role,
    showCredit:true,
    fallback:false,
  });
  const resultKey=`${step.exerciseId}:${step.setNumber}`;
  const recorded=execution.results?.[resultKey]||null;
  const restSeconds=restRemainingSeconds(execution);
  const restActive=Boolean(recorded&&restSeconds>0);
  const nextCopy=nextExecutionCopy(execution,catalog);
  const resultSummary=recorded
    ?[
        recorded.reps!=null?`${recorded.reps} rep${Number(recorded.reps)===1?'':'s'}`:null,
        recorded.seconds!=null?`${recorded.seconds} s`:null,
        recorded.load||null,
        Number.isFinite(Number(recorded.rpe))?`RPE ${recorded.rpe}`:null,
        Number.isFinite(Number(recorded.rir))?`RIR ${recorded.rir}`:null,
      ].filter(Boolean).join(' · ')
    :'';

  const setPanel=recorded
    ?`<article
        class="m26-panel m26-panel-soft m26-session-rest-focus${restActive?' is-active':''}"
        data-session-rest-focus
        data-session-rest-active="${restActive?'true':'false'}"
      >
        <div class="m26-session-live-heading">
          <div>
            <p class="m26-eyebrow">${restActive?'Descanso activo':'Serie registrada'}</p>
            <h3>${e(resultSummary||'Resultado guardado')}</h3>
          </div>
          <div class="m26-session-rest-countdown" aria-live="polite">
            <span>${restActive?'Descanso':'Listo'}</span>
            <strong>${restActive?e(restSeconds)+' s':'Continuar'}</strong>
          </div>
        </div>
        <p data-session-next-preview>Siguiente: <strong>${e(nextCopy.detail||nextCopy.label)}</strong></p>
        <details class="m26-session-options">
          <summary>Corregir esta serie</summary>
          <p>La corrección queda registrada como un evento distinto; no borra silenciosamente el dato anterior.</p>
          <div class="m26-field-grid">
            <label>Repeticiones<input type="number" min="0" max="10000" value="${e(recorded.reps??'')}" data-set-field="reps"></label>
            <label>Tiempo (s)<input type="number" min="0" max="86400" value="${e(recorded.seconds??'')}" data-set-field="seconds"></label>
            <label>Carga<input type="text" maxlength="80" value="${e(recorded.load??'')}" data-set-field="load"></label>
            <label>RPE<input type="number" min="1" max="10" step="0.5" value="${e(recorded.rpe??'')}" data-set-field="rpe" required></label>
            <label>RIR<input type="number" min="0" max="10" step="0.5" value="${e(recorded.rir??'')}" data-set-field="rir"></label>
          </div>
          <label>Notas<textarea maxlength="1000" data-set-field="notes">${e(recorded.notes||'')}</textarea></label>
          <button type="button" data-session-action="correct-set">Guardar corrección</button>
        </details>
        <div class="m26-session-live-actions">
          ${restActive?'<button type="button" data-session-action="rest-minus">−15 s</button><button type="button" data-session-action="rest-plus">+15 s</button>':''}
          <button type="button" class="m26-primary-action" data-session-action="next">${restActive?'Continuar ahora':e(nextCopy.label)}</button>
        </div>
      </article>`
    :`<article class="m26-panel m26-session-live-entry" data-session-live-entry>
        <p class="m26-eyebrow">Serie ${e(step.setNumber)} de ${e(step.totalSets)}</p>
        <h3>Registra lo que realmente hiciste</h3>
        <div class="m26-field-grid">
          <label>Repeticiones<input type="number" min="0" max="10000" data-set-field="reps"></label>
          <label>Tiempo (s)<input type="number" min="0" max="86400" data-set-field="seconds"></label>
          <label>Carga<input type="text" maxlength="80" data-set-field="load"></label>
          <label>RPE<input type="number" min="1" max="10" step="0.5" data-set-field="rpe" required placeholder="Objetivo ${e(planned.targetRpe||7)}"></label>
          <label>RIR <small>Opcional</small><input type="number" min="0" max="10" step="0.5" data-set-field="rir" placeholder="Objetivo ${e(planned.targetRir??3)}"></label>
        </div>
        <details>
          <summary>Añadir una nota a esta serie</summary>
          <label>Notas<textarea maxlength="1000" data-set-field="notes"></textarea></label>
        </details>
        <button type="button" class="m26-primary-action" data-session-action="complete-set" data-rest-seconds="${e(planned.restSeconds||60)}">Completar serie</button>
        <details class="m26-session-options">
          <summary>No realizar esta serie</summary>
          <label>Motivo<input maxlength="500" data-session-skip-set-reason placeholder="Ej. molestia, fatiga o ajuste técnico"></label>
          <button type="button" data-session-action="skip-set">Omitir serie con motivo</button>
        </details>
      </article>`;

  const cues=(ex.cues||[]).join(' · ');

  return `<section class="m26-guided m26-session-live" data-session-live-state="${restActive?'rest':'active'}">
    ${state}
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
          <small data-session-progress-label>${e(totals.completedSets)} de ${e(totals.totalSets)} series</small>
        </div>
      </div>
      ${timerStrip(execution)}
      <progress class="m26-progress" max="100" value="${progress}" aria-label="Progreso ${progress}%">${progress}%</progress>
      ${goal}
    </header>
    ${liveTelemetryStrip(execution,catalog)}
    ${visual}
    <section class="m26-panel m26-prescription-summary" data-session-live-prescription>
      <p class="m26-eyebrow">Objetivo de esta serie</p>
      <div class="m26-field-grid">
        <div class="m26-field">
          <span>Repeticiones/tiempo</span>
          <strong>${e(planned.reps||'Según indicación')}</strong>
        </div>
        <div class="m26-field">
          <span>Descanso</span>
          <strong>${e(planned.restSeconds||60)} s</strong>
        </div>
        <div class="m26-field">
          <span>Ritmo de ejecución</span>
          <strong>${e(planned.tempo||'Controlado')}</strong>
        </div>
        <div class="m26-field">
          <span>Esfuerzo</span>
          <strong>RPE ${e(planned.targetRpe||7)} · RIR ${e(planned.targetRir??3)}</strong>
        </div>
      </div>
    </section>
    ${cues?`<section class="m26-session-live-cues" aria-label="Indicaciones del ejercicio"><span>Claves técnicas</span><strong>${e(cues)}</strong></section>`:''}
    ${renderExerciseMemorySession(exerciseMemory)}
    <div class="m26-guided-main">
      ${setPanel}
      <aside class="m26-panel m26-panel-soft m26-session-live-options">
        <h3>Ajustes de sesión</h3>
        <p>Las modificaciones son explícitas y quedan bajo tu control; la app no cambia la prescripción automáticamente.</p>
        <div class="m26-inline-actions">
          <button type="button" data-session-action="previous">Anterior</button>
        </div>
        <details class="m26-session-options">
          <summary>Ajustes y alternativas</summary>
          <p>Estos cambios afectan únicamente a la ejecución de hoy; no modifican el plan futuro.</p>
          <label>Alternativa<select data-session-substitute>${alternatives}</select></label>
          <label>Motivo de sustitución<input maxlength="500" data-session-substitute-reason></label>
          <button type="button" data-session-action="substitute" data-from-exercise-id="${e(step.exerciseId)}" ${recorded?'disabled aria-disabled="true" title="Continúa a la siguiente serie antes de sustituir"':''}>Usar alternativa</button>
          <label>Motivo para omitir el resto del ejercicio<input maxlength="500" data-session-skip-exercise-reason></label>
          <button type="button" data-session-action="skip-exercise">Omitir ejercicio restante</button>
          ${isCoach?`<div class="m26-session-live-coach-tools">
            <h4>Ajuste estructural del Coach</h4>
            <button type="button" data-session-action="add-set">Añadir una serie a este ejercicio</button>
            <label>Añadir ejercicio después del actual<select data-session-live-add-exercise><option value="">Seleccionar ejercicio…</option>${liveAddOptions}</select></label>
            <div class="m26-field-grid">
              <label>Series<input type="number" min="1" max="100" value="1" data-session-live-add-sets></label>
              <label>Repeticiones/tiempo<input maxlength="40" value="10" data-session-live-add-reps></label>
              <label>Descanso (s)<input type="number" min="1" max="3600" value="60" data-session-live-add-rest></label>
              <label>Ritmo<input maxlength="40" value="controlado" data-session-live-add-tempo></label>
              <label>RPE objetivo<input type="number" min="1" max="10" step="0.5" value="7" data-session-live-add-rpe></label>
              <label>RIR objetivo<input type="number" min="0" max="10" step="0.5" value="3" data-session-live-add-rir></label>
            </div>
            <button type="button" data-session-action="add-live-exercise">Añadir ejercicio a la sesión de hoy</button>
          </div>`:''}
        </details>
        <details class="m26-session-options">
          <summary>Pausa o cancelación</summary>
          <button type="button" data-session-action="pause">Pausar sesión</button>
          <label>Motivo para cancelar<input maxlength="500" data-session-cancel-reason></label>
          <button type="button" data-session-action="cancel">Cancelar sesión</button>
        </details>
      </aside>
    </div>
  </section>`;
}
// RC71_1_SESSION_LIVE_UX_END
