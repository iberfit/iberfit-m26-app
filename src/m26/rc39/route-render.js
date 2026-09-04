import {appointmentCalendarEvent,googleCalendarUrl} from './calendar.js';
import {clientModalityLabel,normalizeClientModality,resolveSessionExperience} from '../domain/modality.js';

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
const modalityIntro=(role,value)=>{
  const modality=normalizeClientModality(value);
  if(role==='client'){
    if(modality==='presencial')return 'Tus sesiones presenciales muestran horario, asistencia y contexto. La ejecución principal la dirige tu Coach; solo una sesión publicada expresamente como autónoma abre Live Workout.';
    if(modality==='hibrido')return 'Tu plan híbrido comparte una sola progresión: cada sesión indica si hoy entrenas con tu Coach, online en directo o de forma autónoma en Live Workout.';
    if(modality==='online')return 'Tu experiencia online prioriza Live Workout, registro de RIR/RPE, descansos e histórico, manteniendo también las sesiones en directo cuando tu Coach las programe.';
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
  hasFullContent:Boolean(Array.isArray(item.session?.blocks)&&item.session.blocks.length),
  isPublished:Boolean(item.visible||item.canClientExecute),
});
const experiencePanel=(experience,role)=>{
  const caps=experience.capabilities.map((label)=>`<span class="m26-session-experience__capability">${escape(label)}</span>`).join('');
  const roleNote=role==='coach'
    ? `<p class="m26-session-experience__role-note">Vista Coach · ${escape(experience.clientLiveWorkout?'el atleta puede ejecutar esta sesión desde Live Workout':'la ejecución permanece supervisada')}</p>`
    : role==='admin'
      ? '<p class="m26-session-experience__role-note">Vista Admin · supervisión sin cambiar la propiedad de ejecución</p>'
      : '';
  return `<section class="m26-session-experience" data-session-experience="${escape(experience.kind)}" aria-label="Contexto de sesión ${escape(experience.contractLabel)}">
    <div class="m26-session-experience__copy"><p class="m26-session-experience__eyebrow">${escape(experience.eyebrow)}</p><h4>${escape(experience.headline)}</h4><p>${escape(experience.description)}</p>${roleNote}</div>
    <div class="m26-session-experience__capabilities" aria-label="Capacidades de esta sesión">${caps}</div>
  </section>`;
};
const cardActions=(item,role,experience)=>{
  const actions=[];
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
  if(role==='client'&&experience.clientLiveWorkout){
    actions.push(`<button type="button" class="m26-primary-action m26-live-workout-action" data-workflow-action="start-published-session" data-entity-id="${escape(item.id)}">Comenzar Live Workout</button>`);
  }
  if(role==='client'&&!experience.clientLiveWorkout&&['coach_led','live_online'].includes(item.ownership)){
    actions.push(`<span class="m26-session-supervised-state" aria-label="Sesión supervisada">${escape(experience.primaryLabel)}</span>`);
  }
  if(['coach','admin'].includes(role)){
    actions.push(`<button type="button" class="m26-primary-action" data-workflow-action="start-published-session" data-entity-id="${escape(item.id)}">Iniciar como ${role==='admin'?'Admin':'Coach'}</button>`);
    if(item.appointment?.changeRequest?.status==='pending'){
      actions.push(`<button type="button" class="m26-rc39-button" data-rc39-action="resolve-change-request" data-appointment-id="${escape(item.appointmentId)}" data-request-id="${escape(item.appointment.changeRequest.id)}" data-resolution="accepted">Aceptar solicitud</button>`);
      actions.push(`<button type="button" class="m26-rc39-button" data-rc39-action="resolve-change-request" data-appointment-id="${escape(item.appointmentId)}" data-request-id="${escape(item.appointment.changeRequest.id)}" data-resolution="rejected">No aceptar</button>`);
    }
  }
  return actions.length?`<div class="m26-rc39-card-actions">${actions.join('')}</div>`:'';
};
const sessionCard=(item,role,contractModality=null)=>{
  const kind=item.ownership==='coach_led'?'coach':item.ownership==='live_online'?'online':'autonomous';
  const visibility=item.visibility==='summary_only'?'Solo resumen':item.visibility==='full'?'Contenido completo':'Oculta';
  const experience=experienceFor(item,role,contractModality);
  const content=item.visibility==='full'&&Array.isArray(item.session?.blocks)&&item.session.blocks.length
    ? `<details class="m26-rc39-session-content"><summary>Ver entrenamiento completo</summary><ol>${item.session.blocks.map((block)=>`<li><strong>${escape(block.name||block.title||'Ejercicio')}</strong><span>${escape([block.sets?`${block.sets} series`:null,block.reps||null,block.restSeconds?`${block.restSeconds} s descanso`:null].filter(Boolean).join(' · '))}</span></li>`).join('')}</ol></details>`
    : `<p class="m26-rc39-summary-copy">${item.ownership==='coach_led'?'Esta sesión la dirige tu Coach. Aparece en tu semana, pero no se reproduce como entrenamiento autónomo desde la aplicación.':item.ownership==='live_online'?'La sesión se realiza en directo con tu Coach.':'El contenido se mostrará cuando esté preparado y publicado.'}</p>`;
  const contractLabel=clientModalityLabel(contractModality);
  return `<article class="m26-rc39-session-card is-${kind}" data-rc39-session="${escape(item.id)}" data-appointment-card="${escape(item.appointmentId||'')}" data-client-modality="${escape(normalizeClientModality(contractModality)||'unknown')}" data-session-experience-card="${escape(experience.kind)}" tabindex="-1">
    <header><div><p class="m26-eyebrow">${escape(ownershipLabel(item.ownership))}</p><h3>${escape(item.title)}</h3><p>${escape(formatDate(item.startAt))}</p></div><div>${normalizeClientModality(contractModality)?statusBadge(contractLabel,'neutral'):''}${statusBadge(modalityLabel(item.modality),kind==='autonomous'?'success':'neutral')}${statusBadge(visibility,'neutral')}</div></header>
    ${experiencePanel(experience,role)}
    ${item.location?`<p class="m26-rc39-location"><strong>Lugar:</strong> ${escape(item.location)}</p>`:''}
    ${item.confirmation?`<p class="m26-rc39-confirmation is-${escape(item.confirmation.state)}">${escape(item.confirmation.label)}</p>`:''}
    ${item.appointment?.changeRequest?.status==='pending'?`<aside class="m26-notice is-warning"><strong>Cambio solicitado por el cliente</strong><p>${escape(item.appointment.changeRequest.reason||'Sin motivo registrado')}</p></aside>`:''}
    ${content}
    ${cardActions(item,role,experience)}
    ${role==='client'&&item.confirmation?.canRequestChange&&item.changeRequestAvailable?`<form class="m26-rc39-change-form" data-rc39-change-form="${escape(item.appointmentId)}" hidden><label>Motivo o alternativa horaria<textarea name="reason" maxlength="500" required></textarea></label><div><button type="submit" class="m26-primary-action">Enviar solicitud</button><button type="button" data-rc39-action="close-change-request">Cancelar</button></div></form>`:''}
  </article>`;
};
function renderClientPlanning(vm){
  const items=vm.rc39?.planningItems||[];
  const contractModality=contractModalityOf(vm);
  const cards=items.length?items.map((item)=>sessionCard(item,'client',contractModality)).join(''):`<section class="m26-empty"><h3>Tu semana aún no está publicada</h3><p>Cuando tu Coach la publique, cada sesión mostrará claramente si es presencial, autónoma o online en directo.</p></section>`;
  return `<div class="m26-route m26-rc39-planning" data-m27-session-surface="planning"><section class="m26-route-intro"><div><p class="m26-eyebrow">Tu semana IBERFIT</p><h2>Planificación · ${escape(clientModalityLabel(contractModality))}</h2><p>${escape(modalityIntro('client',contractModality))}</p></div>${statusBadge(`${items.length} sesiones`,'neutral')}</section><section class="m26-rc39-week">${cards}</section></div>`;
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
    const projection=items.find((item)=>item.appointmentId===appointment.id);
    return projection?sessionCard(projection,vm.role,contractModality):`<article class="m26-list-card"><div><h3>${escape(appointment.title)}</h3><p>${escape(formatDate(appointment.startAt))}</p></div>${statusBadge(appointment.status||'Sin estado','neutral')}</article>`;
  }).join(''):`<section class="m26-empty"><h3>Sin citas para hoy</h3><p>La agenda no contiene sesiones programadas para este día.</p></section>`;
  return `<div class="m26-route m26-rc39-coach-today"><section class="m26-hero-panel"><div><p class="m26-eyebrow">Centro operativo</p><h2>${vm.role==='admin'?'Operación administrativa y soporte':'Día de Carlos'}</h2><p>Confirmaciones, sesiones y acciones pendientes en una sola vista.</p></div><div class="m26-hero-signal"><span>Hoy</span><strong>${escape(String(todayAppointments.length))} citas</strong></div></section><section class="m26-stat-grid"><article class="m26-stat"><span>Confirmaciones abiertas</span><strong>${escape(vm.rc39?.confirmationOpen||0)}</strong><small>Ventana de 48 horas</small></article><article class="m26-stat"><span>Cambios solicitados</span><strong>${escape(vm.rc39?.changeRequests||0)}</strong><small>Requieren respuesta</small></article><article class="m26-stat"><span>Sesiones sin contenido</span><strong>${escape(vm.rc39?.needsPreparation||0)}</strong><small>Preparar antes de la cita</small></article></section><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Agenda de hoy</p><h2>Orden operativo</h2></div></div><div class="m26-stack">${list}</div></section></div>`;
}
function renderAgenda(vm){
  const role=vm.role||vm.rc39?.role;
  const contractModality=contractModalityOf(vm);
  const projections=vm.rc39?.sessionProjections||[];
  const appointments=vm.rc39?.appointments||[];
  const cards=appointments.length?appointments.map((appointment)=>{
    const item=projections.find((projection)=>projection.appointmentId===appointment.id);
    if(item)return sessionCard(item,role,contractModality);
    return `<article class="m26-rc39-session-card" data-appointment-card="${escape(appointment.id)}" tabindex="-1"><header><div><p class="m26-eyebrow">Cita sin sesión enlazada</p><h3>${escape(appointment.title)}</h3><p>${escape(formatDate(appointment.startAt))}</p></div>${statusBadge(appointment.status||'Sin estado','neutral')}</header>${appointment.location?`<p>${escape(appointment.location)}</p>`:''}</article>`;
  }).join(''):`<section class="m26-empty"><h3>Agenda vacía</h3><p>No hay citas dentro del alcance actual.</p></section>`;
  const calendar=role==='coach'?`<section class="m26-panel m26-rc62-agenda-calendar-panel" aria-labelledby="m26-rc62-agenda-title"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Vista operativa</p><h2 id="m26-rc62-agenda-title">Semana y día</h2><p>Explora la distribución horaria. Las acciones y el detalle completo permanecen en las tarjetas de agenda.</p></div></div><div class="m26-rc62-agenda-calendar-shell" data-rc62-agenda-calendar aria-label="Calendario operativo del Coach"></div></section>`:'';
  return `<div class="m26-route m26-rc39-agenda" data-m27-session-surface="agenda"><section class="m26-route-intro"><div><p class="m26-eyebrow">${role==='client'?'Tu agenda':'Agenda operativa'}</p><h2>Sesiones por día</h2><p>${escape(modalityIntro(role,contractModality))}</p></div></section>${calendar}<section class="m26-rc39-week">${cards}</section></div>`;
}
function renderSessions(vm){
  const role=vm.role||vm.rc39?.role;
  const contractModality=contractModalityOf(vm);
  const items=(vm.rc39?.sessionProjections||[]).filter((item)=>role!=='client'||item.visible);
  return `<div class="m26-route m26-rc39-sessions" data-m27-session-surface="sessions" data-client-modality="${escape(normalizeClientModality(contractModality)||'unknown')}"><section class="m26-route-intro"><div><p class="m26-eyebrow">Sesiones · ${escape(clientModalityLabel(contractModality))}</p><h2>${role==='client'?'Tu entrenamiento':'Preparación y ejecución'}</h2><p>${escape(modalityIntro(role,contractModality))}</p></div>${['coach','admin'].includes(role)?'<button type="button" class="m26-primary-action" data-workflow-action="open-session-builder">Crear sesión</button>':''}</section><section class="m26-rc39-week">${items.length?items.map((item)=>sessionCard(item,role,contractModality)).join(''):'<section class="m26-empty"><h3>Sin sesiones</h3><p>No hay sesiones dentro del expediente activo.</p></section>'}</section></div>`;
}
export function renderRc39Route(vm){
  if(!vm?.rc39)return null;
  if(vm.kind==='planificacion'&&vm.role==='client')return renderClientPlanning(vm);
  if(vm.kind==='agenda')return renderAgenda(vm);
  if(vm.kind==='sesion')return renderSessions(vm);
  return null;
}
