function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function emptyState(title, copy) {
  return `<section class="m26-empty"><div class="m26-empty-mark" aria-hidden="true">I</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></section>`;
}
function stat(label, value, note = '') {
  return `<article class="m26-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</article>`;
}
function badge(text, kind = 'neutral') { return `<span class="m26-badge is-${escapeHtml(kind)}">${escapeHtml(text)}</span>`; }
function operationBanner(operations) {
  if (!operations.pending && !operations.conflicts && !operations.rejected) return '';
  const parts = [];
  if (operations.pending) parts.push(`${operations.pending} pendiente${operations.pending === 1 ? '' : 's'}`);
  if (operations.conflicts) parts.push(`${operations.conflicts} conflicto${operations.conflicts === 1 ? '' : 's'}`);
  if (operations.rejected) parts.push(`${operations.rejected} por revisar`);
  const kind = operations.conflicts ? 'danger' : operations.rejected ? 'warning' : 'pending';
  return `<section class="m26-notice is-${kind}" role="status"><strong>Sincronización protegida</strong><p>${escapeHtml(parts.join(' · '))}. Ningún cambio se muestra como confirmado hasta recibir ACK y rehidratar el estado.</p></section>`;
}
function appointmentCard(item) {
  return `<article class="m26-list-card"><div><p class="m26-eyebrow">${escapeHtml(item.dateLabel)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.location || 'Modalidad por confirmar')}</p></div>${badge(item.status, /confirm|complet|activ/i.test(item.status) ? 'success' : 'neutral')}</article>`;
}
function clientCard(client, selected = false) {
  const iri = client.iri?.score != null ? `IRI ${client.iri.score}` : 'IRI pendiente';
  return `<article class="m26-client-card${selected ? ' is-selected' : ''}">
    <button type="button" data-m26-select-client="${escapeHtml(client.id)}" aria-label="Abrir expediente de ${escapeHtml(client.name)}">
      <div class="m26-client-avatar" aria-hidden="true">${escapeHtml(client.name.slice(0, 1).toUpperCase())}</div>
      <div class="m26-client-copy"><p class="m26-eyebrow">${escapeHtml(client.modality)}</p><h3>${escapeHtml(client.name)}</h3><p>${escapeHtml(client.access)} · ${escapeHtml(iri)}</p></div>
      <div class="m26-client-meta">${badge(client.status, /activ/i.test(client.status) ? 'success' : 'neutral')}<small>${client.nextAppointment ? escapeHtml(client.nextAppointment.dateLabel) : 'Sin próxima cita'}</small></div>
    </button>
  </article>`;
}

