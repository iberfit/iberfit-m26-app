import {appointmentCalendarEvent,googleCalendarUrl} from './calendar.js';
import {renderCompletedSessionHistory} from './completed-session-history.js';
import {clientModalityLabel,normalizeClientModality,resolveSessionExperience} from '../domain/modality.js';
import {getIberfitLanguage} from '../ui/i18n.js';
import {coachLaunchSelfCopy} from './view-model.js';
import {renderExerciseMedia,renderExerciseMediaCredit} from '../library/exercise-media-ui.js';
import {isPublishedSession,sessionHasExecutableBlocks,sessionReadyToStart,sessionRequiresConfirmedAppointment,actorCanExecuteSession,sessionIdOf} from './session-policy.js';

const escape=(value)=>String(value??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');
const formatDate=(value,options={})=>{
  if(!value)return 'Fecha por definir';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'Fecha por definir';
  return new Intl.DateTimeFormat('es-CL',{
    weekday:'long',day:'numeric',month:'long',
    hour:'2-digit',minute:'2-digit',
    timeZone:'America/Santiago',
    ...options,
  }).format(date);
};
const ownershipLabel=(value)=>({
  coach_led:'Presencial con Coach',
  client_autonomous:'Sesión autónoma',
  guided_in_app:'Guiada en la aplicación',
  live_online:'Online en directo',
})[value]||'Sesión IBERFIT';
const modalityLabel=(value)=>({
  presencial:'Presencial',
  guiada_en_app:'Guiada en la aplicación',
  online:'En línea',
})[value]||'Modalidad por definir';
const statusBadge=(text,kind='neutral')=>`<span class="m26-badge is-${escape(kind)}">${escape(text)}</span>`;
const contractModalityOf=(vm)=>vm?.selectedClient?.modality||null;
const publishedBody=(session)=>session?.body&&typeof session.body==='object'&&!Array.isArray(session.body)?session.body:session||{};
const modalityIntro=(role,value)=>{
  const modality=normalizeClientModality(value);
  if(role==='client'){
    if(modality==='presencial')return 'Tus sesiones presenciales muestran horario, asistencia y contexto. La ejecución principal la dirige tu Coach; solo una sesión publicada expresamente como autónoma abre entrenamiento guiado.';
    if(modality==='hibrido')return 'Tu plan híbrido comparte una sola progresión: cada sesión indica si hoy entrenas presencialmente con tu Coach o de forma autónoma, guiado desde la app.';
    if(modality==='online')return 'Tu experiencia online prioriza las sesiones autónomas guiadas desde IBERFIT, con RIR/RPE, descansos, historial y revisión posterior del Coach.';
    return 'Cada sesión respeta su forma real de entrega, visibilidad y permisos antes de permitir la ejecución.';
  }
  if(role==='coach')return 'La experiencia del atleta cambia según su contrato y la entrega real de cada sesión. El Coach mantiene el control de las sesiones supervisadas y la progresión compartida.';
  return 'Supervisión de sesiones por modalidad contractual y tipo real de entrega, sin alterar ownership, visibilidad ni permisos de ejecución.';
};
const experienceFor=(item,role,contractModality)=>resolveSessionExperience({
  contractModality,
  deliveryModality:item.modality,
  ownership:item.ownership,
  clientCanExecute:Boolean(item.canClientExecute),
  role,
  hasFullContent:sessionHasExecutableBlocks(item.session),
  isPublished:Boolean(item.visible||item.canClientExecute),
});
const experiencePanel=(experience,role)=>{
  const caps=experience.capabilities.map((label)=>`<span class="m26-session-experience__capability">${escape(label)}</span>`).join('');
  const roleNote=role==='coach'
    ? `<p class="m26-session-experience__role-note">Vista Coach · ${escape(experience.clientLiveWorkout?'el atleta puede ejecutar esta sesión desde entrenamiento guiado':'la ejecución permanece supervisada')}</p>`
    : role==='admin'
      ? '<p class="m26-session-experience__role-note">Vista Admin · supervisión sin cambiar la propiedad de ejecución</p>'
      : '';
  return `<section class="m26-session-experience" data-session-experience="${escape(experience.kind)}" aria-label="Contexto de sesión ${escape(experience.contractLabel)}">
    <div class="m26-session-experience__copy"><p class="m26-session-experience__eyebrow">${escape(experience.eyebrow)}</p><h4>${escape(experience.headline)}</h4><p>${escape(experience.description)}</p>${roleNote}</div>
    <div class="m26-session-experience__capabilities" aria-label="Capacidades de esta sesión">${caps}</div>
  </section>`;
};
// All start entry points (card and route header) share the same effective
// authorization. Stale projections must never resurrect a hidden/supervised CTA.
const clientCanStartProjection=(item)=>Boolean(item?.visible===true&&item?.visibility==='full'&&
  item?.canClientExecute===true&&item?.canClientStart===true&&
  sessionIdOf(item?.session)===String(item?.id||'')&&
  actorCanExecuteSession({role:'client',session:item?.session,appointment:item?.appointment})&&
  sessionReadyToStart(item?.session)&&
  sessionHasExecutableBlocks(item?.session));
const cardActions=(item,role,experience,{serviceActive=true}={})=>{
  const actions=[];
  const appointmentBody=item.appointment?.body&&typeof item.appointment.body==='object'
    ?item.appointment.body
    :item.appointment||{};
  const appointmentStatus=String(
    item.appointment?.status||
    appointmentBody.status||
    appointmentBody.estado||
    ''
  ).trim().toLowerCase();
  if(['coach','admin'].includes(role)&&item.appointmentId&&['propuesta','pendiente','proposal','pending'].includes(appointmentStatus)){
    actions.push(`<button type="button" class="m26-primary-action" data-workflow-action="confirm-appointment" data-entity-id="${escape(item.appointmentId)}">Confirmar cita</button>`);
  }
  if(item.calendarVisible&&item.appointment){
    let event=null;
    try{event=appointmentCalendarEvent(item.appointment);}catch{}
    if(event){
      actions.push(`<a class="m26-rc39-button" href="${escape(googleCalendarUrl(event))}" target="_blank" rel="noopener noreferrer">Google Calendar</a>`);
      actions.push(`<button type="button" class="m26-rc39-button" data-rc39-action="download-calendar" data-appointment-id="${escape(item.appointmentId)}">Añadir a calendario</button>`);
    }
  }
  if(role==='client'&&item.confirmation?.canConfirm){
    actions.push(`<button type="button" class="m26-primary-action" data-rc39-action="confirm-attendance" data-appointment-id="${escape(item.appointmentId)}">Confirmar asistencia</button>`);
    if(item.changeRequestAvailable){
      actions.push(`<button type="button" class="m26-rc39-button" data-rc39-action="open-change-request" data-appointment-id="${escape(item.appointmentId)}">Solicitar cambio</button>`);
    }
  }
  if(role==='client'&&!experience.clientLiveWorkout&&['coach_led','live_online'].includes(item.ownership)){
    actions.push(`<span class="m26-session-supervised-state" aria-label="Sesión supervisada">${escape(experience.primaryLabel)}</span>`);
  }
  if(role==='coach'){
    const isAppointmentConfirmed=!item.appointment||['confirmada','confirmado','confirmed'].includes(appointmentStatus);
    const needsAppointment=sessionRequiresConfirmedAppointment({role,session:item.session,appointment:item.appointment});
    if(serviceActive&&sessionReadyToStart(item.session)&&(!needsAppointment||(Boolean(item.appointmentId)&&isAppointmentConfirmed))){
      actions.push(`<button type="button" class="m26-primary-action" data-workflow-action="start-published-session" data-entity-id="${escape(item.id)}">Comenzar con Coach</button>`);
    }
    if(item.appointment?.changeRequest?.status==='pending'){
      actions.push(`<button type="button" class="m26-rc39-button" data-rc39-action="resolve-change-request" data-appointment-id="${escape(item.appointmentId)}" data-request-id="${escape(item.appointment.changeRequest.id)}" data-resolution="accepted">Aceptar solicitud</button>`);
      actions.push(`<button type="button" class="m26-rc39-button" data-rc39-action="resolve-change-request" data-appointment-id="${escape(item.appointmentId)}" data-request-id="${escape(item.appointment.changeRequest.id)}" data-resolution="rejected">No aceptar</button>`);
    }
  }
  return actions.length?`<div class="m26-rc39-card-actions">${actions.join('')}</div>`:'';
};
const previewGroupLabels=Object.freeze({
  biserie:'Biserie',triserie:'Triserie',circuito:'Circuito',amrap:'AMRAP',tabata:'Tabata',
});
const previewNumber=(value,{min=0,max=100000}={})=>{
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)&&number>=min&&number<=max?number:null;
};
const previewName=(id,source={},catalog=new Map())=>{
  const exercise=catalog.get(String(id||''))||{};
  return String(exercise.name_es||exercise.name||source.name||source.title||id||'Ejercicio');
};
const previewFacts=(plan={})=>{
  const facts=[
    [previewNumber(plan.sets,{min:1,max:100}),'Series'],
    [plan.reps||null,'Repeticiones / tiempo'],
    [previewNumber(plan.restSeconds,{max:3600})===null?null:`${plan.restSeconds} s`,'Descanso'],
    [previewNumber(plan.targetRpe,{min:1,max:10}),'RPE'],
    [previewNumber(plan.targetRir,{max:10}),'RIR'],
    [plan.tempo||null,'Ritmo'],
    [plan.plannedLoad||plan.load||null,'Carga prevista'],
    [plan.plannedDurationMinutes||null,'Duración (min)'],
    [plan.plannedDistanceKm||null,'Distancia (km)'],
    [plan.plannedDistanceM||null,'Distancia (m)'],
    [plan.plannedPace||plan.plannedPacePer100M||null,'Ritmo objetivo'],
    [plan.targetHeartRateZone||null,'Zona de FC'],
  ].filter(([value])=>value!==null&&value!==undefined&&String(value).trim()!=='');
  return facts.length?`<dl class="m26-session-preview-facts">${facts.map(([value,label])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`:'';
};
const renderPreviewExercise=(id,plan,{catalog,mediaMap,role})=>{
  const exercise=catalog.get(String(id||''))||{};
  const name=previewName(id,plan,catalog);
  const tech=[...(Array.isArray(exercise.instructions_es)?exercise.instructions_es:[]),
    ...(Array.isArray(exercise.cues)?exercise.cues:[])].slice(0,7)
    .map((value)=>String(value||'').trim()).filter(Boolean);
  const precautions=(Array.isArray(exercise.precautions)?exercise.precautions:[]).slice(0,3);
  const alternative=plan.alternativeId?previewName(plan.alternativeId,{},catalog):'';
  const media=renderExerciseMedia({manifest:mediaMap,exercise:{...exercise,id,name_es:name},role,compact:true,fallback:true,priority:false});
  return `<div class="m26-session-preview-exercise">
    <div class="m26-session-preview-media">${media}</div>
    <div class="m26-session-preview-exercise-body"><h5>${escape(name)}</h5>
      ${exercise.equipment?`<p class="m26-session-preview-equipment">${escape(exercise.equipment)}</p>`:''}
      ${previewFacts(plan)}
      ${plan.prescriptionNotes?`<p class="m26-session-preview-cue">${escape(plan.prescriptionNotes)}</p>`:''}
      ${alternative?`<p class="m26-session-preview-cue"><strong>Alternativa:</strong> ${escape(alternative)}</p>`:''}
      ${tech.length||precautions.length?`<details class="m26-session-preview-technique"><summary>Cómo realizarlo</summary>
      ${tech.length?`<ul>${tech.map((x)=>`<li>${escape(x)}</li>`).join('')}</ul>`:''}
      ${precautions.length?`<p><strong>Precauciones:</strong> ${precautions.map(escape).join(' · ')}</p>`:''}</details>`:''}
    </div></div>`;
};
function renderRc39SessionPreview(record,{catalog=[],mediaMap=null,role='client'}={}){
  const source=publishedBody(record);
  // A malformed legacy block must not break the entire Client/Coach route.
  // Keep valid prescription blocks in order; ignore null, sparse or array entries.
  // Iterate only until we collect 120 valid blocks: a large imported list
  // must not allocate a second unbounded array or slow down session opening.
  const blocks=[];
  if(Array.isArray(source.blocks)){
    for(const block of source.blocks){
      if(!block||typeof block!=='object'||Array.isArray(block))continue;
      blocks.push(block);
      if(blocks.length===120)break;
    }
  }
  if(!blocks.length)return '<p class="m26-rc39-summary-copy">Los ejercicios estarán disponibles cuando el entrenador complete la planificación.</p>';
  const byId=new Map((Array.isArray(catalog)?catalog:[]).filter((x)=>x?.id).map((x)=>[String(x.id),x]));
  const rows=blocks.map((block,index)=>{
    const group=previewGroupLabels[String(block?.type||'').toLowerCase()];
    const ids=group&&Array.isArray(block.exerciseIds)?block.exerciseIds.slice(0,12):[];
    const list=ids.length?ids:[block.exerciseId||block.id||''];
    const label=group?`${group}${previewNumber(block.rounds,{min:1,max:100})?` · ${block.rounds} rondas`:''}`:`Ejercicio ${index+1}`;
    return `<li class="m26-session-preview-block"><h4>${escape(label)}</h4>${list.map((id)=>{
      const individual=ids.length?(block.prescriptions?.[id]||{}):block;
      return renderPreviewExercise(id,individual,{catalog:byId,mediaMap,role});
    }).join('')}</li>`;
  }).join('');
  return `<ol class="m26-session-preview-blocks">${rows}</ol>${mediaMap?renderExerciseMediaCredit({compact:true}):''}`;
}
const sessionCard=(item,role,contractModality=null,{serviceActive=true,catalog=[],mediaMap=null}={})=>{
  const kind=item.ownership==='coach_led'?'coach':item.ownership==='live_online'?'online':'autonomous';
  const visibility=item.visibility==='summary_only'?'Solo resumen':item.visibility==='full'?'Contenido completo':'Oculta';
  const experience=experienceFor(item,role,contractModality);
  const supervised=item.ownership==='coach_led'||item.ownership==='live_online';
  const canInspect=role!=='client'||(item.visible===true&&!supervised&&item.visibility==='full'&&
    item.canClientExecute===true&&sessionIdOf(item.session)===String(item.id||'')&&
    actorCanExecuteSession({role:'client',session:item.session,appointment:item.appointment}));
  const detailAvailable=canInspect&&sessionHasExecutableBlocks(item.session);
  const inPreviewStart=role==='client'&&serviceActive&&experience.clientLiveWorkout&&clientCanStartProjection(item)
    ?`<div class="m26-session-preview-actions"><button type="button" class="m26-primary-action m26-live-workout-action" data-workflow-action="start-published-session" data-entity-id="${escape(item.id)}">Comenzar entrenamiento</button></div>`:'';
  const content=detailAvailable
    ? `<details class="m26-rc39-session-content m26-session-preview-disclosure"><summary>${role==='client'?'Ver sesión':'Revisar prescripción y vista del cliente'}</summary><div class="m26-session-preview-body">${role!=='client'?`<p class="m26-session-preview-client-note">${supervised?'Cliente: título, duración y cita; sin prescripción ni inicio autónomo.':'Cliente: ficha completa de ejercicios y comienzo autónomo habilitado según permisos.'}</p>`:''}${renderRc39SessionPreview(item.session,{catalog,mediaMap,role})}${inPreviewStart}</div></details>`
    : `<p class="m26-rc39-summary-copy">${supervised
       ?(item.ownership==='coach_led'?'Esta sesión la dirige tu Coach.':'La sesión se realiza en directo con tu Coach.')
       :'El detalle de esta sesión estará disponible cuando tu Coach lo habilite.'}</p>`;
  const duration=previewNumber(publishedBody(item.session).durationMinutes??item.session?.durationMinutes,{min:1,max:1440});
  const summaryMeta=role==='client'&&supervised?`<p class="m26-session-supervised-duration">${duration?`${escape(duration)} min · `:''}Con tu entrenador</p>`:'';
  const experienceHtml=role==='client'&&supervised?'':experiencePanel(experience,role);
  const contractLabel=clientModalityLabel(contractModality);
  return `<article class="m26-rc39-session-card is-${kind}" data-rc39-session="${escape(item.id)}" data-appointment-card="${escape(item.appointmentId||'')}" data-client-modality="${escape(normalizeClientModality(contractModality)||'unknown')}" data-session-experience-card="${escape(experience.kind)}"${role==='client'?` data-client-session-card-state="${supervised?'supervised':inPreviewStart?'ready':'published'}"`:''} tabindex="-1">
    <header><div><p class="m26-eyebrow">${escape(ownershipLabel(item.ownership))}</p><h3>${escape(item.title)}</h3><p>${escape(formatDate(item.startAt))}</p>${summaryMeta}</div><div>${normalizeClientModality(contractModality)?statusBadge(contractLabel,'neutral'):''}${statusBadge(modalityLabel(item.modality),kind==='autonomous'?'success':'neutral')}${statusBadge(visibility,'neutral')}</div></header>
    ${experienceHtml}
    ${item.location?`<p class="m26-rc39-location"><strong>Lugar:</strong> ${escape(item.location)}</p>`:''}
    ${item.confirmation?`<p class="m26-rc39-confirmation is-${escape(item.confirmation.state)}">${escape(item.confirmation.label)}</p>`:''}
    ${item.appointment?.changeRequest?.status==='pending'?`<aside class="m26-notice is-warning"><strong>Cambio solicitado por el cliente</strong><p>${escape(item.appointment.changeRequest.reason||'Sin motivo registrado')}</p></aside>`:''}
    ${content}
    ${cardActions(item,role,experience,{serviceActive})}
    ${role==='client'&&item.confirmation?.canRequestChange&&item.changeRequestAvailable?`<form class="m26-rc39-change-form" data-rc39-change-form="${escape(item.appointmentId)}" hidden><label>Motivo o alternativa horaria<textarea name="reason" maxlength="500" required></textarea></label><div><button type="submit" class="m26-primary-action">Enviar solicitud</button><button type="button" data-rc39-action="close-change-request">Cancelar</button></div></form>`:''}
  </article>`;
};
function renderCoachLaunchSelf(vm){
  const journey=vm?.rc39?.coachLaunchJourney||vm?.coachLaunchJourney;
  if(!journey)return '';
  const copy=coachLaunchSelfCopy(getIberfitLanguage());
  const milestoneRows=(journey.milestones||[]).map((item)=>{
    const text=copy.milestones?.[item.id]||{label:item.label,done:item.evidence,pending:item.evidence};
    const tone=item.complete?'success':item.id==='profile'?'warning':'neutral';
    return `<article class="m26-list-card" data-coach-launch-milestone="${escape(item.id)}" data-coach-launch-complete="${item.complete?'true':'false'}"><div><p class="m26-eyebrow">${escape(text.label)}</p><h3>${escape(item.complete?text.done:text.pending)}</h3></div>${statusBadge(item.complete?'✓':'—',tone)}</article>`;
  }).join('');
  const status=journey.ready?copy.ready:copy.pending;
  const action=journey.nextCoachAction;
  const actionLabel=action?copy.actions?.[action.labelKey]||action.labelKey:null;
  const actionMarkup=action&&action.area
    ? `<div class="m26-list-card-actions"><button type="button" class="m26-primary-action" data-m26-area="${escape(action.area)}">${escape(actionLabel)}</button></div>`
    : `<p>${escape(copy.noAction)}</p>`;
  const nextLabel=actionLabel
    ?`${copy.nextTitle}: ${actionLabel}`
    :journey.ready?copy.ready
      :!journey.profileVerified||!journey.accountStatusVerified?copy.adminTitle
        :copy.noAction;
  const operationalStarted=(journey.milestones||[]).some((item)=>['client','planning','session'].includes(item?.id)&&item?.complete===true);
  const launchExpanded=!journey.ready&&!operationalStarted;
  const progressCopy=copy.progress(journey.completedCount,journey.total);
  return `<details class="m26-panel m26-panel-soft m26-coach-launch-self" data-coach-launch-self="${escape(journey.stage||'pending')}" data-coach-launch-density="${launchExpanded?'guided':'compact'}"${launchExpanded?' open':''}>
    <summary class="m26-coach-launch-summary" aria-labelledby="m26-coach-launch-title">
      <div class="m26-coach-launch-summary-copy"><p class="m26-eyebrow">${escape(copy.eyebrow)}</p><h2 id="m26-coach-launch-title">${escape(copy.title)}</h2><p>${escape(progressCopy)}</p><p class="m26-coach-launch-summary-next" data-coach-launch-next-label>${escape(nextLabel)}</p></div>
      <div class="m26-coach-launch-summary-status"><strong>${escape(`${journey.percent}%`)}</strong>${statusBadge(status,journey.ready?'success':'pending')}<span class="m26-coach-launch-toggle" aria-hidden="true">＋</span></div>
    </summary>
    <div class="m26-coach-launch-body">
      <p class="m26-coach-launch-intro">${escape(copy.intro)}</p>
      <div class="m26-stat-grid"><article class="m26-stat"><span>${escape(progressCopy)}</span><strong>${escape(`${journey.percent}%`)}</strong><small>${escape(journey.source)}</small></article><article class="m26-stat"><span>${escape(copy.evidenceTitle)}</span><strong>${escape(journey.clientEvidenceCount)}</strong><small>${escape(copy.evidenceCopy)}</small></article></div>
      <meter min="0" max="100" value="${escape(journey.percent)}" aria-label="${escape(progressCopy)}">${escape(`${journey.percent}%`)}</meter>
      <div class="m26-stack">${milestoneRows}</div>
      ${!journey.profileVerified||!journey.accountStatusVerified?`<aside class="m26-notice is-warning" role="status"><strong>${escape(copy.adminTitle)}</strong><p>${escape(copy.adminCopy)}</p></aside>`:''}
      <div><p class="m26-eyebrow">${escape(copy.nextTitle)}</p>${actionMarkup}</div>
    </div>
  </details>`;
}
export function enhanceCoachLaunchSelfMarkup(markup,vm){
  const base=String(markup||'');
  if(base.includes('data-coach-launch-self='))return base;
  const panel=renderCoachLaunchSelf(vm);
  if(!panel)return base;
  const slot='<!-- m26-coach-launch-self-slot -->';
  if(base.includes(slot))return base.replace(slot,panel);
  return base.replace(/<div class="m26-route m26-hoy-route(?: [^"]+)?">/u,(root)=>`${root}${panel}`);
}
function renderClientPlanning(vm){
  const items=vm.rc39?.planningItems||[];
  // Client-only appointments were scoped by ownership, publication and time in the view model.
  const clientAppointments=Array.isArray(vm.clientAppointments)?vm.clientAppointments:[];
  const contractModality=contractModalityOf(vm);
  // Availability is a permission and session-readiness decision, not a modality badge.
  const appExecutable=vm.serviceActive!==false?items.filter((item)=>
    experienceFor(item,'client',contractModality).clientLiveWorkout&&clientCanStartProjection(item)).length:0;
  const supervised=items.filter((item)=>['coach_led','live_online'].includes(item.ownership)).length;
  const sessionCountLabel=items.length===1?'1 sesión publicada':`${items.length} sesiones publicadas`;
  const sessionCountShort=items.length===1?'1 sesión':`${items.length} sesiones`;
  const hasPublished=items.length>0;
  const readyItems=vm.serviceActive!==false?items.filter((item)=>
    clientCanStartProjection(item)&&experienceFor(item,'client',contractModality).clientLiveWorkout):[];
  const nearestAppointment=clientAppointments[0]||null;
  const focus=readyItems[0]
    ?`<section class="m26-signature-task-focus is-ready" data-signature-planning-focus="ready" aria-label="Siguiente acción de entrenamiento"><div><p class="m26-eyebrow">Listo para ti</p><h3>${escape(readyItems[0].title)}</h3><p>Tu Coach ha publicado una sesión que puedes revisar y realizar en la aplicación.</p></div><button type="button" class="m26-primary-action" data-m26-area="sesion">Ver entrenamiento</button></section>`
    :nearestAppointment
      ?`<section class="m26-signature-task-focus" data-signature-planning-focus="appointment" aria-label="Próxima cita confirmada"><div><p class="m26-eyebrow">Lo próximo</p><h3>${escape(nearestAppointment.title||'Tu próxima cita')}</h3><p>${escape(nearestAppointment.dateLabel||'Consulta la fecha en tu agenda')}. Tu Coach dirige las sesiones supervisadas.</p></div><a class="m26-rc39-button" href="#m26-client-next-appointment">Consultar cita</a></section>`
      :'';
  // Keep every published card in the DOM and reachable by native keyboard/touch disclosure.
  const makePlanningCard=(item)=>sessionCard(item,'client',contractModality,{serviceActive:vm.serviceActive!==false,...(vm.sessionPreviewAssets||{})});
  const leadingItems=items.length>6?items.slice(0,4):items;
  const remainingItems=items.length>6?items.slice(4):[];
  const cards=hasPublished?`${leadingItems.map(makePlanningCard).join('')}${remainingItems.length?`<details class="m26-signature-session-archive" data-signature-planning-archive><summary>Ver otras ${remainingItems.length} sesiones publicadas</summary><div class="m26-signature-archive-list">${remainingItems.map(makePlanningCard).join('')}</div></details>`:''}`:'';
  const overview=`<section class="m30-planning-overview${hasPublished?'':' is-pending'}" data-m30-planning-overview data-m30-planning-state="${hasPublished?'published':'pending'}" aria-label="Resumen de tu planificación">
    <div class="m30-planning-overview-copy">
      <p class="m26-eyebrow">Tu semana de un vistazo</p>
      <h3>${hasPublished?escape(sessionCountLabel):'Planificación pendiente'}</h3>
      <p>${hasPublished?'Cada sesión mantiene su modalidad real, permisos de ejecución y contexto. IBERFIT no convierte una sesión supervisada en autónoma.':'Tu semana aún no está publicada. Cuando tu Coach la confirme, verás aquí las sesiones presenciales y las que puedas realizar en la aplicación.'}</p>
      ${hasPublished?'':`<div class="m30-planning-pending-actions"><button type="button" data-m26-area="actividad">Registrar cómo estoy</button><button type="button" data-m26-area="progreso">Ver mi evolución</button></div>`}
    </div>
    ${hasPublished?`<div class="m30-planning-overview-metrics" aria-label="Sesiones publicadas por modalidad">
      <div><span>Total</span><strong>${escape(items.length)}</strong><small>sesiones</small></div>
      <div><span>Con Coach</span><strong>${escape(supervised)}</strong><small>supervisadas</small></div>
      <div><span>En app</span><strong>${escape(appExecutable)}</strong><small>entrenamiento guiado</small></div>
    </div>`:''}
  </section>`;
  const nextAppointmentPanel=`<section id="m26-client-next-appointment" class="m26-panel m30-planning-appointments${clientAppointments.length?'':' is-empty'}" aria-label="Tus próximas citas confirmadas">
    <div class="m26-panel-heading"><div><p class="m26-eyebrow">Agenda confirmada</p><h3>Próximas citas</h3>${clientAppointments.length?'<p>Consulta fecha, modalidad y lugar de tus citas confirmadas.</p>':''}</div></div>
    ${clientAppointments.length?`<div class="m26-stack">${clientAppointments.map((item)=>`<article class="m26-list-card m30-planning-appointment"><div><p class="m26-eyebrow">${escape(item.dateLabel||'Por confirmar')}</p><h4>${escape(item.title||'Sesión IBERFIT')}</h4><p>${escape([item.modality,item.location].filter(Boolean).join(' · ')||'Modalidad pendiente de definir')}</p></div>${statusBadge(item.status||'Confirmada','success')}</article>`).join('')}</div>`:`<div class="m30-planning-appointment-empty"><strong>Sin próximas citas confirmadas</strong><p>Cuando tu Coach confirme una cita, aparecerá aquí.</p></div>`}
  </section>`;
  const modalityLabel=clientModalityLabel(contractModality);
  const planningTitle=modalityLabel==='Sin modalidad'?'Tu planificación':`Planificación · ${modalityLabel}`;
  const planningIntro=hasPublished
    ?'Consulta tus sesiones publicadas, cuándo realizarlas y cuáles puedes iniciar desde la aplicación.'
    :'Aquí tendrás tus sesiones y próximas citas cuando estén confirmadas.';
  return `<div class="m26-route m26-rc39-planning" data-m27-session-surface="planning"><section class="m26-route-intro"><div><p class="m26-eyebrow">Tu semana IBERFIT</p><h2>${escape(planningTitle)}</h2><p>${escape(planningIntro)}</p></div>${hasPublished?statusBadge(sessionCountShort,'neutral'):''}</section>${focus}${overview}${nextAppointmentPanel}${hasPublished?`<section class="m26-rc39-week">${cards}</section>`:''}</div>`;
}
function renderCoachToday(vm){
  const items=vm.rc39?.sessionProjections||[];
  const appointments=vm.rc39?.appointments||[];
  const contractModality=contractModalityOf(vm);
  const today=new Date();
  const todayKey=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(today);
  const todayAppointments=appointments.filter((item)=>{
    if(!item.startAt)return false;
    return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date(item.startAt))===todayKey;
  });
  const list=todayAppointments.length?todayAppointments.map((appointment)=>{
    const projection=items.find((item)=>item.appointmentId===appointment.id&&(vm.role!=='client'||item.visible===true));
    return projection?sessionCard(projection,vm.role,contractModality,vm.sessionPreviewAssets||{}):`<article class="m26-list-card"><div><h3>${escape(appointment.title)}</h3><p>${escape(formatDate(appointment.startAt))}</p></div>${statusBadge(appointment.status||'Sin estado','neutral')}</article>`;
  }).join(''):`<section class="m26-empty"><h3>Sin citas para hoy</h3><p>La agenda no contiene sesiones programadas para este día.</p></section>`;
  return `<div class="m26-route m26-rc39-coach-today"><section class="m26-hero-panel"><div><p class="m26-eyebrow">Centro operativo</p><h2>${vm.role==='admin'?'Operación administrativa y soporte':'Hoy en IBERFIT'}</h2><p>Confirmaciones, sesiones y acciones pendientes en una sola vista.</p></div><div class="m26-hero-signal"><span>Hoy</span><strong>${escape(String(todayAppointments.length))} citas</strong></div></section><section class="m26-stat-grid"><article class="m26-stat"><span>Confirmaciones abiertas</span><strong>${escape(vm.rc39?.confirmationOpen||0)}</strong><small>Ventana de 48 horas</small></article><article class="m26-stat"><span>Cambios solicitados</span><strong>${escape(vm.rc39?.changeRequests||0)}</strong><small>Requieren respuesta</small></article><article class="m26-stat"><span>Sesiones sin contenido</span><strong>${escape(vm.rc39?.needsPreparation||0)}</strong><small>Preparar antes de la cita</small></article></section><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Agenda de hoy</p><h2>Orden operativo</h2></div></div><div class="m26-stack">${list}</div></section></div>`;
}
function agendaAppointmentStatus(appointment={}){
  return String(appointment.status||'').trim().toLowerCase();
}

function agendaClientOptions(vm={}){
  return (vm.clients||[]).map((item)=>{
    const profile=item.profile||{};
    const address=[profile.trainingAddress,profile.commune].filter(Boolean).join(' · ');
    return `<option
      value="${escape(item.id)}"
      data-training-address="${escape(address)}"
      data-client-modality="${escape(profile.modality||item.modality||'')}"
      data-session-duration="${escape(profile.sessionDurationMinutes??'')}"
      ${item.id===vm.selectedClientId?'selected':''}
    >${escape(item.name||'Cliente')}</option>`;
  }).join('');
}

function renderAgendaProposalForm(vm,role){
  if(!['coach','admin'].includes(role))return '';
  const options=agendaClientOptions(vm);
  const activeClientId=(vm.clients||[]).some(c=>c.id===vm.selectedClientId)
    ?vm.selectedClientId:vm.clients?.[0]?.id||'';
  const sessionOptions=(vm.linkableSessions||[]).map(item=>
    `<option value="${escape(item.id)}" data-client-id="${escape(item.clientId)}" data-modality="${escape(item.deliveryModality||'')}" data-session-duration="${escape(item.durationMinutes??'')}"${item.clientId===activeClientId?'':' disabled'}>${escape(item.title||'Sesión publicada')}</option>`
  ).join('');
  return `<form
    id="m26-agenda-proposal-form"
    class="m26-panel m26-panel-soft m30-agenda-proposal"
    data-workflow-form="appointment"
    data-guided-required-form
    aria-labelledby="m26-agenda-proposal-title"
  >
    <div class="m26-panel-heading">
      <div>
        <p class="m26-eyebrow">Nueva propuesta</p>
        <h2 id="m26-agenda-proposal-title">Crear propuesta de cita</h2>
        <p>La propuesta permanece interna hasta que la cita sea confirmada.</p>
      </div>
      ${statusBadge('Privada hasta confirmar','neutral')}
    </div>
    <ol class="m26-agenda-composer-steps" aria-label="Etapas de la programación">
      <li>Cliente</li><li>Entrenamiento</li><li>Horario</li><li>Confirmación posterior</li>
    </ol>
    <div class="m26-field-grid">
      <label>Cliente
        <select name="clientId" required>
          ${options||'<option value="">Sin clientes disponibles</option>'}
        </select>
      </label>
      <label class="m26-wide m26-agenda-linked-field">Entrenamiento de esta cita
        <select name="sessionId" aria-describedby="m26-linked-session-help">
          <option value="">Sin entrenamiento vinculado</option>
          ${sessionOptions}
        </select>
        <small id="m26-linked-session-help">Selecciona una sesión publicada de este Cliente o deja la cita sin entrenamiento.</small>
      </label>
      <label>Modalidad de esta cita
        <select name="modality" required aria-describedby="m26-appointment-guidance">
          <option value="" disabled selected>Seleccionar modalidad</option>
          <option value="presencial">Presencial</option>
          <option value="guiada_en_app">Guiada en la aplicación</option>
          <option value="online">En línea</option>
        </select>
      </label>
      <label>Inicio
        <input type="datetime-local" name="startAt" required>
      </label>
      <label>Fin
        <input type="datetime-local" name="endAt" required>
      </label>
      <label class="m26-wide">Ubicación
        <input name="location" maxlength="300" autocomplete="street-address" aria-describedby="m26-location-help">
      </label>
      <p class="m26-field-help m26-wide m26-agenda-timezone">Horario de Chile continental · America/Santiago. La cita solo será visible al confirmar.</p>
      <p id="m26-appointment-guidance" class="m26-field-help m26-wide" role="status">Elige primero Cliente y entrenamiento; revisa horario y modalidad antes de crear la propuesta.</p>
      <p id="m26-location-help" class="m26-field-help m26-wide">La dirección habitual del expediente se propone automáticamente para citas presenciales.</p>
    </div>
    <div class="m26-inline-actions">
      <button type="submit" class="m26-primary-action" data-workflow-action="create-appointment">Crear propuesta de cita</button>
    </div>
    <div data-workflow-status="appointment" aria-live="polite"></div>
  </form>`;
}