export function renderHoyRoute(vm) {
  const isClient = vm.role === 'client';
  const client = vm.clients[0] || null;
  const heroTitle = isClient ? `Tu acompañamiento, ${escapeHtml(client?.name || 'IBERFIT')}` : 'Tu operación de hoy, con criterio';
  const heroCopy = isClient
    ? 'Revisa tu próxima sesión, planificación y evolución confirmada.'
    : 'Prioriza sesiones, clientes y decisiones sin perder el contexto del expediente.';
  const appointments = vm.appointments.length
    ? vm.appointments.map(appointmentCard).join('')
    : emptyState('Sin sesiones programadas para hoy', isClient ? 'Tu entrenador publicará aquí tus próximas sesiones.' : 'La agenda de hoy está despejada.');
  const clients = !isClient && vm.clients.length
    ? vm.clients.slice(0, 5).map((item) => clientCard(item)).join('')
    : '';
  const next = vm.upcoming[0];
  return `<div class="m26-route m26-hoy-route">
    ${operationBanner(vm.operations)}
    <section class="m26-hero-panel"><div><p class="m26-eyebrow">IBERFIT · Hoy</p><h2>${heroTitle}</h2><p>${heroCopy}</p></div><div class="m26-hero-signal"><span>Estado</span><strong>${vm.operations.conflicts ? 'Requiere revisión' : vm.operations.pending ? 'Sincronizando' : 'Confirmado'}</strong></div></section>
    <section class="m26-stat-grid">
      ${stat('Sesiones hoy', vm.appointments.length, 'Agenda confirmada')}
      ${stat('Próxima sesión', next ? next.dateLabel : 'Sin agenda', next?.title || 'Pendiente de planificación')}
      ${stat(isClient ? 'Tu modalidad' : 'Clientes visibles', isClient ? client?.modality || 'Sin modalidad' : vm.clients.length, 'Según permisos del bootstrap')}
      ${stat('Conflictos', vm.operations.conflicts, vm.operations.conflicts ? 'Resolver antes de continuar' : 'Sin bloqueos')}
    </section>
    <section class="m26-content-grid">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Agenda</p><h2>Sesiones de hoy</h2></div>${badge(`${vm.appointments.length} confirmada${vm.appointments.length === 1 ? '' : 's'}`, 'neutral')}</div><div class="m26-stack">${appointments}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Siguiente paso</p><h2>${next ? escapeHtml(next.title) : 'Planificación al día'}</h2><p>${next ? escapeHtml(next.dateLabel) : 'No hay próximas citas confirmadas en el alcance visible.'}</p>${client?.iri ? `<div class="m26-mini-metric"><span>Último IRI</span><strong>${escapeHtml(client.iri.score ?? '—')}</strong><small>${escapeHtml(client.iri.classification || client.iri.quality || 'Confirmado')}</small></div>` : ''}</aside>
    </section>
    ${clients ? `<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Seguimiento</p><h2>Clientes visibles</h2></div><button type="button" class="m26-text-action" data-m26-area="clientes">Ver todos</button></div><div class="m26-client-grid">${clients}</div></section>` : ''}
  </div>`;
}