function renderAgendaStandaloneCard(appointment,role){
  const status=agendaAppointmentStatus(appointment);
  const confirmable=['coach','admin'].includes(role)&&
    ['propuesta','pendiente','proposal','pending'].includes(status);
  const detail=[
    modalityLabel(appointment.modality),
    appointment.location,
  ].filter(Boolean).join(' · ');
  const controls=confirmable
    ?`<div class="m26-rc39-card-actions">
        <button
          type="button"
          class="m26-primary-action"
          data-workflow-action="confirm-appointment"
          data-entity-id="${escape(appointment.id)}"
        >Confirmar cita</button>
        <small>Al confirmar será visible para el cliente.</small>
      </div>`
    :'';
  return `<article
    class="m26-rc39-session-card m30-agenda-appointment-card"
    data-appointment-card="${escape(appointment.id)}"
    tabindex="-1"
  >
    <header>
      <div>
        <p class="m26-eyebrow">${appointment.sessionId?'Entrenamiento vinculado':'Cita sin sesión enlazada'}</p>
        <h3>${escape(appointment.title)}</h3>
        <p>${escape(formatDate(appointment.startAt))}</p>
      </div>
      ${statusBadge(appointment.status||'Sin estado',/confirm|realiz|complet/i.test(status)?'success':'neutral')}
    </header>
    ${detail?`<p class="m26-rc39-location">${escape(detail)}</p>`:''}
    ${controls}
  </article>`;
}

function renderAgenda(vm){
  const role=vm.role||vm.rc39?.role;
  const isClient=role==='client';
  const canManage=['coach','admin'].includes(role);
  const contractModality=contractModalityOf(vm);
  const projections=vm.rc39?.sessionProjections||[];
  const appointments=vm.rc39?.appointments||[];

  const proposedCount=appointments.filter((item)=>
    ['propuesta','pendiente','proposal','pending'].includes(agendaAppointmentStatus(item))
  ).length;
  const confirmationOpen=Number(vm.rc39?.confirmationOpen||0);
  const changeRequests=Number(vm.rc39?.changeRequests||0);
  const needsPreparation=Number(vm.rc39?.needsPreparation||0);
  const linkedCount=appointments.filter(item=>Boolean(item.sessionId)).length;
  // Historical and cancelled entries remain in the full agenda but never masquerade
  // as the Client's next confirmed booking. Invalid dates fail closed, not the route.
  const nowMs=Date.now();
  const nextAppointment=isClient?[...appointments]
    .filter((item)=>{
      const when=Date.parse(String(item?.startAt||''));
      const status=agendaAppointmentStatus(item);
      return Number.isFinite(when)&&when>=nowMs&&
        ['confirmada','confirmado','confirmed'].includes(status);
    })
    .sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt))[0]||null
    :appointments[0]||null;

  // Index projections once; the old per-appointment find was quadratic.
  const projectionByAppointment=new Map();
  for(const projection of projections){
    if(!projection?.appointmentId||(isClient&&projection.visible!==true))continue;
    if(!projectionByAppointment.has(projection.appointmentId))
      projectionByAppointment.set(projection.appointmentId,projection);
  }
  const cards=appointments.length
    ?appointments.map((appointment)=>{
      const item=projectionByAppointment.get(appointment.id);
      return item
        ?sessionCard(item,role,contractModality,vm.sessionPreviewAssets||{})
        :renderAgendaStandaloneCard(appointment,role);
    }).join('')
    :'<section class="m26-empty"><h3>Agenda vacía</h3><p>No hay citas dentro del alcance actual.</p></section>';

  const calendar=role==='coach'?`<section class="m26-panel m26-rc62-agenda-calendar-panel m30-agenda-calendar" aria-labelledby="m26-rc62-agenda-title">
        <div class="m26-panel-heading">
          <div>
            <p class="m26-eyebrow">Vista operativa</p>
            <h2 id="m26-rc62-agenda-title">Semana y día</h2>
            <p>Explora la distribución horaria. Las acciones y el detalle completo permanecen en las tarjetas de agenda.</p>
          </div>
        </div>
        <div class="m26-rc62-agenda-calendar-shell" data-rc62-agenda-calendar aria-label="Calendario operativo del Coach"></div>
      </section>`
    :'';

  const decisionStrip=canManage
    ?`<section class="m30-agenda-decision-strip" aria-label="Estado operativo de la agenda">
        <div>
          <p class="m26-eyebrow">Siguiente decisión</p>
          <h3>${proposedCount?'Revisar propuestas':'Preparar la próxima cita'}</h3>
          <p>${proposedCount
            ?'Las propuestas permanecen internas hasta confirmación.'
            :'Crea una propuesta sin hacerla visible al cliente hasta que la confirmes.'}</p>
        </div>
        <div class="m30-agenda-decision-metrics">
          <span><small>Propuestas</small><strong>${escape(proposedCount)}</strong></span>
          <span><small>Confirmaciones abiertas</small><strong>${escape(confirmationOpen)}</strong></span>
          <span><small>Cambios solicitados</small><strong>${escape(changeRequests)}</strong></span>
          <span><small>Por preparar</small><strong>${escape(needsPreparation)}</strong></span>
          <span><small>Con entrenamiento</small><strong>${escape(linkedCount)}</strong></span>
        </div>
        <div class="m26-inline-actions">
          <a class="m26-primary-action" href="#m26-agenda-proposal-form">Nueva propuesta</a>
        </div>
      </section>`
    :'';

  const clientNext=isClient&&nextAppointment
    ?`<section class="m30-agenda-client-next" aria-label="Próxima cita">
        <div>
          <p class="m26-eyebrow">Próxima cita</p>
          <h3>${escape(nextAppointment.title||'Sesión IBERFIT')}</h3>
          <p>${escape(formatDate(nextAppointment.startAt))}</p>
        </div>
        ${statusBadge(nextAppointment.status||'Confirmada','success')}
      </section>`
    :'';

  const listHeading=`<div class="m30-agenda-list-heading">
    <div>
      <p class="m26-eyebrow">${isClient?'Tus citas':'Operación'}</p>
      <h2>Citas y sesiones</h2>
      <p>${isClient
        ?'Aquí aparecen únicamente las citas disponibles para ti.'
        :'Confirma propuestas, atiende cambios y prepara sesiones sin salir de la agenda.'}</p>
    </div>
    ${statusBadge(String(appointments.length),'neutral')}
  </div>`;

  return `<div
    class="m26-route m26-rc39-agenda m30-agenda-route m30-agenda-workbench-v2"
    data-m27-session-surface="agenda"
    data-agenda-role="${escape(role||'unknown')}"
    data-agenda-workbench-v2
  >
    <section class="m26-route-intro m30-agenda-intro">
      <div>
        <p class="m26-eyebrow">${isClient?'Tu agenda':'Agenda operativa'}</p>
        <h2>${isClient?'Tus próximas sesiones':'Agenda y citas'}</h2>
        <p>${escape(modalityIntro(role,contractModality))}</p>
      </div>
      ${canManage?'<a class="m26-primary-action" href="#m26-agenda-proposal-form">Crear cita</a>':''}
    </section>
    ${decisionStrip}
    ${clientNext}
    ${calendar}
    <section class="m26-panel m30-agenda-list-panel">
      ${listHeading}
      <div class="m26-rc39-week m30-agenda-list" aria-label="Sesiones y citas de la agenda">${cards}</div>
    </section>
    ${renderAgendaProposalForm(vm,role)}
  </div>`;
}
// Coach needs an actionable first screen even with years of prescribed workouts.
// Keep all cards and their actions in the document; native disclosure prevents
// a many-thousand-pixel page from overwhelming mobile session navigation.
export const COACH_SESSIONS_FIRST_PAGE=6;
// Entire Coach archive, grouped without hiding or dropping canonical actions.
export const COACH_SESSIONS_ARCHIVE_BATCH=18;
// Visual priority only. Sessions retain IDs, permissions, source objects and
// original relative order when no reliable date is available.
export function prioritizeCoachSessions(items=[],now=new Date()){
  const clock=now instanceof Date?now.getTime():new Date(now).getTime();
  const present=Number.isFinite(clock)?clock:Date.now();
  const mapped=(items||[]).map((item,index)=>{
    const at=item?.startAt?new Date(item.startAt).getTime():NaN;
    const dated=Number.isFinite(at);
    const section=!dated?1:at>=present?0:2;
    const time=section===0?at:section===2?-at:0;
    return {item,index,section,time};
  });
  mapped.sort((a,b)=>a.section-b.section||a.time-b.time||a.index-b.index);
  return mapped.map(({item})=>item);
}
export function renderCoachSessionsProgressive(items=[],contractModality,options={}){
  const ordered=prioritizeCoachSessions(items);
  const renderCard=(item)=>sessionCard(item,'coach',contractModality,options);
  const first=ordered.slice(0,COACH_SESSIONS_FIRST_PAGE).map(renderCard).join('');
  const remaining=ordered.slice(COACH_SESSIONS_FIRST_PAGE);
  if(!remaining.length)return first;
  const more=remaining.length<=COACH_SESSIONS_ARCHIVE_BATCH
    ?remaining.map(renderCard).join('')
    :Array.from({length:Math.ceil(remaining.length/COACH_SESSIONS_ARCHIVE_BATCH)},(_,batch)=>{
      const offset=batch*COACH_SESSIONS_ARCHIVE_BATCH;
      const slice=remaining.slice(offset,offset+COACH_SESSIONS_ARCHIVE_BATCH);
      const from=COACH_SESSIONS_FIRST_PAGE+offset+1;
      const to=from+slice.length-1;
      return '<details class="m26-rc39-coach-batch" data-coach-sessions-batch>'+
        '<summary class="m26-rc39-coach-batch-toggle"><span>Sesiones '+escape(String(from))+'–'+escape(String(to))+'</span><span aria-hidden="true">+</span></summary>'+
        '<div class="m26-rc39-week m26-rc39-coach-batch-body">'+slice.map(renderCard).join('')+'</div></details>';
    }).join('');
  return `${first}<details class="m26-rc39-coach-more" data-coach-sessions-more>
    <summary class="m26-rc39-coach-more-toggle">
      <span><strong>Ver otras ${escape(String(remaining.length))} sesiones</strong>
      <small>Consulta, reutiliza o prepara entrenamientos anteriores sin perder ninguna sesión.</small></span>
      <span class="m26-rc39-coach-more-indicator" aria-hidden="true">+</span>
    </summary>
    <div class="m26-rc39-week m26-rc39-coach-more-grid">${more}</div>
  </details>`;
}
// SIGNATURE B32: one clearly actionable surface first; other records remain
// accessible without an unbounded vertical scroll or duplicated start controls.
function renderClientSessionsProgressive(items,contractModality,options={}){
  const ready=options.serviceActive!==false?items.filter((item)=>
    clientCanStartProjection(item)&&experienceFor(item,'client',contractModality).clientLiveWorkout):[];
  const readySet=new Set(ready);
  const ordered=[...ready,...items.filter((item)=>!readySet.has(item))];
  const foreground=ordered.length>6?ordered.slice(0,4):ordered;
  const remaining=ordered.length>6?ordered.slice(4):[];
  const render=(item)=>sessionCard(item,'client',contractModality,options);
  return `${foreground.map(render).join('')}${remaining.length?`<details class="m26-signature-session-archive" data-signature-session-archive><summary>Ver otras ${remaining.length} sesiones</summary><div class="m26-signature-archive-list">${remaining.map(render).join('')}</div></details>`:''}`;
}
function renderSessions(vm){
  const role=vm.role||vm.rc39?.role;
  const contractModality=contractModalityOf(vm);
  const items=(vm.rc39?.sessionProjections||[]).filter((item)=>role!=='client'||item.visible);
  // Client follows one deliberate path: Ver sesión -> Comenzar entrenamiento.
  // Never infer client permissions from badges, modality or a convenient CTA.
  const routePrimary=['coach','admin'].includes(role)
    ?'<button type="button" class="m26-primary-action" data-workflow-action="open-session-builder">Crear sesión</button>'
    :'';
  const client=role==='client';
  const ready=client&&vm.serviceActive!==false&&items.some((item)=>
    experienceFor(item,role,contractModality).clientLiveWorkout&&clientCanStartProjection(item));
  const clientState=!items.length?'empty':vm.serviceActive===false&&client?'paused':ready?'ready':'published';
  const clientBrief=client&&items.length?{
    ready:['Disponible para entrenar','Tienes una sesión guiada que puedes revisar antes de empezar.'],
    published:['Sesiones para consultar','Tu Coach dirige o habilita el inicio según cada sesión publicada.'],
    paused:['Entrenamiento en pausa','El contenido y el historial siguen disponibles; el inicio permanece deshabilitado.'],
  }[clientState]:null;
  const sessionJourney=client?`<p class="m26-signature-client-session-guidance" data-signature-session-guidance="${clientState}">${clientState==='ready'?'Revisa los ejercicios, inicia cuando estés preparado y registra tus resultados paso a paso.':clientState==='paused'?'Puedes consultar tus sesiones e historial. No se permite iniciar mientras el servicio esté en pausa.':clientState==='empty'?'Tu Coach publicará aquí el trabajo disponible. Mientras tanto, puedes registrar cómo te encuentras.':'Consulta los ejercicios y la modalidad. Las sesiones con Coach se ejecutan bajo su supervisión.'}</p>`:'';
  const clientBriefMarkup=clientBrief?`<aside class="m26-client-sessions-brief" data-client-sessions-brief="${clientState}" aria-label="Estado de tus sesiones"><span class="m26-eyebrow">Tu entrenamiento</span><strong>${clientBrief[0]}</strong><p>${clientBrief[1]}</p></aside>`:'';
  const empty=client
    ?'<section class="m26-empty m26-client-sessions-empty" data-client-session-empty><p class="m26-eyebrow">A tu ritmo, con criterio</p><h3>Sin sesiones</h3><p>Tu Coach todavía no ha publicado sesiones para ti. Puedes consultar tu planificación o registrar cómo te encuentras, sin esperar a tener un entrenamiento disponible.</p><div class="m26-inline-actions"><button type="button" class="m26-primary-action" data-m26-area="actividad">Registrar cómo estoy</button><button type="button" data-m26-area="planificacion">Revisar mi planificación</button></div></section>'
    :'<section class="m26-empty"><h3>Sin sesiones</h3><p>No hay sesiones dentro del expediente activo.</p></section>';
  const clientIntro=ready
    ?'Abre una sesión para revisar los ejercicios. Solo podrás comenzar aquellas que estén habilitadas para ti.'
    :'Consulta tus sesiones y su modalidad. Las dirigidas por tu Coach se realizan con su supervisión.';
  const introLabel=client&&normalizeClientModality(contractModality)===null
    ?'Sesiones · IBERFIT'
    :`Sesiones · ${escape(clientModalityLabel(contractModality))}`;
  const sessionCards=items.length
    ?role==='coach'
      ?renderCoachSessionsProgressive(items,contractModality,{serviceActive:vm.serviceActive!==false,...(vm.sessionPreviewAssets||{})})
      :client
        ?renderClientSessionsProgressive(items,contractModality,{serviceActive:vm.serviceActive!==false,...(vm.sessionPreviewAssets||{})})
        :items.map((item)=>sessionCard(item,role,contractModality,{serviceActive:vm.serviceActive!==false,...(vm.sessionPreviewAssets||{})})).join('')
    :empty;
  return `<div class="m26-route m26-rc39-sessions" data-m27-session-surface="sessions" data-client-session-state="${client?clientState:'professional'}" data-client-modality="${escape(normalizeClientModality(contractModality)||'unknown')}"><section class="m26-route-intro"><div><p class="m26-eyebrow">${introLabel}</p><h2>${client?'Tu entrenamiento':'Preparación y ejecución'}</h2>${client&&items.length===0?'':`<p>${client?escape(clientIntro):escape(modalityIntro(role,contractModality))}</p>`}</div>${routePrimary}</section>${sessionJourney}${clientBriefMarkup}<section class="m26-rc39-week">${sessionCards}</section>${client?renderCompletedSessionHistory(vm,{hideEmpty:!items.length}):''}</div>`;
}
export function renderRc39Route(vm){
  if(!vm?.rc39)return null;
  if(vm.kind==='planificacion'&&vm.role==='client')return renderClientPlanning(vm);
  if(vm.kind==='agenda')return renderAgenda(vm);
  if(vm.kind==='sesion')return renderSessions(vm);
  return null;
}