export function renderClientsRoute(vm) {
  const content = vm.clients.length
    ? `<div class="m26-client-grid">${vm.clients.map((item) => clientCard(item, item.id === vm.selectedClientId)).join('')}</div>`
    : emptyState('No hay clientes visibles', 'El bootstrap no devolvió expedientes dentro de tus permisos.');
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Cartera autorizada</p><h2>Clientes y seguimiento</h2><p>Solo se muestran expedientes permitidos por RLS y por el alcance del bootstrap M26.</p></div>${badge(`${vm.clients.length} cliente${vm.clients.length === 1 ? '' : 's'}`, 'neutral')}</section><section class="m26-panel">${content}</section></div>`;
}

function field(label, value) { return `<div class="m26-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || 'Sin registro')}</strong></div>`; }
export function renderExpedienteRoute(vm) {
  const data = vm.summary;
  if (!data) return `<div class="m26-route">${emptyState('Selecciona un expediente', 'Elige un cliente visible para acceder a su información confirmada.')}</div>`;
  const iri = data.iri;
  return `<div class="m26-route">
    <section class="m26-profile-hero"><div class="m26-profile-avatar">${escapeHtml(data.name.slice(0,1).toUpperCase())}</div><div><p class="m26-eyebrow">Expediente IBERFIT</p><h2>${escapeHtml(data.name)}</h2><p>${escapeHtml(data.modality)} · ${escapeHtml(data.status)}</p></div><div>${badge(data.access, /activo/i.test(data.access) ? 'success' : 'warning')}</div></section>
    <section class="m26-stat-grid">${stat('Sesiones planificadas', data.counts.sessions)}${stat('Ejecuciones', data.counts.executions)}${stat('Adherencia 28 días', vm.progress ? formatPercent(vm.progress.adherence) : 'Sin dato')}${stat('Seguimiento', vm.alertSignal?.label || 'Sin datos')}</section>
    <section class="m26-content-grid">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Datos principales</p><h2>Contexto de acompañamiento</h2></div></div><div class="m26-field-grid">${field('Modalidad', data.modality)}${field('Estado', data.status)}${field('Ciclo activo', data.cycle?.name)}${field('Próxima sesión', data.nextAppointment?.dateLabel)}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Diagnóstico IRI</p><h2>${iri?.score != null ? escapeHtml(iri.score) : 'Pendiente'}</h2><p>${iri ? escapeHtml([iri.classification, iri.quality, iri.status].filter(Boolean).join(' · ')) : 'No hay una evaluación IRI confirmada en el bootstrap.'}</p><button type="button" class="m26-primary-action" data-m26-area="iri">Abrir diagnóstico IRI</button></aside>
    </section>
    <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Ruta de trabajo</p><h2>Acciones del expediente</h2></div></div><div class="m26-action-grid"><button type="button" data-m26-area="planificacion">Planificación</button><button type="button" data-m26-area="sesion">Sesiones</button><button type="button" data-m26-area="progreso">Progreso</button><button type="button" data-m26-area="actividad">Check-ins y hábitos</button><button type="button" data-m26-area="informes">Informes</button><button type="button" data-m26-area="notas">Notas privadas</button><button type="button" data-m26-area="inteligencia">Inteligencia IBERFIT</button></div></section>
  </div>`;
}


function formatPercent(value){ return Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'Sin dato'; }
function metricValue(value, suffix=''){ return value === null || value === undefined ? 'Sin dato' : `${value}${suffix}`; }
function alertKind(severity){ return severity === 'critical' ? 'danger' : severity === 'warning' ? 'warning' : 'neutral'; }
function renderAlerts(alerts=[]){
  if(!alerts.length) return emptyState('Sin alertas de adherencia', 'No aparecen señales automáticas que requieran revisión con los datos confirmados disponibles.');
  return `<div class="m26-alert-list">${alerts.map((item)=>`<article class="m26-list-card m26-alert-card is-${escapeHtml(item.severity)}"><div><p class="m26-eyebrow">${escapeHtml(item.source)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p><small>${escapeHtml(item.action)}</small></div>${badge(item.severity==='critical'?'Prioritaria':item.severity==='warning'?'Revisar':'Información',alertKind(item.severity))}</article>`).join('')}</div>`;
}
function timelineItem(item){return `<article class="m26-timeline-item"><div class="m26-timeline-dot" aria-hidden="true"></div><div><p class="m26-eyebrow">${escapeHtml(item.date ? new Intl.DateTimeFormat('es-CL',{dateStyle:'medium'}).format(new Date(item.date)) : 'Sin fecha')}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail||item.status||'Registro confirmado')}</p></div></article>`;}

export function renderProgressRoute(vm){
  const summary=vm.summary;
  if(!summary)return `<div class="m26-route">${emptyState('Sin expediente disponible','No existe un cliente autorizado para calcular progreso.')}</div>`;
  const timeline=vm.timeline.length?vm.timeline.map(timelineItem).join(''):emptyState('Sin eventos de progreso','Los datos ausentes se mantienen como ausentes y no se convierten en cero.');
  return `<div class="m26-route">
    <section class="m26-route-intro"><div><p class="m26-eyebrow">Seguimiento confirmado</p><h2>Progreso y adherencia</h2><p>Ventana de ${escapeHtml(summary.days)} días · calidad del dato ${escapeHtml(summary.dataQuality)}.</p></div>${badge(vm.signal.label,vm.signal.level==='critical'?'danger':vm.signal.level==='warning'?'warning':'neutral')}</section>
    <section class="m26-stat-grid">
      ${stat('Adherencia',formatPercent(summary.adherence),`${summary.completedSessions} de ${summary.plannedSessions} sesiones`)}
      ${stat('RPE medio',metricValue(summary.averageRpe),'Solo ejecuciones confirmadas')}
      ${stat('Volumen medio',metricValue(summary.volume),'Carga × repeticiones cuando existe')}
      ${stat('Cambio IRI',metricValue(summary.iriDelta,summary.iriDelta===null?'':' pts'),summary.iriCurrent===null?'Sin dos evaluaciones comparables':`Actual ${summary.iriCurrent}`)}
    </section>
    <section class="m26-content-grid">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Cronología</p><h2>Evolución registrada</h2></div>${badge(`${vm.timeline.length} eventos`,'neutral')}</div><div class="m26-timeline">${timeline}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Recuperación</p><h2>Promedio de check-ins</h2><div class="m26-field-grid">${field('Energía',metricValue(summary.checkinAverage.energy,'/10'))}${field('Sueño',metricValue(summary.checkinAverage.sleep,'/10'))}${field('Estrés',metricValue(summary.checkinAverage.stress,'/10'))}${field('Dolor',metricValue(summary.checkinAverage.pain,'/10'))}</div><p class="m26-notice">La aplicación no diagnostica ni atribuye causas. El Coach interpreta el contexto.</p></aside>
    </section>
    <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Alertas explicables</p><h2>Qué requiere atención</h2></div></div>${renderAlerts(vm.alerts)}</section>
  </div>`;
}

function capabilityNotice(capability,label){
  if(capability.ready)return `<div class="m26-notice is-success"><strong>${escapeHtml(label)} conectado</strong><p>El catálogo remoto declara todos los comandos requeridos.</p></div>`;
  return `<div class="m26-notice is-warning" role="status"><strong>${escapeHtml(label)} pendiente de backend</strong><p>Faltan: ${escapeHtml(capability.missing.join(', '))}. El borrador local no se muestra como confirmado.</p></div>`;
}
export function renderActivityRoute(vm){
  const last=vm.checkins[0];
  const habits=vm.habits.length?vm.habits.map((item)=>`<article class="m26-list-card"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.status)} · ${escapeHtml(item.dateLabel)}</p></div><div class="m26-inline-actions">${badge(item.status,'neutral')}<button type="button" data-engagement-action="log-habit" data-habit-id="${escapeHtml(item.id)}"${vm.capabilities.habits.ready?'':' disabled aria-disabled="true"'}>Registrar hoy</button></div></article>`).join(''):emptyState('Sin hábitos publicados','El Coach podrá definirlos cuando el contrato backend esté instalado.');
  const manager=vm.canManageHabits?`<form class="m26-panel m26-panel-soft" data-engagement-form="habit-definition" novalidate><div class="m26-panel-heading"><div><p class="m26-eyebrow">Coach</p><h2>Definir hábito</h2></div></div><div class="m26-field-grid"><label>Nombre<input name="title" maxlength="120" required></label><label>Objetivo<input name="target" type="number" min="1" step="1" required></label><label>Unidad<input name="unit" maxlength="40" value="veces"></label><label>Frecuencia<select name="frequency"><option value="diario">Diario</option><option value="semanal">Semanal</option><option value="dias_especificos">Días específicos</option></select></label><label class="m26-wide">Descripción<textarea name="description" maxlength="500"></textarea></label></div><div class="m26-action-grid"><button type="button" data-engagement-action="save-habit-draft">Guardar borrador</button><button type="button" class="m26-primary-action" data-engagement-action="define-habit"${vm.capabilities.habits.ready?'':' disabled aria-disabled="true"'}>Publicar hábito</button></div><p class="m26-form-status" data-engagement-status="habit" role="status" aria-live="polite"></p></form>`:'';
  return `<div class="m26-route">
    <section class="m26-route-intro"><div><p class="m26-eyebrow">Actividad y contexto</p><h2>Check-ins y hábitos</h2><p>Los datos locales permanecen como borrador hasta recibir confirmación del servidor.</p></div>${badge(last?'Último check-in disponible':'Sin check-in','neutral')}</section>
    ${capabilityNotice(vm.capabilities.checkins,'Check-ins')}
    <section class="m26-content-grid">
      <form class="m26-panel" data-engagement-form="checkin" novalidate><div class="m26-panel-heading"><div><p class="m26-eyebrow">Check-in</p><h2>Cómo estás hoy</h2></div></div><div class="m26-field-grid">
        <label>Energía (0–10)<input type="number" min="0" max="10" name="energy" required></label>
        <label>Sueño (0–10)<input type="number" min="0" max="10" name="sleep" required></label>
        <label>Estrés (0–10)<input type="number" min="0" max="10" name="stress" required></label>
        <label>Dolor (0–10)<input type="number" min="0" max="10" name="pain" required></label>
        <label class="m26-wide">Observaciones<textarea name="notes" maxlength="1000"></textarea></label>
      </div><div class="m26-action-grid"><button type="button" data-engagement-action="save-checkin-draft">Guardar borrador</button><button type="button" class="m26-primary-action" data-engagement-action="submit-checkin"${vm.capabilities.checkins.ready?'':' disabled aria-disabled="true"'}>Enviar check-in</button></div><p class="m26-form-status" data-engagement-status="checkin" role="status" aria-live="polite"></p></form>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Último registro confirmado</p><h2>${last?escapeHtml(last.dateLabel):'Sin registro'}</h2><p>${last?'Disponible en el bootstrap canónico.':'La ausencia se mantiene como dato faltante.'}</p></aside>
    </section>
    ${capabilityNotice(vm.capabilities.habits,'Hábitos')}
    ${manager}
    <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Seguimiento</p><h2>Hábitos activos</h2></div>${badge(`${vm.habits.length} hábitos`,'neutral')}</div><div class="m26-stack">${habits}</div><p class="m26-form-status" data-engagement-status="habit-log" role="status" aria-live="polite"></p></section>
  </div>`;
}

export function renderPrivateNotesRoute(vm){
  const notes=vm.notes.length?vm.notes.map((item)=>`<article class="m26-list-card"><div><p class="m26-eyebrow">${escapeHtml(item.dateLabel)}</p><h3>${escapeHtml(item.title)}</h3><p>Contenido protegido para Coach/Admin.</p></div>${badge(item.status,'neutral')}</article>`).join(''):emptyState('Sin notas privadas','No hay notas confirmadas visibles para este expediente.');
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Uso interno</p><h2>Notas privadas del Coach</h2><p>Nunca son visibles para el cliente y requieren RLS específica.</p></div>${badge(`${vm.notes.length} notas`,'neutral')}</section>${capabilityNotice(vm.capability,'Notas privadas')}<section class="m26-panel">${notes}</section><section class="m26-panel m26-panel-soft"><label>Nueva nota<textarea data-private-note-draft maxlength="4000"${vm.capability.ready?'':' disabled aria-disabled="true"'}></textarea></label><button type="button" class="m26-primary-action" data-engagement-action="save-private-note"${vm.capability.ready?'':' disabled aria-disabled="true"'}>Guardar nota privada</button><p role="status" data-engagement-status="private-note"></p></section></div>`;
}

function operationCard(item){
  const actions=item.actions.map((action)=>`<button type="button" data-verification-action="${escapeHtml(action)}" data-operation-id="${escapeHtml(item.operationId)}">${action==='retry'?'Reintentar':action==='discard_local'?'Descartar copia local':'Inspeccionar'}</button>`).join('');
  return `<article class="m26-list-card"><div><p class="m26-eyebrow">${escapeHtml(item.status)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.errorCode||`${item.entityType} · ${item.entityId}`)}</p></div><div class="m26-inline-actions">${actions}</div></article>`;
}
export function renderVerificationRoute(vm){
  const center=vm.center;const content=center.items.length?center.items.map(operationCard).join(''):emptyState('Todo confirmado','No hay operaciones pendientes, conflictos ni rechazos locales.');
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Sincronización</p><h2>Centro de verificación</h2><p>Permite inspeccionar, reintentar o descartar únicamente la copia local. Nunca oculta un conflicto.</p></div>${badge(center.deploymentBlocked?'Bloqueo activo':'Sin bloqueos',center.deploymentBlocked?'danger':'success')}</section><section class="m26-stat-grid">${stat('Pendientes',center.summary.pending)}${stat('Conflictos',center.summary.conflicts)}${stat('Rechazadas',center.summary.rejected)}${stat('Total',center.summary.total)}</section><section class="m26-panel"><div class="m26-stack">${content}</div></section></div>`;
}


function workflowStatus(scope){return `<p class="m26-form-status" data-workflow-status="${escapeHtml(scope)}" role="status" aria-live="polite"></p>`;}
function recordList(items,emptyTitle='Sin registros'){
  if(!items?.length)return emptyState(emptyTitle,'No hay información confirmada dentro del alcance visible.');
  return `<div class="m26-stack">${items.map((item)=>`<article class="m26-list-card"><div><p class="m26-eyebrow">${escapeHtml(item.dateLabel||item.status||'IBERFIT')}</p><h3>${escapeHtml(item.title||'Registro IBERFIT')}</h3><p>${escapeHtml(item.status||'Confirmado')}</p></div>${badge(item.status||'Confirmado','neutral')}</article>`).join('')}</div>`;
}
export function renderIriRoute(vm){
  const current=vm.current||{};const score=current.score??current.total_score??current.totalScore??null;
  const editor=vm.canEdit?`<form class="m26-panel" data-workflow-form="iri" novalidate><div class="m26-panel-heading"><div><p class="m26-eyebrow">Evaluación</p><h2>Completar diagnóstico IRI</h2></div></div><input type="hidden" name="entityId" value="${escapeHtml(current.id||'')}"><div class="m26-field-grid"><label>Fecha de evaluación<input type="date" name="assessmentDate" value="${escapeHtml(String(current.assessmentDate||current.evaluatedAt||'').slice(0,10))}" required></label><label>Fecha de nacimiento<input type="date" name="birthDate" value="${escapeHtml(vm.profile?.birthDate||vm.profile?.birth_date||'')}" required></label><label>Sexo para baremos<select name="sexForNorms" required><option value="">Seleccionar</option><option value="female">Mujer</option><option value="male">Hombre</option></select></label><label>FC final step test<input type="number" min="30" max="240" name="stepFinalHr" required></label><label>FC al minuto<input type="number" min="30" max="240" name="stepOneMinuteHr" required></label><label>Flexiones válidas<input type="number" min="0" name="pushUps"></label><label>Chair stand 30 s<input type="number" min="0" name="chairStand30s"></label><label>% grasa corporal<input type="number" min="0" max="80" step="0.1" name="bodyFatPercent"></label></div><button type="button" class="m26-primary-action" data-workflow-action="complete-iri"${current.id?'':' disabled aria-disabled="true"'}>Validar y guardar IRI</button>${current.id?'':'<p class="m26-notice is-warning">El backend debe crear primero la entidad IRI del expediente.</p>'}${workflowStatus('iri')}</form>`:'';
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Diagnóstico funcional</p><h2>Índice de Rendimiento IBERFIT</h2><p>ΔFC, composición corporal y fuerza por patrón con baremos por sexo y edad.</p></div>${badge(score==null?'Pendiente':`IRI ${score}`,score==null?'warning':'success')}</section><section class="m26-content-grid"><article class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Última evaluación</p><h2>${escapeHtml(score??'Sin puntuación')}</h2><p>${escapeHtml(current.classification||current.clasificacion||current.status||'No hay una evaluación confirmada.')}</p></article><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Historial</p><h2>Evaluaciones confirmadas</h2></div>${badge(`${vm.history.length} registros`,'neutral')}</div>${recordList(vm.history,'Sin evaluaciones IRI')}</section></section>${editor}</div>`;
}
export function renderPlanningRoute(vm){
  const editor=vm.canEdit?`<form class="m26-panel m26-panel-soft" data-workflow-form="planning" novalidate><div class="m26-panel-heading"><div><p class="m26-eyebrow">Coach</p><h2>Validar ciclo de entrenamiento</h2></div></div><input type="hidden" name="entityId" value="${escapeHtml(vm.currentCycle?.id||'')}"><div class="m26-field-grid"><label>Nombre del ciclo<input name="name" maxlength="120" value="${escapeHtml(vm.currentCycle?.name||'')}" required></label><label>Inicio<input type="date" name="startDate" required></label><label>Fin<input type="date" name="endDate" required></label><label class="m26-wide">Objetivo<textarea name="goal" maxlength="500" required>${escapeHtml(vm.currentCycle?.goal||'')}</textarea></label></div><button type="button" class="m26-primary-action" data-workflow-action="validate-plan">Validar borrador</button>${workflowStatus('planning')}</form>`:'';
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Planificación</p><h2>Ciclos y sesiones</h2><p>La publicación requiere revisión explícita del Coach y vista previa.</p></div>${badge(`${vm.sessions.length} sesiones`,'neutral')}</section><section class="m26-content-grid"><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Ciclos</p><h2>Plan vigente</h2></div></div>${recordList(vm.cycles,'Sin ciclo confirmado')}</section><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Sesiones</p><h2>Contenido publicado</h2></div></div>${recordList(vm.sessions,'Sin sesiones publicadas')}</section></section>${editor}</div>`;
}
export function renderAgendaRoute(vm){
  const options=vm.clients.map((item)=>`<option value="${escapeHtml(item.id)}"${item.id===vm.selectedClientId?' selected':''}>${escapeHtml(item.name)}</option>`).join('');
  const form=`<form class="m26-panel m26-panel-soft" data-workflow-form="appointment" novalidate><div class="m26-panel-heading"><div><p class="m26-eyebrow">Agenda</p><h2>Crear cita</h2></div></div><div class="m26-field-grid"><label>Cliente<select name="clientId" required>${options}</select></label><label>Modalidad<select name="modality"><option value="presencial">Presencial</option><option value="guiada_app">Guiada en app</option><option value="online">Online</option></select></label><label>Inicio<input type="datetime-local" name="startAt" required></label><label>Fin<input type="datetime-local" name="endAt" required></label><label class="m26-wide">Ubicación<input name="location" maxlength="200"></label></div><button type="button" class="m26-primary-action" data-workflow-action="create-appointment">Crear cita</button>${workflowStatus('appointment')}</form>`;
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Agenda Coach</p><h2>Sesiones programadas</h2><p>Las citas se crean mediante Command Bus y quedan confirmadas solo después del ACK.</p></div>${badge(`${vm.appointments.length} citas`,'neutral')}</section><section class="m26-panel"><div class="m26-stack">${vm.appointments.length?vm.appointments.map(appointmentCard).join(''):emptyState('Agenda vacía','No hay citas confirmadas.')}</div></section>${form}</div>`;
}
export function renderSessionsRoute(vm){
  const primary=vm.canBuild?`<button type="button" class="m26-primary-action" data-workflow-action="open-session-builder">Crear sesión</button>`:`<button type="button" class="m26-primary-action" data-workflow-action="start-published-session"${vm.sessions.length?'':' disabled aria-disabled="true"'}>Iniciar sesión guiada</button>`;
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Motor de sesiones</p><h2>Sesiones guiadas en app</h2><p>Constructor, grupos, carga objetiva, alternativas y recuperación offline.</p></div>${primary}</section><section class="m26-content-grid"><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Publicadas</p><h2>Sesiones disponibles</h2></div></div>${recordList(vm.sessions,'Sin sesiones publicadas')}</section><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Historial</p><h2>Ejecuciones</h2></div></div>${recordList(vm.executions,'Sin ejecuciones confirmadas')}</section></section>${workflowStatus('session')}</div>`;
}
export function renderReportsRoute(vm){return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Documentación</p><h2>Informes IBERFIT</h2><p>Solo se muestran informes confirmados y visibles para el rol autenticado.</p></div>${badge(`${vm.reports.length} informes`,'neutral')}</section><section class="m26-panel">${recordList(vm.reports,'Sin informes publicados')}</section></div>`;}
export function renderIntelligenceRoute(vm){
  const form=vm.canGenerate?`<form class="m26-panel m26-panel-soft" data-workflow-form="intelligence" novalidate><div class="m26-panel-heading"><div><p class="m26-eyebrow">La IA propone</p><h2>Generar propuesta de sesión</h2></div></div><div class="m26-field-grid"><label>Objetivo<input name="goal" value="fuerza" required></label><label>Duración (min)<input type="number" min="20" max="120" name="durationMinutes" value="50" required></label><label>Experiencia<select name="experience"><option value="inicial">Inicial</option><option value="intermedio" selected>Intermedio</option><option value="avanzado">Avanzado</option></select></label><label>Modalidad<select name="modality"><option value="hibrido">Híbrido</option><option value="online">Online</option><option value="presencial">Presencial</option></select></label><label>Edad<input type="number" min="18" max="100" name="ageYears" value="35" required></label><label>Material<input name="equipment" value="TRX,mancuernas"></label></div><button type="button" class="m26-primary-action" data-workflow-action="generate-intelligence">Generar propuesta revisable</button>${workflowStatus('intelligence')}<div data-intelligence-preview></div></form>`:'';
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Motor IBERFIT</p><h2>Inteligencia con criterio</h2><p>Usa adherencia, recuperación y carga histórica. Nunca publica ni progresa cargas automáticamente.</p></div>${badge(vm.alerts.some((x)=>x.severity==='critical')?'Revisión requerida':'Contexto disponible',vm.alerts.some((x)=>x.severity==='critical')?'danger':'success')}</section>${form}<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Historial</p><h2>Propuestas confirmadas</h2></div></div>${recordList(vm.runs,'Sin propuestas remotas')}</section></div>`;
}
export function renderLibraryRoute(vm){
  const cards=vm.catalog.map((item)=>`<article class="m26-library-card" data-library-text="${escapeHtml([item.name_es,item.pattern,item.equipment].join(' ').toLowerCase())}"><div class="m26-library-media" aria-hidden="true">${escapeHtml((item.name_es||'I').slice(0,1))}</div><div><h3>${escapeHtml(item.name_es||'Ejercicio')}</h3><p>${escapeHtml(item.pattern||'Patrón')} · ${escapeHtml(item.equipment||'Sin equipo')}</p></div></article>`).join('');
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Biblioteca visual</p><h2>Ejercicios IBERFIT</h2><p>Catálogo canónico sin escritura libre en sesiones.</p></div>${badge(`${vm.total} ejercicios`,'neutral')}</section><section class="m26-panel"><label>Buscar ejercicio<input type="search" data-library-search autocomplete="off"></label><div class="m26-library-grid" data-library-grid>${cards||emptyState('Biblioteca no cargada','No se pudo leer el catálogo local.')}</div><p data-library-status role="status"></p></section></div>`;
}

export function renderRouteView(vm) {
  if (vm.kind === 'hoy') return renderHoyRoute(vm);
  if (vm.kind === 'clientes') return renderClientsRoute(vm);
  if (vm.kind === 'expediente') return renderExpedienteRoute(vm);
  if (vm.kind === 'progreso') return renderProgressRoute(vm);
  if (vm.kind === 'iri') return renderIriRoute(vm);
  if (vm.kind === 'planificacion') return renderPlanningRoute(vm);
  if (vm.kind === 'agenda') return renderAgendaRoute(vm);
  if (vm.kind === 'sesion') return renderSessionsRoute(vm);
  if (vm.kind === 'informes') return renderReportsRoute(vm);
  if (vm.kind === 'inteligencia') return renderIntelligenceRoute(vm);
  if (vm.kind === 'biblioteca') return renderLibraryRoute(vm);
  if (vm.kind === 'actividad') return renderActivityRoute(vm);
  if (vm.kind === 'notas') return renderPrivateNotesRoute(vm);
  if (vm.kind === 'verificacion') return renderVerificationRoute(vm);
  return `<section class="m26-route-placeholder"><p class="m26-eyebrow">${escapeHtml(vm.title || 'IBERFIT')}</p><h2>${escapeHtml(vm.title || 'Módulo')}</h2><p>Este módulo se integrará sobre el mismo store canónico, permisos y Command Bus.</p></section>`;
}
