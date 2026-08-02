import {renderCommunicationRoute} from '../communication/route-render.js';
import {renderAdminRoute} from '../admin/route-render.js';
import {renderRc39Route} from '../rc39/route-render.js';
import {IBERFIT_UI_LOCALE,castilianEntityLabel,castilianOperationDetail,castilianPlatformLabel,castilianSourceLabel,castilianStatusLabel} from '../ui/castellano.js';
import {formatIberfitDate} from '../domain/civil-date.js';
import {renderExerciseLibraryGroups,renderExerciseMediaCredit} from '../library/exercise-media-ui.js';
import {iriProtocolsForStep} from '../workflows/iri-protocol-catalog.js';
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
function countLabel(count,singular,plural){const value=Number(count||0);return `${value} ${value===1?singular:(plural||`${singular}s`)}`;}
function foldSearch(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
function operationBanner(operations) {
  if (!operations.pending && !operations.conflicts && !operations.rejected) return '';
  const parts = [];
  if (operations.pending) parts.push(`${operations.pending} pendiente${operations.pending === 1 ? '' : 's'}`);
  if (operations.conflicts) parts.push(`${operations.conflicts} conflicto${operations.conflicts === 1 ? '' : 's'}`);
  if (operations.rejected) parts.push(`${operations.rejected} por revisar`);
  const kind = operations.conflicts ? 'danger' : operations.rejected ? 'warning' : 'pending';
  return `<section class="m26-notice is-${kind}" role="status"><strong>Sincronización protegida</strong><p>${escapeHtml(parts.join(' · '))}. Ningún cambio se muestra como confirmado hasta completar la sincronización segura.</p></section>`;
}
function appointmentCard(item,{canManage=false}={}) {
  const detail=[item.modality,item.location]
    .filter(Boolean)
    .filter((value,index,list)=>list.indexOf(value)===index)
    .join(' · ');
  const confirmable=canManage&&['propuesta','pendiente'].includes(String(item.statusRaw||'').toLowerCase());
  const controls=confirmable?`<div class="m26-list-card-actions"><button type="button" class="m26-primary-action" data-workflow-action="confirm-appointment" data-entity-id="${escapeHtml(item.id)}">Confirmar cita</button><small>Al confirmar será visible para el cliente.</small></div>`:'';
  return `<article class="m26-list-card m26-appointment-card"><div><p class="m26-eyebrow">${escapeHtml(item.dateLabel)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(detail||'Modalidad pendiente de definir')}</p></div><div class="m26-appointment-state">${badge(item.status,/confirm|realiz|complet/i.test(item.status)?'success':'neutral')}${controls}</div></article>`;
}
function clientIriState(client={}) {
  if (client.iri?.confirmed || client.iri?.status === 'Completada') return 'completed';
  if (Number(client.iri?.coverageCount || 0) > 0) return 'progress';
  return 'pending';
}
function clientNextStep(client={}) {
  const iriState = clientIriState(client);
  if (iriState === 'pending') return 'Iniciar diagnóstico IRI';
  if (iriState === 'progress') return 'Continuar diagnóstico IRI';
  if (!client.cycle) return 'Preparar planificación';
  if (!client.nextAppointment) return 'Programar próxima cita';
  return 'Revisar seguimiento';
}
function clientCard(client, selected = false) {
  const iriState = clientIriState(client);
  const iri = client.iri
    ? client.iri.confirmed
      ? 'IRI completado · 7 etapas'
      : client.iri.coverageCount > 0
        ? `IRI en preparación · ${client.iri.coverageLabel}`
        : 'IRI en preparación'
    : 'IRI no iniciado';
  const statusText = /no informado/i.test(client.status || '')
    ? 'Estado por definir'
    : client.status;
  const accessText = client.accessKnown ? 'Acceso configurado' : 'Acceso pendiente';
  const objective = client.profile?.primaryObjective || 'Objetivo pendiente de registrar';
  const frequency = client.profile?.weeklyFrequency
    ? `${client.profile.weeklyFrequency} sesiones/semana`
    : 'Frecuencia pendiente';
  const nextStep = clientNextStep(client);
  const searchable = foldSearch(
    [
      client.name,
      client.modality,
      statusText,
      accessText,
      iri,
      objective,
      frequency,
      client.profile?.email,
      client.profile?.phone,
    ]
      .filter(Boolean)
      .join(' ')
  );
  const accessTone = client.accessKnown ? 'success' : 'neutral';

  return `<article class="m26-client-card${selected ? ' is-selected' : ''}" data-client-text="${escapeHtml(searchable)}" data-client-iri="${iriState}" data-client-modality="${escapeHtml(foldSearch(client.modality))}" data-client-name="${escapeHtml(foldSearch(client.name))}" data-client-priority="${iriState === 'pending' ? '1' : iriState === 'progress' ? '2' : client.nextAppointment ? '4' : '3'}">
    <button type="button" data-m26-select-client="${escapeHtml(client.id)}" aria-label="Abrir expediente de ${escapeHtml(client.name)}">
      <div class="m26-client-avatar" aria-hidden="true">${escapeHtml(client.name.slice(0, 1).toUpperCase())}</div>
      <div class="m26-client-copy"><p class="m26-eyebrow">${escapeHtml(client.modality)}</p><h3>${escapeHtml(client.name)}</h3><p>${escapeHtml(iri)} · ${escapeHtml(frequency)}</p><small>${escapeHtml(objective)}</small><strong class="m26-client-next">Siguiente: ${escapeHtml(nextStep)}</strong></div>
      <div class="m26-client-meta">${selected ? badge('Expediente activo', 'success') : ''}${badge(statusText, /activ/i.test(statusText) ? 'success' : 'neutral')}${badge(accessText, accessTone)}<small>${client.nextAppointment ? `Próxima cita: ${escapeHtml(client.nextAppointment.dateLabel)}` : 'Sin cita programada'}</small><span class="m26-card-action">Abrir expediente</span></div>
    </button>
  </article>`;
}

export function renderHoyRoute(vm) {
  const isClient = vm.role === 'client';
  const client = vm.clients[0] || null;
  const proposalCount = vm.proposals?.length || 0;
  const heroTitle = isClient
    ? `Tu acompañamiento, ${escapeHtml(client?.name || 'IBERFIT')}`
    : 'Prioridades de hoy';
  const heroCopy = isClient
    ? 'Consulta lo que tienes preparado, registra cómo estás y continúa desde una única ruta clara.'
    : 'Primero las decisiones que requieren una acción; después, el resto del seguimiento.';
  const appointments = vm.appointments.length
    ? vm.appointments.map(appointmentCard).join('')
    : emptyState(
        'Sin sesiones confirmadas para hoy',
        isClient
          ? 'Cuando exista una cita confirmada aparecerá aquí con su modalidad y ubicación.'
          : 'No hay sesiones confirmadas para hoy.'
      );
  const proposals = !isClient && proposalCount
    ? `<section class="m26-panel m26-panel-soft"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Requieren decisión</p><h2>Propuestas de hoy</h2></div>${badge(countLabel(proposalCount, 'propuesta', 'propuestas'), 'pending')}</div><div class="m26-stack">${vm.proposals.map(appointmentCard).join('')}</div><button type="button" class="m26-primary-action" data-m26-area="agenda">Revisar propuestas</button></section>`
    : '';
  const clients = !isClient && vm.clients.length
    ? vm.clients.slice(0, 5).map((item) => clientCard(item)).join('')
    : '';
  const next = vm.upcoming[0];
  const operationalState = vm.operations.conflicts
    ? 'Requiere revisión'
    : vm.operations.pending
      ? 'Sincronizando cambios'
      : proposalCount
        ? 'Propuestas por revisar'
        : 'Al día';
  const iriDetail = client?.iri
    ? `<div class="m26-mini-metric"><span>Evaluación IRI</span><strong>${escapeHtml(client.iri.processLabel || client.iri.coverageLabel)}</strong><small>${escapeHtml(client.iri.coverageLabel)}</small></div>`
    : '';
  const nextAction = isClient
    ? next
      ? { area: 'agenda', title: next.title, copy: next.dateLabel, label: 'Ver próxima cita' }
      : client?.cycle
        ? { area: 'planificacion', title: 'Revisar tu plan y sesiones', copy: client.cycle.name || 'Plan de entrenamiento disponible', label: 'Abrir planificación' }
        : { area: 'actividad', title: 'Registrar cómo estás hoy', copy: 'Energía, sueño, estrés y molestias ayudan a contextualizar el entrenamiento.', label: 'Abrir bienestar' }
    : next
      ? { area: 'agenda', title: next.title, copy: next.dateLabel, label: 'Abrir agenda' }
      : proposalCount
        ? { area: 'agenda', title: 'Revisar propuestas pendientes', copy: 'Confirma, modifica o descarta cada propuesta.', label: 'Revisar agenda' }
        : client && clientIriState(client) !== 'completed'
          ? { area: 'iri', title: clientNextStep(client), copy: 'Completa y confirma los datos antes de planificar.', label: 'Abrir diagnóstico IRI' }
          : { area: 'clientes', title: 'Revisar cartera de clientes', copy: 'Abre un expediente para decidir el siguiente paso.', label: 'Ver clientes' };
  const stats = [
    stat('Sesiones confirmadas hoy', vm.appointments.length, vm.appointments.length ? 'Listas para realizar' : 'No hay sesiones hoy'),
    next ? stat('Próxima cita confirmada', next.dateLabel, next.title) : stat('Próxima cita confirmada', 'Sin cita programada', isClient ? 'Tu entrenador confirmará aquí la siguiente cita' : 'Programa o confirma la siguiente cita'),
  ];
  if (isClient) {
    stats.push(stat('Tu plan', client?.cycle?.name || 'Pendiente', client?.cycle ? 'Plan confirmado disponible' : 'Tu entrenador lo publicará cuando esté listo'));
    stats.push(stat('Evaluación IRI', client?.iri?.processLabel || 'Pendiente', client?.iri?.confirmed ? client.iri.coverageLabel : 'La completa y confirma tu entrenador'));
  }
  if (!isClient && proposalCount) stats.push(stat('Propuestas pendientes', proposalCount, 'Requieren una decisión'));
  if (vm.operations.conflicts) stats.push(stat('Conflictos por resolver', vm.operations.conflicts, 'Resolver antes de continuar'));
  const clientShortcuts = isClient
    ? `<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Accesos rápidos</p><h2>Tu ruta IBERFIT</h2><p>Solo se muestra contenido confirmado para ti.</p></div></div><div class="m26-action-grid"><button type="button" data-m26-area="actividad">Registrar bienestar</button><button type="button" data-m26-area="planificacion">Ver planificación</button><button type="button" data-m26-area="sesion">Abrir sesiones</button><button type="button" data-m26-area="progreso">Revisar progreso</button><button type="button" data-m26-area="informes">Consultar informes</button></div></section>`
    : '';

  return `<div class="m26-route m26-hoy-route">
    ${operationBanner(vm.operations)}
    <section class="m26-hero-panel"><div><p class="m26-eyebrow">IBERFIT · Hoy</p><h2>${heroTitle}</h2><p>${heroCopy}</p></div><div class="m26-hero-signal"><span>Estado operativo</span><strong>${operationalState}</strong></div></section>
    <section class="m26-stat-grid">${stats.join('')}</section>
    <section class="m26-content-grid">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Agenda</p><h2>Sesiones confirmadas de hoy</h2></div>${vm.appointments.length ? badge(countLabel(vm.appointments.length, 'confirmada', 'confirmadas'), 'success') : ''}</div><div class="m26-stack">${appointments}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Siguiente acción</p><h2>${escapeHtml(nextAction.title)}</h2><p>${escapeHtml(nextAction.copy)}</p>${iriDetail}<button type="button" class="m26-primary-action" data-m26-area="${escapeHtml(nextAction.area)}">${escapeHtml(nextAction.label)}</button></aside>
    </section>
    ${clientShortcuts}
    ${proposals}
    ${clients ? `<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Seguimiento</p><h2>Clientes</h2></div><button type="button" class="m26-text-action" data-m26-area="clientes">Ver todos</button></div><div class="m26-client-grid">${clients}</div></section>` : ''}
  </div>`;
}
function clientOnboardingForm() {
  return `<details class="m26-panel m26-onboarding" data-client-onboarding>
    <summary><span><small>Nuevo expediente</small><strong>Añadir una persona</strong></span><span class="m26-summary-action">Crear expediente</span></summary>
    <form data-workflow-form="client-onboarding" class="m26-onboarding-form" novalidate>
      <section class="m26-form-section"><div class="m26-form-section-title"><span>1</span><div><h3>Identidad y contacto</h3><p>Datos necesarios para crear el expediente. No se envía ninguna invitación.</p></div></div><div class="m26-field-grid">
        <label>Nombre completo<input name="name" autocomplete="name" maxlength="160" required></label>
        <label>Correo electrónico<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
        <label>Teléfono<input name="phone" autocomplete="tel" maxlength="40" required></label>
        <label>Fecha de nacimiento<input name="birthDate" type="date" required></label>
        <label>Sexo utilizado para baremos<select name="sexForNorms" required><option value="">Seleccionar</option><option value="female">Mujer</option><option value="male">Hombre</option></select></label>
        <label>Identidad de género <small>Opcional</small><input name="genderIdentity" maxlength="120"></label>
        <label>Pronombres <small>Opcional</small><input name="pronouns" maxlength="80"></label>
        <label>Canal preferido<select name="preferredContactChannel"><option value="WhatsApp">WhatsApp</option><option value="Correo electrónico">Correo electrónico</option><option value="Teléfono">Teléfono</option></select></label>
      </div></section>
      <section class="m26-form-section"><div class="m26-form-section-title"><span>2</span><div><h3>Servicio y logística</h3><p>Contexto real para organizar la primera sesión y las sesiones posteriores.</p></div></div><div class="m26-field-grid">
        <label>Modalidad<select name="modality" required><option value="presencial">Presencial</option><option value="hibrido">Híbrido</option><option value="online">Online</option></select></label>
        <label>Frecuencia semanal<input name="weeklyFrequency" type="number" min="1" max="14" value="2" required></label>
        <label>Duración habitual<input name="sessionDurationMinutes" type="number" min="20" max="240" value="60" required></label>
        <label>Comuna o sector<input name="commune" maxlength="120"></label>
        <label class="m26-wide">Dirección habitual de entrenamiento<input name="trainingAddress" autocomplete="street-address" maxlength="300"></label>
        <label>Tipo de lugar<select name="locationType"><option value="Domicilio">Domicilio</option><option value="Gimnasio de edificio">Gimnasio de edificio</option><option value="Gimnasio">Gimnasio</option><option value="Exterior">Exterior</option><option value="Online">Online</option></select></label>
        <label>Horario preferido<input name="preferredSchedule" maxlength="240" placeholder="Ej. lunes y jueves por la tarde"></label>
        <label class="m26-wide">Instrucciones de acceso<textarea name="accessInstructions" maxlength="500"></textarea></label>
      </div></section>
      <section class="m26-form-section"><div class="m26-form-section-title"><span>3</span><div><h3>Objetivos y contexto inicial</h3><p>Información que orientará la evaluación IRI y el plan inicial.</p></div></div><div class="m26-field-grid">
        <label class="m26-wide">Objetivo principal<textarea name="primaryObjective" minlength="10" maxlength="500" required></textarea></label>
        <label class="m26-wide">Objetivos secundarios<textarea name="secondaryObjectives" maxlength="800" placeholder="Separados por comas"></textarea></label>
        <label>Experiencia<select name="experienceLevel"><option value="Inicial">Inicial</option><option value="Intermedia">Intermedia</option><option value="Avanzada">Avanzada</option></select></label>
        <label>Fase actual<input name="phase" value="Evaluación inicial" maxlength="100"></label>
        <label class="m26-wide">Historial de entrenamiento<textarea name="trainingHistory" maxlength="1500"></textarea></label>
        <label class="m26-wide">Entrenamiento actual<textarea name="currentTraining" maxlength="1000"></textarea></label>
        <label class="m26-wide">Material disponible<textarea name="equipment" maxlength="1200" placeholder="TRX, mancuernas, banco, bandas…"></textarea></label>
        <label class="m26-wide">Restricciones o precauciones<textarea name="restrictions" maxlength="1000"></textarea></label>
        <label class="m26-wide">Dolor actual<textarea name="pain" maxlength="1000"></textarea></label>
        <label class="m26-wide">Preferencias<textarea name="preferences" maxlength="1200"></textarea></label>
      </div></section>
      <section class="m26-form-section"><div class="m26-form-section-title"><span>4</span><div><h3>Contacto de emergencia</h3><p>Opcional en el alta; recomendable antes de iniciar la evaluación física.</p></div></div><div class="m26-field-grid">
        <label>Nombre<input name="emergencyContactName" maxlength="160"></label><label>Relación<input name="emergencyContactRelation" maxlength="120"></label><label>Teléfono<input name="emergencyContactPhone" maxlength="40"></label>
      </div></section>
      <div class="m26-sticky-actions"><p><strong>El acceso permanece desactivado.</strong> Primero se crea el expediente y se completa el diagnóstico IRI.</p><button type="submit" class="m26-primary-action" data-workflow-action="create-client-draft">Crear expediente y abrir primera sesión</button></div>${workflowStatus('client-onboarding')}
    </form>
  </details>`;
}

export function renderClientsRoute(vm) {
  const content = vm.clients.length
    ? `<div class="m26-client-grid" data-client-grid>${vm.clients.map((item) => clientCard(item, item.id === vm.selectedClientId)).join('')}</div>`
    : emptyState('Todavía no hay clientes', 'Crea el primer expediente para comenzar la evaluación inicial.');
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Seguimiento de clientes</p><h2>Clientes y próximos pasos</h2><p>Abre un expediente, identifica la prioridad y continúa desde una única ruta de trabajo.</p></div>${badge(`${vm.clients.length} cliente${vm.clients.length === 1 ? '' : 's'}`, 'neutral')}</section>${vm.canCreate ? clientOnboardingForm() : ''}<section class="m26-panel"><div class="m26-client-controls"><label>Buscar cliente<input type="search" data-client-search autocomplete="off" spellcheck="false" aria-describedby="m26-client-search-status" placeholder="Nombre, objetivo, modalidad o estado"></label><label>Estado del IRI<select data-client-filter="iri"><option value="">Todos</option><option value="pending">No iniciado</option><option value="progress">En progreso</option><option value="completed">Completado</option></select></label><label>Modalidad<select data-client-filter="modality"><option value="">Todas</option><option value="presencial">Presencial</option><option value="hibrid">Híbrida</option><option value="online">Online</option></select></label><label>Ordenar<select data-client-sort><option value="priority">Prioridad operativa</option><option value="name">Nombre</option></select></label><button type="button" data-client-clear>Limpiar filtros</button></div><p id="m26-client-search-status" data-client-search-status role="status" aria-live="polite">Mostrando ${countLabel(vm.clients.length, 'cliente', 'clientes')}.</p>${content}</section></div>`;
}

function field(label, value) {
  const display=value === null || value === undefined || value === '' ? 'Sin registro' : value;
  return `<div class="m26-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display)}</strong></div>`;
}

const PROFILE_FIELD_LABELS=Object.freeze({birthDate:'fecha de nacimiento',sexForNorms:'sexo para baremos',email:'correo electrónico',phone:'teléfono',modality:'modalidad',trainingAddress:'dirección de entrenamiento'});
function profileMissingNotice(profile={}){
  const missing=(profile.missing||[]).map((key)=>PROFILE_FIELD_LABELS[key]||key);
  if(!missing.length)return '';
  return `<section class="m26-notice is-warning m26-profile-missing" role="status"><div><strong>Completa el perfil esencial</strong><p>Falta registrar: ${escapeHtml(missing.join(', '))}.</p></div><button type="button" class="m26-primary-action" data-m26-area="iri">Completar en Diagnóstico IRI</button></section>`;
}

function listValue(value) {
  return Array.isArray(value) && value.length ? value.join(' · ') : value;
}

function accessBadge(data) {
  const tone = data.accessKnown
    ? /activ|habilit|conect/i.test(data.access)
      ? 'success'
      : 'neutral'
    : 'neutral';
  return badge(data.access, tone);
}

export function renderExpedienteRoute(vm) {
  const data = vm.summary;
  if (!data) {
    return `<div class="m26-route">${emptyState('Selecciona un expediente', 'Elige un cliente visible para acceder a su información confirmada.')}</div>`;
  }

  const iri = data.iri;
  const profile = data.profile || {};
  const address = [profile.trainingAddress, profile.commune]
    .filter(Boolean)
    .join(' · ');
  const emergency = [
    profile.emergencyContactName,
    profile.emergencyContactRelation,
    profile.emergencyContactPhone,
  ]
    .filter(Boolean)
    .join(' · ');

  const displayStatus=/no informado/i.test(data.status||'')?'Estado por definir':data.status;
  const summaryStats=[stat('Perfil esencial',`${profile.completeness??0}%`,profile.missing?.length?`${profile.missing.length} campos pendientes`:'Datos esenciales completos')];
  if(data.counts.sessions>0)summaryStats.push(stat('Sesiones planificadas',data.counts.sessions,'Dentro del expediente activo'));
  if(data.counts.executions>0)summaryStats.push(stat('Ejecuciones',data.counts.executions,'Sesiones realizadas y confirmadas'));
  if(vm.progress&&Number.isFinite(vm.progress.adherence))summaryStats.push(stat('Adherencia 28 días',formatPercent(vm.progress.adherence),'Solo sobre sesiones confirmadas'));

  return `<div class="m26-route">
    <section class="m26-profile-hero"><div class="m26-profile-avatar">${escapeHtml(data.name.slice(0, 1).toUpperCase())}</div><div><p class="m26-eyebrow">Expediente IBERFIT</p><h2>${escapeHtml(data.name)}</h2><p>${escapeHtml(data.modality)} · ${escapeHtml(displayStatus)}</p></div><div>${accessBadge(data)}</div></section>
    ${profileMissingNotice(profile)}
    <section class="m26-stat-grid">${summaryStats.join('')}</section>
    <section class="m26-profile-sections">
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Identificación y baremos</p><h2>Datos de la persona</h2></div></div><div class="m26-field-grid">${field('Fecha de nacimiento', profile.birthDate)}${field('Sexo utilizado para baremos', profile.sexForNormsLabel)}${field('Identidad de género', profile.genderIdentity)}${field('Pronombres', profile.pronouns)}</div></section>
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Contacto</p><h2>Datos de contacto</h2></div></div><div class="m26-field-grid">${field('Correo electrónico', profile.email)}${field('Teléfono', profile.phone)}${field('Canal preferido', profile.preferredContactChannel)}${field('Horario de contacto', profile.preferredContactTime)}${field('Zona horaria', profile.timezone)}</div></section>
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Logística</p><h2>Entrenamiento</h2></div>${profile.logisticsRequired && !profile.trainingAddress ? badge('Dirección pendiente', 'warning') : ''}</div><div class="m26-field-grid">${field('Modalidad', data.modality)}${field('Dirección de entrenamiento', address)}${field('Tipo de lugar', profile.locationType)}${field('Acceso o punto de encuentro', profile.accessInstructions)}${field('Horario preferido', profile.preferredSchedule)}${field('Frecuencia semanal', profile.weeklyFrequency ? `${profile.weeklyFrequency} sesiones` : null)}${field('Duración habitual', profile.sessionDurationMinutes ? `${profile.sessionDurationMinutes} min` : null)}${field('Material disponible', listValue(profile.equipment))}</div></section>
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Objetivos y seguridad</p><h2>Contexto de trabajo</h2></div></div><div class="m26-field-grid">${field('Objetivo principal', profile.primaryObjective)}${field('Objetivos secundarios', listValue(profile.secondaryObjectives))}${field('Contacto de emergencia', emergency)}</div></section>
    </section>
    <section class="m26-content-grid">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Planificación</p><h2>Contexto de acompañamiento</h2></div></div><div class="m26-field-grid">${field('Estado', displayStatus)}${field('Ciclo activo', data.cycle?.name)}${field('Próxima cita confirmada', data.nextAppointment?.dateLabel)}${field('Seguimiento', vm.alertSignal?.label)}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Evaluación IRI</p><h2>${iri ? escapeHtml(iri.coverageLabel) : 'Pendiente'}</h2><p>${iri ? `${escapeHtml(iri.dateLabel)} · ${escapeHtml(iri.status)}` : 'No hay una evaluación IRI confirmada.'}</p><button type="button" class="m26-primary-action" data-m26-area="iri">Abrir evaluación IRI</button></aside>
    </section>
    <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Ruta de trabajo</p><h2>Continuar con este cliente</h2></div></div><div class="m26-action-grid"><button type="button" data-m26-area="planificacion">Planificación</button><button type="button" data-m26-area="sesion">Sesiones</button><button type="button" data-m26-area="progreso">Progreso</button><button type="button" data-m26-area="actividad">Registros de bienestar y hábitos</button><button type="button" data-m26-area="informes">Informes</button><button type="button" data-m26-area="notas">Notas privadas</button><button type="button" data-m26-area="inteligencia">Inteligencia IBERFIT</button></div></section>
  </div>`;
}

function formatPercent(value){ return Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'Sin dato'; }
function metricValue(value, suffix=''){ return value === null || value === undefined ? 'Sin dato' : `${value}${suffix}`; }
function alertKind(severity){ return severity === 'critical' ? 'danger' : severity === 'warning' ? 'warning' : 'neutral'; }
function safeDateLabel(value){return formatIberfitDate(value,{locale:IBERFIT_UI_LOCALE,includeTime:false})||'Sin fecha';}
function renderAlerts(alerts=[]){
  if(!alerts.length) return emptyState('Sin alertas de adherencia', 'No aparecen señales automáticas que requieran revisión con los datos confirmados disponibles.');
  return `<div class="m26-alert-list">${alerts.map((item)=>`<article class="m26-list-card m26-alert-card is-${escapeHtml(item.severity)}"><div><p class="m26-eyebrow">${escapeHtml(castilianSourceLabel(item.source))}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p><small>${escapeHtml(item.action)}</small></div>${badge(item.severity==='critical'?'Prioritaria':item.severity==='warning'?'Revisar':'Información',alertKind(item.severity))}</article>`).join('')}</div>`;
}
function timelineItem(item){return `<article class="m26-timeline-item"><div class="m26-timeline-dot" aria-hidden="true"></div><div><p class="m26-eyebrow">${escapeHtml(safeDateLabel(item.date))}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail||item.status||'Registro confirmado')}</p></div></article>`;}
function wellbeingMeter(label,value,anchors){
  const numeric=Number(value);
  if(!Number.isFinite(numeric))return `<div class="m26-wellbeing-meter is-empty"><div><span>${escapeHtml(label)}</span><strong>Sin dato</strong></div><small>${escapeHtml(anchors)}</small></div>`;
  const bounded=Math.max(0,Math.min(10,numeric));
  return `<div class="m26-wellbeing-meter"><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(numeric)}/10</strong></div><meter min="0" max="10" value="${escapeHtml(bounded)}" aria-label="${escapeHtml(label)}: ${escapeHtml(numeric)} de 10"></meter><small>${escapeHtml(anchors)}</small></div>`;
}
function wearableHasData(summary={}){
  const metrics=summary.metrics||{};
  return Number(summary.daysWithData||0)>0||Object.values(metrics).some((value)=>value!==null&&value!==undefined&&value!=='')||(summary.providers||[]).length>0;
}
function wearableMetric(label,value,suffix=''){return field(label,value===null||value===undefined?'Sin dato':`${value}${suffix}`);}

export function renderProgressRoute(vm){
  const summary=vm.summary;
  if(!summary)return `<div class="m26-route">${emptyState('Sin expediente disponible','No existe un cliente autorizado para calcular progreso.')}</div>`;
  const timeline=vm.timeline.length?vm.timeline.map(timelineItem).join(''):emptyState('Sin eventos de progreso','Los datos ausentes se mantienen como ausentes y no se convierten en cero.');
  const adherenceVisual=Number.isFinite(summary.adherence)?`<section class="m26-panel m26-progress-overview" aria-label="Resumen visual de adherencia"><div class="m26-progress-heading"><span>Adherencia confirmada</span><strong>${formatPercent(summary.adherence)}</strong></div><meter min="0" max="1" value="${escapeHtml(Math.max(0,Math.min(1,summary.adherence)))}">${formatPercent(summary.adherence)}</meter><small>${escapeHtml(summary.completedSessions)} de ${escapeHtml(summary.plannedSessions)} sesiones confirmadas en la ventana seleccionada.</small></section>`:'';
  const wearable=summary.wearable||{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'};
  const hasCheckins=Number(summary.checkins||0)>0;
  const wearablePanel=wearableHasData(wearable)?`<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Actividad de dispositivo</p><h2>Tendencia objetiva complementaria</h2></div>${badge(wearable.freshness==='reciente'?'Actualizada':'Revisar fecha','neutral')}</div><div class="m26-field-grid">${wearableMetric('Pasos medios',wearable.metrics?.steps)}${wearableMetric('Minutos activos',wearable.metrics?.activeMinutes,' min')}${wearableMetric('Sueño de dispositivo',wearable.metrics?.sleepMinutes,' min')}${wearableMetric('FC en reposo',wearable.metrics?.restingHeartRate,' lpm')}</div><p class="m26-notice">Se presenta junto al registro de bienestar, no en sustitución de cómo se siente la persona ni como criterio clínico.</p></section>`:`<details class="m26-panel m26-optional-section"><summary>Actividad de dispositivo · sin datos confirmados</summary><p>No hay información de dispositivos para este periodo. El progreso se calcula únicamente con sesiones, evaluaciones y registros confirmados.</p></details>`;
  return `<div class="m26-route">
    <section class="m26-route-intro"><div><p class="m26-eyebrow">Seguimiento confirmado</p><h2>Progreso y adherencia</h2><p>Ventana de ${escapeHtml(summary.days)} días · calidad del dato ${escapeHtml(summary.dataQuality)}.</p></div>${badge(vm.signal.label,vm.signal.level==='critical'?'danger':vm.signal.level==='warning'?'warning':'neutral')}</section>
    <section class="m26-stat-grid">
      ${stat('Adherencia',formatPercent(summary.adherence),`${summary.completedSessions} de ${summary.plannedSessions} sesiones`)}
      ${stat('RPE medio',metricValue(summary.averageRpe),'Solo ejecuciones confirmadas')}
      ${stat('Volumen medio',metricValue(summary.volume),'Carga × repeticiones cuando existe')}
      ${stat('Evaluaciones IRI',summary.iriCurrent===null?'Sin evaluación':'Datos disponibles',summary.iriDelta===null?'Sin dos evaluaciones comparables':'Comparar por dominios, no por puntuación global')}
    </section>
    ${adherenceVisual}
    <section class="m26-content-grid">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Cronología</p><h2>Evolución registrada</h2></div>${badge(`${vm.timeline.length} eventos`,'neutral')}</div><div class="m26-timeline">${timeline}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Recuperación</p><h2>Promedio de bienestar</h2><div class="m26-wellbeing-grid">${wellbeingMeter('Energía',hasCheckins?summary.checkinAverage.energy:null,'0 muy baja · 10 muy alta')}${wellbeingMeter('Sueño',hasCheckins?summary.checkinAverage.sleep:null,'0 muy malo · 10 excelente')}${wellbeingMeter('Estrés',hasCheckins?summary.checkinAverage.stress:null,'0 ninguno · 10 máximo')}${wellbeingMeter('Dolor',hasCheckins?summary.checkinAverage.pain:null,'0 ninguno · 10 máximo')}</div><p class="m26-notice">La aplicación no diagnostica ni atribuye causas. El entrenador interpreta el contexto.</p></aside>
    </section>
    ${wearablePanel}
    <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Alertas explicables</p><h2>Qué requiere atención</h2></div></div>${renderAlerts(vm.alerts)}</section>
  </div>`;
}

function capabilityNotice(capability,label){
  if(capability.ready)return '';
  return `<div class="m26-notice is-warning" role="status"><strong>${escapeHtml(label)}</strong><p>Esta función todavía no está disponible. Puedes conservar el borrador en este dispositivo, pero no se mostrará como confirmado hasta completar la conexión segura.</p></div>`;
}
function wearableFreshnessLabel(value){return value==='reciente'?'Actualizado':value==='atrasada'?'Revisar actualización':value==='obsoleta'?'Datos antiguos':'Sin datos';}
function wearableProviderCard(item) {
  const policy = item.policy || {};
  const copy = item.usableNow
    ? 'Puede utilizarse ahora con autorización explícita del cliente.'
    : item.key === 'samsung_health'
      ? 'Pendiente de la aplicación móvil necesaria para compartir pasos, actividad, frecuencia cardiaca y sueño.'
      : item.key === 'strava'
        ? 'Pendiente de completar la autorización segura de Strava antes de ofrecer la conexión.'
        : policy.developmentAllowed
          ? 'Preparación técnica pendiente. No está conectada ni comparte datos.'
          : 'No disponible actualmente. No está conectada ni comparte datos.';
  const label = item.usableNow ? 'Disponible' : policy.developmentAllowed ? 'En preparación' : 'No disponible';
  const tone = item.usableNow ? 'success' : policy.developmentAllowed ? 'neutral' : 'warning';

  return `<article class="m26-wearable-source" data-provider="${escapeHtml(item.key)}" data-zero-cost-tier="${escapeHtml(policy.tier || 'unknown')}"><div><p class="m26-eyebrow">${escapeHtml(castilianPlatformLabel(item.platform))}</p><h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(copy)}</p></div>${badge(label, tone)}</article>`;
}

function lastCheckinSummary(last){
  if(!last)return `<p>No hay registros confirmados todavía.</p>`;
  const body=last.body||{};
  return `<div class="m26-wellbeing-grid m26-wellbeing-grid-compact">${wellbeingMeter('Energía',body.energy,'0 muy baja · 10 muy alta')}${wellbeingMeter('Sueño',body.sleep,'0 muy malo · 10 excelente')}${wellbeingMeter('Estrés',body.stress,'0 ninguno · 10 máximo')}${wellbeingMeter('Dolor',body.pain,'0 ninguno · 10 máximo')}</div>`;
}
export function renderActivityRoute(vm){
  const last=vm.checkins[0];const wearable=vm.wearables||{summary:{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'},connections:[],providers:[],canControl:false};const wearableSummary=wearable.summary;
  const habits=vm.habits.length?vm.habits.map((item)=>`<article class="m26-list-card"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.status)} · ${escapeHtml(item.dateLabel)}</p></div><div class="m26-inline-actions">${badge(item.status,'neutral')}<button type="button" data-engagement-action="log-habit" data-habit-id="${escapeHtml(item.id)}" aria-label="Registrar hoy: ${escapeHtml(item.title)}"${vm.capabilities.habits.ready?'':' disabled aria-disabled="true"'}>Registrar hoy</button></div></article>`).join(''):emptyState('Sin hábitos publicados',vm.capabilities.habits.ready?'Define el primer hábito para iniciar su seguimiento.':'La publicación de hábitos todavía no está disponible; el borrador puede prepararse sin mostrarlo como confirmado.');
  const manager=vm.canManageHabits?`<form class="m26-panel m26-panel-soft" data-engagement-form="habit-definition"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Entrenador</p><h2>Definir hábito</h2></div></div><div class="m26-field-grid"><label>Nombre<input name="title" maxlength="120" required></label><label>Objetivo<input name="target" type="number" min="1" step="1" required></label><label>Unidad<input name="unit" maxlength="40" value="veces"></label><label>Frecuencia<select name="frequency" required><option value="diario">Diario</option><option value="semanal">Semanal</option><option value="dias_especificos">Días específicos</option></select></label><label class="m26-wide">Descripción<textarea name="description" maxlength="500"></textarea></label></div><div class="m26-action-grid"><button type="button" data-engagement-action="save-habit-draft">Guardar borrador</button><button type="submit" class="m26-primary-action" data-engagement-action="define-habit"${vm.capabilities.habits.ready?'':' disabled aria-disabled="true"'}>Publicar hábito</button></div><p class="m26-form-status" data-engagement-status="habit" role="status" aria-live="polite"></p></form>`:'';
  const importer=wearable.canControl?`<form class="m26-panel m26-panel-soft" data-wearable-import aria-describedby="wearable-import-help"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Privacidad primero</p><h2>Revisar una exportación</h2></div>${badge('Solo vista previa local · gratuito','success')}</div><p id="wearable-import-help">La importación local permite revisar el formato sin crear cuentas ni enviar el archivo. Nada se incorpora al expediente hasta una confirmación posterior y explícita.</p><div class="m26-field-grid"><label>Origen del archivo<select name="wearableProvider" required><option value="normalized_file">Archivo normalizado IBERFIT</option><option value="health_connect">Exportación Health Connect</option><option value="samsung_health">Exportación Samsung Health</option><option value="strava">Exportación Strava</option><option value="apple_health">Exportación Apple Health</option><option value="fitbit">Exportación Google Health API / Fitbit</option><option value="oura">Exportación Oura</option><option value="garmin_connect">Exportación Garmin</option></select></label><label>Archivo JSON o CSV<input type="file" name="wearableFile" accept=".json,.csv,application/json,text/csv" required></label></div><div class="m26-action-grid"><button type="button" data-wearable-action="download-template">Descargar plantilla</button><button type="submit" class="m26-primary-action">Analizar archivo</button><button type="button" data-wearable-action="clear-preview">Limpiar vista previa</button></div><p class="m26-form-status" data-wearable-status role="status" aria-live="polite" aria-atomic="true"></p><section class="m26-wearable-preview" data-wearable-preview hidden aria-live="polite"></section></form>`:`<aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Control del cliente</p><h2>Conexiones de dispositivos</h2><p>El cliente decide qué fuentes comparte, puede pausar la sincronización y conserva el control de sus permisos. El entrenador recibe únicamente resúmenes confirmados.</p></aside>`;
  const connectionCopy=wearable.connections.length?wearable.connections.map((item)=>`${item.label}: ${castilianStatusLabel(item.status)}`).join(' · '):'No hay conexiones remotas confirmadas.';
  const deviceSummary=wearableHasData(wearableSummary)?`<section class="m26-panel m26-wearable-overview"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Datos de dispositivos</p><h2>Resumen de los últimos 7 días</h2><p>${escapeHtml(connectionCopy)}</p></div>${badge(wearableFreshnessLabel(wearableSummary.freshness),wearableSummary.freshness==='reciente'?'success':'neutral')}</div><div class="m26-stat-grid">${stat('Pasos medios',metricValue(wearableSummary.metrics.steps),`${wearableSummary.daysWithData} días con datos`)}${stat('Actividad',metricValue(wearableSummary.metrics.activeMinutes,' min'),'Promedio diario disponible')}${stat('Sueño objetivo',metricValue(wearableSummary.metrics.sleepMinutes,' min'),'Dato de dispositivo, no percepción')}${stat('FC en reposo',metricValue(wearableSummary.metrics.restingHeartRate,' lpm'),`Calidad ${wearableSummary.quality}`)}</div><div class="m26-field-grid m26-wearable-secondary">${wearableMetric('VFC media',wearableSummary.metrics.hrvMs,' ms')}${wearableMetric('Energía activa',wearableSummary.metrics.activeEnergyKcal,' kcal')}${wearableMetric('Entrenamiento registrado',wearableSummary.metrics.workoutMinutes,' min')}${wearableMetric('Fuentes',wearableSummary.providers.join(', ')||'Sin fuentes')}</div><p class="m26-notice">IBERFIT muestra procedencia, fecha y calidad. No transforma estos datos en indicaciones clínicas ni aumenta cargas sin revisión del entrenador.</p></section>`:`<section class="m26-notice"><strong>Sin datos de dispositivos confirmados</strong><p>El registro de bienestar y las sesiones continúan funcionando sin conectar ningún dispositivo.</p></section>`;
  return `<div class="m26-route">
    <section class="m26-route-intro"><div><p class="m26-eyebrow">Actividad y contexto</p><h2>Bienestar y hábitos</h2><p>Registra cómo se siente la persona y los hábitos acordados. Los dispositivos son opcionales y nunca sustituyen la interpretación del entrenador.</p></div>${badge(last?'Último registro disponible':'Sin registro de bienestar','neutral')}</section>
    ${capabilityNotice(vm.capabilities.checkins,'Los registros de bienestar')}
    <section class="m26-content-grid">
      <form class="m26-panel" data-engagement-form="checkin"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Registro de bienestar</p><h2>Cómo estás hoy</h2></div></div><div class="m26-field-grid">
        <label>Energía (0–10)<input type="number" min="0" max="10" inputmode="numeric" name="energy" required><small>0 muy baja · 10 muy alta</small></label>
        <label>Sueño (0–10)<input type="number" min="0" max="10" inputmode="numeric" name="sleep" required><small>0 muy malo · 10 excelente</small></label>
        <label>Estrés (0–10)<input type="number" min="0" max="10" inputmode="numeric" name="stress" required><small>0 ninguno · 10 máximo</small></label>
        <label>Dolor (0–10)<input type="number" min="0" max="10" inputmode="numeric" name="pain" required><small>0 ninguno · 10 máximo</small></label>
        <label class="m26-wide">Observaciones<textarea name="notes" maxlength="1000"></textarea></label>
      </div><div class="m26-action-grid"><button type="button" data-engagement-action="save-checkin-draft">Guardar borrador</button><button type="submit" class="m26-primary-action" data-engagement-action="submit-checkin"${vm.capabilities.checkins.ready?'':' disabled aria-disabled="true"'}>Enviar registro de bienestar</button></div><p class="m26-form-status" data-engagement-status="checkin" role="status" aria-live="polite"></p></form>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Último registro confirmado</p><h2>${last?escapeHtml(last.dateLabel):'Sin registro'}</h2>${lastCheckinSummary(last)}</aside>
    </section>
    ${capabilityNotice(vm.capabilities.habits,'La publicación de hábitos')}
    ${manager}
    <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Seguimiento</p><h2>Hábitos activos</h2></div>${badge(countLabel(vm.habits.length,'hábito','hábitos'),'neutral')}</div><div class="m26-stack">${habits}</div><p class="m26-form-status" data-engagement-status="habit-log" role="status" aria-live="polite"></p></section>
    <details class="m26-panel m26-optional-section"><summary>Dispositivos e integraciones opcionales</summary><div class="m26-optional-section-body">${deviceSummary}<section class="m26-content-grid">${importer}<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Conexiones opcionales</p><h2>Plan gratuito de integraciones</h2><p>Solo se ofrecerán conexiones seguras y sin coste confirmado. Ninguna fuente aparece como conectada antes de completar su autorización.</p></div></div><div class="m26-wearable-sources">${wearable.providers.map(wearableProviderCard).join('')}</div></section></section></div></details>
  </div>`;
}

export function renderPrivateNotesRoute(vm){
  const notes=vm.notes.length?vm.notes.map((item)=>{const body=item.body?.body||item.body?.note||item.body?.content||'';return `<article class="m26-list-card m26-private-note-card"><div><p class="m26-eyebrow">${escapeHtml(item.dateLabel)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(body||'Nota sin contenido legible.')}</p></div>${badge(item.status,'neutral')}</article>`;}).join(''):emptyState('Sin notas privadas','No hay notas confirmadas visibles para este expediente.');
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Uso interno</p><h2>Notas privadas del entrenador</h2><p>Nunca son visibles para el cliente y requieren permisos internos específicos.</p></div>${badge(countLabel(vm.notes.length,'nota','notas'),'neutral')}</section>${capabilityNotice(vm.capability,'Notas privadas')}<section class="m26-panel">${notes}</section><section class="m26-panel m26-panel-soft"><label>Título<input data-private-note-title maxlength="140" value="Nota privada"></label><label>Nueva nota<textarea data-private-note-draft maxlength="4000"${vm.capability.ready?'':' disabled aria-disabled="true"'}></textarea></label><button type="button" class="m26-primary-action" data-engagement-action="save-private-note"${vm.capability.ready?'':' disabled aria-disabled="true"'}>Guardar nota privada</button><p role="status" data-engagement-status="private-note"></p></section></div>`;
}

function operationCard(item){
  const actions=item.actions.map((action)=>`<button type="button" data-verification-action="${escapeHtml(action)}" data-operation-id="${escapeHtml(item.operationId)}">${action==='retry'?'Reintentar ahora':action==='discard_local'?'Descartar copia local':'Inspeccionar'}</button>`).join('');
  const retry=item.status==='pending'&&item.attempts?`<small>Intentos: ${escapeHtml(item.attempts)}${item.nextRetryAt?` · reintento automático desde ${escapeHtml(safeDateLabel(item.nextRetryAt))}`:''}</small>`:'';
  return `<article class="m26-list-card"><div><p class="m26-eyebrow">${escapeHtml(castilianStatusLabel(item.status))}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(castilianOperationDetail(item.errorCode,item.entityType))}</p>${retry}</div><div class="m26-inline-actions">${actions}</div></article>`;
}
export function renderVerificationRoute(vm){
  const center=vm.center;const content=center.items.length?center.items.map(operationCard).join(''):emptyState('Sin operaciones pendientes','No hay operaciones pendientes, conflictos ni rechazos locales.');
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Sincronización</p><h2>Centro de verificación</h2><p>Permite inspeccionar, reintentar o descartar únicamente la copia local. Nunca oculta un conflicto.</p></div>${badge(center.deploymentBlocked?'Bloqueo activo':'Sin bloqueos',center.deploymentBlocked?'danger':'success')}</section><section class="m26-stat-grid">${stat('Pendientes',center.summary.pending)}${stat('Conflictos',center.summary.conflicts)}${stat('Rechazadas',center.summary.rejected)}${stat('Total',center.summary.total)}</section><section class="m26-panel"><div class="m26-stack">${content}</div></section></div>`;
}


function workflowStatus(scope){return `<p class="m26-form-status" data-workflow-status="${escapeHtml(scope)}" role="status" aria-live="polite"></p>`;}
function recordList(items,emptyTitle='Sin registros'){
  if(!items?.length)return emptyState(emptyTitle,'No hay información confirmada dentro del alcance visible.');
  return `<div class="m26-stack">${items.map((item)=>`<article class="m26-list-card"><div><p class="m26-eyebrow">${escapeHtml(item.dateLabel||item.status||'IBERFIT')}</p><h3>${escapeHtml(item.title||'Registro IBERFIT')}</h3><p>${escapeHtml(item.status||'Confirmado')}</p></div>${badge(item.status||'Confirmado','neutral')}</article>`).join('')}</div>`;
}

function publicationTone(status){return status==='published'?'success':status==='approved'?'neutral':status==='review'?'pending':status==='withdrawn'||status==='archived'?'warning':'neutral';}
function publicationVisibilityCopy(item){const status=item?.publication?.status;if(status==='published')return 'Visible para el cliente.';if(status==='approved')return 'Aprobado, pero todavía no visible para el cliente.';if(status==='review')return 'Pendiente de aprobación interna.';if(status==='draft')return 'Borrador interno.';if(status==='withdrawn')return 'Retirado de la vista del cliente.';if(status==='archived')return 'Archivado y no visible para el cliente.';return 'Revisa el estado antes de continuar.';}
function publicationActionControl(action,entity,item){
  const common=`data-workflow-action="manage-publication" data-publication-entity="${escapeHtml(entity)}" data-publication-action="${escapeHtml(action.action)}" data-entity-id="${escapeHtml(item.id)}"`;
  if(action.requiresPreview)return `<div class="m26-publication-confirm"><label><input type="checkbox" data-publication-preview> He revisado la vista previa y confirmo que este contenido puede mostrarse al cliente.</label><button type="button" class="m26-primary-action" ${common}>${escapeHtml(action.label)}</button></div>`;
  if(action.requiresReason)return `<div class="m26-publication-confirm"><label>Motivo<textarea data-publication-reason maxlength="1000" required></textarea></label><button type="button" ${common}>${escapeHtml(action.label)}</button></div>`;
  return `<button type="button" class="m26-primary-action" ${common}>${escapeHtml(action.label)}</button>`;
}
function clientContentBody(view,{preview=false}={}){
  if(!view)return '';
  const facts=view.facts?.length?`<div class="m26-client-content-facts">${view.facts.map((item)=>`<span>${escapeHtml(item)}</span>`).join('')}</div>`:'';
  const sections=view.sections?.length?`<div class="m26-client-content-sections">${view.sections.map((section)=>section.items?.length?`<section><h4>${escapeHtml(section.title)}</h4><ol>${section.items.map((entry)=>`<li><strong>${escapeHtml(entry.title)}</strong>${entry.detail?`<span>${escapeHtml(entry.detail)}</span>`:''}</li>`).join('')}</ol></section>`:`<section><h4>${escapeHtml(section.title)}</h4><p>${escapeHtml(section.text)}</p></section>`).join('')}</div>`:'';
  const details=(sections||facts)?`<details class="m26-client-content-details"${preview?' open':''}><summary>${escapeHtml(preview?'Contenido completo que recibirá el cliente':view.actionLabel||'Consultar detalles')}</summary>${facts}${sections}</details>`:'';
  return `<p class="m26-client-content-summary">${escapeHtml(view.summary||'Contenido preparado por tu entrenador.')}</p>${view.dateRange?`<p class="m26-client-content-date">${escapeHtml(view.dateRange)}</p>`:''}${details}`;
}
function clientContentCard(item,entity){
  const view=item.clientContent||{};const sessionAction=entity==='session'?`<button type="button" class="m26-primary-action m26-client-session-action" data-workflow-action="start-published-session" data-entity-id="${escapeHtml(item.id)}">Comenzar esta sesión</button>`:'';
  return `<article class="m26-client-content-card" data-client-content="${escapeHtml(entity)}"><div><p class="m26-eyebrow">${escapeHtml(view.eyebrow||'IBERFIT')}</p><h3>${escapeHtml(view.title||item.title||'Contenido IBERFIT')}</h3>${clientContentBody(view)}</div>${sessionAction}</article>`;
}
function publicationCard(item,entity){
  const actions=item?.publication?.actions||[];
  const previewLabel=entity==='report'?'Vista previa antes de publicar':'Así lo verá el cliente';const preview=`<section class="m26-publication-preview" aria-label="Vista previa controlada"><p class="m26-eyebrow">${previewLabel}</p><h4>${escapeHtml(item.clientContent?.title||item.title||'Contenido IBERFIT')}</h4>${clientContentBody(item.clientContent,{preview:true})}</section>`;
  const controls=actions.length?`<details class="m26-publication-actions"><summary>Gestionar publicación</summary><div class="m26-stack">${actions.map((action)=>publicationActionControl(action,entity,item)).join('')}</div></details>`:'';
  return `<article class="m26-publication-card" data-publication-card><div class="m26-publication-card-main"><div><p class="m26-eyebrow">${escapeHtml(item.dateLabel||'IBERFIT')}</p><h3>${escapeHtml(item.title||'Contenido IBERFIT')}</h3><p>${escapeHtml(publicationVisibilityCopy(item))}</p></div>${badge(item.publication?.statusLabel||item.status||'Sin estado',publicationTone(item.publication?.status))}</div>${preview}${controls}</article>`;
}
function publicationList(items,entity,emptyTitle,{clientView=false}={}){if(!items?.length)return emptyState(emptyTitle,clientView?'Tu entrenador añadirá aquí el contenido cuando esté listo para ti.':'No hay contenido dentro del alcance seleccionado.');return `<div class="m26-stack">${items.map((item)=>clientView?clientContentCard(item,entity):publicationCard(item,entity)).join('')}</div>`;}
function selectedOption(value, expected) {
  return value === expected ? ' selected' : '';
}

function iriDomainState(label, complete) {
  return `<article class="m26-domain-status"><span>${escapeHtml(label)}</span>${badge(complete ? 'Registrado' : 'Sin registro', complete ? 'success' : 'neutral')}</article>`;
}

function requiredLabel(labelText,required){return `${escapeHtml(labelText)}${required?' <span class="m26-required" aria-hidden="true">*</span>':''}`;}
function iriInput(labelText,name,{type='text',value='',min=null,max=null,step=null,required=false,wide=false,help='',readonly=false}={}){
  const attributes=[`name="${escapeHtml(name)}"`,`type="${escapeHtml(type)}"`,min!==null?`min="${escapeHtml(min)}"`:'',max!==null?`max="${escapeHtml(max)}"`:'',step!==null?`step="${escapeHtml(step)}"`:'',required?'required aria-required="true"':'',readonly?'readonly':''].filter(Boolean).join(' ');
  return `<label${wide?' class="m26-wide"':''}>${requiredLabel(labelText,required)}<input ${attributes} value="${escapeHtml(value)}">${help?`<small>${escapeHtml(help)}</small>`:''}</label>`;
}
function iriTextarea(labelText,name,{wide=true,max=1200,placeholder='',required=false,value=''}={}){return `<label${wide?' class="m26-wide"':''}>${requiredLabel(labelText,required)}<textarea name="${escapeHtml(name)}" maxlength="${max}" placeholder="${escapeHtml(placeholder)}"${required?' required aria-required="true"':''}>${escapeHtml(Array.isArray(value)?value.join(', '):value)}</textarea></label>`;}
function iriSelect(labelText,name,options,{value='',wide=false,required=false}={}){return `<label${wide?' class="m26-wide"':''}>${requiredLabel(labelText,required)}<select name="${escapeHtml(name)}"${required?' required aria-required="true"':''}>${options.map(([key,labelText])=>`<option value="${escapeHtml(key)}"${key===value?' selected':''}>${escapeHtml(labelText)}</option>`).join('')}</select></label>`;}
function iriStep(index,key,title,copy,content){return `<section class="m26-iri-step${index===0?' is-active':''}" data-iri-step="${escapeHtml(key)}" aria-labelledby="iri-step-title-${index}"${index===0?'':' hidden'}><div class="m26-form-section-title"><span>${index+1}</span><div><h3 id="iri-step-title-${index}">${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></div></div>${content}<div class="m26-step-validation" data-iri-step-validation="${escapeHtml(key)}" role="status" aria-live="polite"></div></section>`;}
function trialInputs(prefix,labelText,{min=0,max=30}={}){return `<fieldset class="m26-trials"><legend>${escapeHtml(labelText)}</legend><div>${[1,2,3].map((index)=>iriInput(`Intento ${index}`,`${prefix}${index}`,{type:'number',min,max,step:.1})).join('')}</div></fieldset>`;}
function protocolList(title,items){return `<section class="m26-protocol-section"><h4>${escapeHtml(title)}</h4><ul>${(items||[]).map((item)=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;}
function protocolVisualFrame(title,kind,final=false){
  const stroke='#e3c878',ink='#f8f0dc',muted='#8fae9e';
  const floor=`<line x1="12" y1="92" x2="148" y2="92" stroke="${muted}" stroke-width="2"/>`;
  const person=(x,y,pose='stand')=>pose==='seat'?`<circle cx="${x}" cy="${y-36}" r="7" fill="none" stroke="${ink}" stroke-width="3"/><path d="M${x} ${y-29} L${x} ${y-6} L${x+22} ${y-6} M${x} ${y-18} L${x+19} ${y-12} M${x+22} ${y-6} L${x+22} ${y+14}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`:`<circle cx="${x}" cy="${y-52}" r="7" fill="none" stroke="${ink}" stroke-width="3"/><path d="M${x} ${y-45} L${x} ${y-16} M${x} ${y-34} L${x-14} ${y-18} M${x} ${y-34} L${x+14} ${y-18} M${x} ${y-16} L${x-12} ${y+8} M${x} ${y-16} L${x+12} ${y+8}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
  let drawing='';
  if(kind==='wall-lunge')drawing=`${floor}<line x1="125" y1="18" x2="125" y2="92" stroke="${stroke}" stroke-width="4"/>${person(final?88:103,84)}<path d="M${final?88:103} 50 Q${final?112:111} 58 125 62" fill="none" stroke="${stroke}" stroke-width="4"/>`;
  else if(kind==='seated-reach')drawing=`${floor}<rect x="108" y="65" width="28" height="27" rx="3" fill="none" stroke="${stroke}" stroke-width="3"/>${person(52,78,'seat')}<path d="M52 60 L${final?116:88} 60" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>`;
  else if(kind==='supine-leg')drawing=`<line x1="18" y1="70" x2="142" y2="70" stroke="${muted}" stroke-width="5"/><circle cx="48" cy="55" r="7" fill="none" stroke="${ink}" stroke-width="3"/><path d="M55 58 L92 62 L${final?126:110} ${final?82:45} M82 61 L68 38" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
  else if(kind==='hip-rotation')drawing=`${floor}${person(78,78,'seat')}<path d="M78 72 Q${final?45:62} 82 ${final?38:54} 91 M78 72 Q${final?112:95} 82 ${final?120:102} 91" fill="none" stroke="${stroke}" stroke-width="4"/>`;
  else if(kind==='squat')drawing=`${floor}${final?`<circle cx="78" cy="36" r="7" fill="none" stroke="${ink}" stroke-width="3"/><path d="M78 43 L66 64 L91 69 M66 64 L49 90 M91 69 L110 90 M70 52 L48 55 M86 52 L111 48" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`:`${person(78,84)}<line x1="112" y1="28" x2="112" y2="92" stroke="${stroke}" stroke-width="4"/>`}`;
  else if(kind==='chair-stand')drawing=`${floor}<path d="M45 60 L45 92 M45 72 L70 72 L70 92" fill="none" stroke="${stroke}" stroke-width="4"/>${final?person(92,84):person(63,78,'seat')}`;
  else if(kind==='push')drawing=`${floor}<circle cx="${final?38:42}" cy="${final?66:52}" r="6" fill="none" stroke="${ink}" stroke-width="3"/><path d="M${final?44:48} ${final?68:55} L118 ${final?74:70} L136 90 M65 ${final?70:58} L${final?58:72} 90 M112 ${final?74:68} L105 90" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
  else if(kind==='trx-row')drawing=`${floor}<line x1="132" y1="18" x2="132" y2="92" stroke="${stroke}" stroke-width="4"/><path d="M132 26 L${final?91:70} 48 M132 26 L${final?91:70} 52" stroke="${stroke}" stroke-width="2"/><circle cx="${final?82:61}" cy="${final?42:46}" r="6" fill="none" stroke="${ink}" stroke-width="3"/><path d="M${final?82:61} ${final?49:53} L${final?68:48} 78 L42 91 M${final?75:55} 62 L${final?91:70} 50" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
  else if(kind==='plank')drawing=`${floor}<circle cx="38" cy="${final?64:58}" r="6" fill="none" stroke="${ink}" stroke-width="3"/><path d="M44 ${final?66:61} L118 ${final?72:70} L137 90 M62 ${final?68:63} L55 90" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
  else if(kind==='posterior-chain')drawing=`<path d="M25 70 L85 70 L85 92" fill="none" stroke="${muted}" stroke-width="5"/><circle cx="${final?116:88}" cy="${final?44:58}" r="6" fill="none" stroke="${ink}" stroke-width="3"/><path d="M82 68 L${final?110:95} ${final?50:61} L${final?138:125} ${final?44:60}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
  else if(kind==='step-test')drawing=`${floor}<rect x="92" y="62" width="45" height="30" rx="2" fill="none" stroke="${stroke}" stroke-width="4"/>${person(final?100:58,84)}<path d="M${final?100:58} 68 L${final?112:83} ${final?62:90}" stroke="${stroke}" stroke-width="4"/>`;
  else drawing=`${floor}${person(78,84)}<rect x="104" y="30" width="28" height="40" rx="4" fill="none" stroke="${stroke}" stroke-width="3"/>`;
  return `<figure class="m26-protocol-frame"><svg viewBox="0 0 160 110" role="img" aria-label="${escapeHtml(title)}"><rect width="160" height="110" rx="12" fill="#0b2a1e"/>${drawing}<text x="10" y="14" fill="${stroke}" font-size="8" font-family="system-ui">${escapeHtml(title)}</text></svg><figcaption>${escapeHtml(title)}</figcaption></figure>`;
}
function protocolMetaFields(protocol){
  const existingVariants=new Set(['bodyCompositionMethod','pushVariant','posteriorChainProtocol','cardioProtocol']);
  const existingValidity=new Set(['chairStandValid','pushValid','trxValid','cardioValid']);
  const existingStopReasons=new Set(['cardioStopReason']);
  const variant=existingVariants.has(protocol.form.variant)?'':iriSelect('Variante exacta',protocol.form.variant,protocol.variants.map((item)=>[item.id,item.label]),{value:protocol.defaultVariant});
  const valid=existingValidity.has(protocol.form.valid)?'':`<label class="m26-consent"><input type="checkbox" name="${escapeHtml(protocol.form.valid)}"> Intento válido según este protocolo</label>`;
  const stop=existingStopReasons.has(protocol.form.stop)?'':iriTextarea('Motivo de suspensión o finalización',protocol.form.stop,{value:''});
  return `<fieldset class="m26-protocol-record"><legend>Trazabilidad del registro</legend><div class="m26-field-grid">${variant}${iriTextarea('Configuración exacta',protocol.form.configuration,{value:'',placeholder:'Material, altura, superficie, calzado, apoyos y cualquier ajuste que deba repetirse.'})}${valid}${iriTextarea('Motivo de adaptación',protocol.form.adaptation,{value:'',placeholder:'Déjalo vacío cuando se aplique el protocolo estándar sin cambios.'})}${stop}</div><p>Se guardarán automáticamente: nombre exacto, área, lado, fecha y versión <strong>${escapeHtml(protocol.version)}</strong>.</p></fieldset>`;
}
function protocolGuide(protocol){
  const visual=protocol.visual||{};
  const accessibleName=protocol.id==='chair-stand-30s'?'Silla 30 segundos':protocol.name;
  return `<details class="m26-protocol-card" data-iri-protocol="${escapeHtml(protocol.id)}"><summary aria-label="${escapeHtml(accessibleName)} · ver protocolo"><span><small>${escapeHtml(protocol.area)}</small><strong>${escapeHtml(protocol.name)}</strong><em>${escapeHtml(protocol.summary)}</em></span><b>Ver protocolo</b></summary><div class="m26-protocol-sheet"><header><div><p class="m26-eyebrow">Protocolo técnico · ${escapeHtml(protocol.version)}</p><h3>${escapeHtml(protocol.name)}</h3><p>${escapeHtml(protocol.summary)}</p></div><button type="button" data-iri-register-target="${escapeHtml(protocol.form.target)}">Registrar resultado</button></header><div class="m26-protocol-purpose"><article><span>Qué evalúa</span><p>${escapeHtml(protocol.evaluates)}</p></article><article><span>Qué no permite diagnosticar</span><p>${escapeHtml(protocol.doesNotDiagnose)}</p></article></div><details class="m26-protocol-demo"><summary>Ver demostración</summary><div class="m26-protocol-frames" aria-label="Secuencia técnica animada de ${escapeHtml(protocol.name)}">${protocolVisualFrame(visual.start||'Posición inicial',visual.kind,false)}<span class="m26-protocol-motion" aria-hidden="true"><i></i><b>→</b><small>secuencia</small></span>${protocolVisualFrame(visual.finish||'Posición final',visual.kind,true)}</div><div class="m26-protocol-validity"><p><strong>✓ Válido:</strong> ${escapeHtml(visual.validCue||'Se mantiene la configuración definida.')}</p><p><strong>✕ Inválido:</strong> ${escapeHtml(visual.invalidCue||'Se modifica la configuración o se pierde el criterio técnico.')}</p></div><small>Esquema técnico propio de IBERFIT. No se utiliza una fotografía o vídeo genérico. Un vídeo solo se incorporará cuando corresponda exactamente a esta versión del protocolo.</small></details><div class="m26-protocol-sections">${protocolList('Material y configuración',protocol.material)}${protocolList('Posición inicial',protocol.startPosition)}${protocolList('Cómo realizarla',protocol.steps)}${protocolList('Qué debe observar el Coach',protocol.observe)}${protocolList('Resultado válido',protocol.valid)}${protocolList('Errores que invalidan',protocol.invalid)}${protocolList('Cuándo detenerla',protocol.stop)}${protocolList('Qué debe registrarse',protocol.record)}${protocolList('Cómo se interpreta',protocol.interpretation)}</div>${protocolMetaFields(protocol)}<button type="button" class="m26-primary-action m26-protocol-register" data-iri-register-target="${escapeHtml(protocol.form.target)}">Cerrar y registrar resultado</button></div></details>`;
}
function protocolGrid(step){const label=step==='fuerza'?'Protocolos de fuerza: Silla 30 segundos, Remo TRX y core':step==='movilidad'?'Protocolos de movilidad: Rodilla a pared y movilidad estructurada':`Protocolos de ${step}`;return `<div class="m26-protocol-grid" data-iri-protocol-grid="${escapeHtml(step)}" aria-label="${escapeHtml(label)}">${iriProtocolsForStep(step).map(protocolGuide).join('')}</div>`;}

export function renderIriRoute(vm) {
  const current=vm.current||{};const summary=vm.currentSummary;const profile=vm.profile||{};const sourceProfile=vm.sourceProfile?.body&&typeof vm.sourceProfile.body==='object'?vm.sourceProfile.body:(vm.sourceProfile||{});const currentBody=current?.body&&typeof current.body==='object'?current.body:current;const personProfile=currentBody?.personProfile&&typeof currentBody.personProfile==='object'?currentBody.personProfile:{};const interview=currentBody?.interview&&typeof currentBody.interview==='object'?currentBody.interview:{};const seed=(...items)=>items.find((item)=>item!==undefined&&item!==null&&item!==''&&(!Array.isArray(item)||item.length))??'';const seedList=(...items)=>{const value=seed(...items);return Array.isArray(value)?value.join(', '):value;};const sexValue=seed(current.sexForNorms,current.sex_for_norms,personProfile.sexForNorms,sourceProfile.sexForNorms,profile.sexForNorms);const iriConfirmed=Boolean(summary?.confirmed||currentBody?.firstSessionCompletedAt||currentBody?.first_session_completed_at);
  const personContext=`<section class="m26-panel m26-panel-soft m26-iri-person"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Primera sesión</p><h2>${current.id?'Evaluación vinculada al expediente':'Evaluación todavía no preparada'}</h2><p>El borrador se conserva en este dispositivo. Solo una confirmación remota actualiza el expediente.</p></div>${current.id?badge('Entidad IRI disponible','success'):badge('Falta entidad IRI remota','warning')}</div><div class="m26-field-grid">${field('Fecha de nacimiento',profile.birthDate)}${field('Sexo utilizado para baremos',profile.sexForNormsLabel)}${field('Correo',profile.email)}${field('Teléfono',profile.phone)}${field('Modalidad',profile.modalityLabel)}${field('Dirección',[profile.trainingAddress,profile.commune].filter(Boolean).join(' · '))}</div></section>`;
  const steps=[];
  steps.push(iriStep(0,'perfil','Expediente y datos esenciales','Confirma identidad, contacto, servicio, logística y objetivo antes de las pruebas.',`<p class="m26-required-note"><strong>* Campos obligatorios.</strong> Los opcionales se indican expresamente.</p><div class="m26-field-grid">${iriInput('Fecha de evaluación','assessmentDate',{type:'date',value:String(current.assessmentDate||current.evaluatedAt||'').slice(0,10),required:true})}${iriInput('Fecha de nacimiento','birthDate',{type:'date',value:profile.birthDate||'',required:true})}${iriSelect('Sexo para baremos','sexForNorms',[['','Seleccionar'],['female','Mujer'],['male','Hombre']],{value:sexValue,required:true})}${iriInput('Identidad de género','genderIdentity',{value:seed(personProfile.genderIdentity,sourceProfile.genderIdentity,profile.genderIdentity)})}${iriInput('Pronombres','pronouns',{value:seed(personProfile.pronouns,sourceProfile.pronouns,profile.pronouns)})}${iriInput('Correo electrónico','email',{type:'email',value:profile.email||'',required:true})}${iriInput('Teléfono','phone',{value:profile.phone||'',required:true})}${iriSelect('Canal preferido','preferredContactChannel',[['WhatsApp','WhatsApp'],['Correo electrónico','Correo electrónico'],['Teléfono','Teléfono']],{value:seed(personProfile.preferredContactChannel,sourceProfile.preferredContactChannel,profile.preferredContactChannel,'WhatsApp')})}${iriInput('Horario de contacto','preferredContactTime',{value:seed(personProfile.preferredContactTime,sourceProfile.preferredContactTime,profile.preferredContactTime)})}${iriInput('Zona horaria','timezone',{value:seed(personProfile.timezone,sourceProfile.timezone,profile.timezone,'America/Santiago')})}${iriSelect('Modalidad','modality',[['presencial','Presencial'],['hibrido','Híbrido'],['online','Online']],{value:profile.modality||'presencial',required:true})}${iriInput('Frecuencia semanal','weeklyFrequency',{type:'number',min:1,max:14,value:profile.weeklyFrequency||2,required:true})}${iriInput('Duración habitual (min)','sessionDurationMinutes',{type:'number',min:20,max:240,value:profile.sessionDurationMinutes||60,required:true})}${iriInput('Comuna o sector','commune',{value:seed(personProfile.commune,sourceProfile.commune,profile.commune)})}${iriInput('Dirección de entrenamiento','trainingAddress',{value:seed(personProfile.trainingAddress,sourceProfile.trainingAddress,profile.trainingAddress),wide:true})}${iriInput('Tipo de lugar','locationType',{value:seed(personProfile.locationType,sourceProfile.locationType,profile.locationType)})}${iriInput('Horario preferido','preferredSchedule',{value:seed(personProfile.preferredSchedule,sourceProfile.preferredSchedule,profile.preferredSchedule)})}${iriTextarea('Instrucciones de acceso','accessInstructions',{value:seed(personProfile.accessInstructions,sourceProfile.accessInstructions,profile.accessInstructions)})}${iriTextarea('Material disponible','equipment',{placeholder:'TRX, mancuernas, banco, bandas…',value:seedList(personProfile.equipment,sourceProfile.equipment,sourceProfile.equipmentAvailable,profile.equipment)})}${iriTextarea('Objetivo principal','primaryObjective',{max:600,required:true,value:seed(personProfile.primaryObjective,sourceProfile.primaryObjective,sourceProfile.objective,profile.primaryObjective)})}${iriTextarea('Objetivos secundarios','secondaryObjectives',{max:800,placeholder:'Separados por comas',value:seedList(personProfile.secondaryObjectives,sourceProfile.secondaryObjectives,profile.secondaryObjectives)})}${iriInput('Contacto de emergencia','emergencyContactName',{value:seed(personProfile.emergencyContactName,sourceProfile.emergencyContactName,profile.emergencyContactName)})}${iriInput('Relación','emergencyContactRelation',{value:seed(personProfile.emergencyContactRelation,sourceProfile.emergencyContactRelation,profile.emergencyContactRelation)})}${iriInput('Teléfono de emergencia','emergencyContactPhone',{value:seed(personProfile.emergencyContactPhone,sourceProfile.emergencyContactPhone,profile.emergencyContactPhone)})}</div>`));
  steps.push(iriStep(1,'entrevista','Entrevista y seguridad','Registra el contexto que condicionará la evaluación y la planificación.',`<div class="m26-field-grid">${iriSelect('Experiencia de entrenamiento','trainingExperience',[['','Seleccionar'],['Inicial','Inicial'],['Intermedia','Intermedia'],['Avanzada','Avanzada']],{required:true,value:seed(interview.trainingExperience,currentBody.trainingExperience,sourceProfile.trainingExperience,sourceProfile.experienceLevel)})}${iriInput('Disponibilidad real','availability',{required:true,value:seed(interview.availability,currentBody.availability,sourceProfile.availability,sourceProfile.preferredSchedule,profile.preferredSchedule)})}${iriInput('Sueño percibido (0–10)','sleepScore',{type:'number',min:0,max:10,step:.1,help:'0 = muy malo · 10 = excelente'})}${iriInput('Estrés percibido (0–10)','stressScore',{type:'number',min:0,max:10,step:.1,help:'0 = nada de estrés · 10 = estrés máximo'})}${iriInput('Energía percibida (0–10)','energyScore',{type:'number',min:0,max:10,step:.1,help:'0 = sin energía · 10 = energía máxima'})}${iriTextarea('Historial de entrenamiento','trainingHistory',{value:seed(interview.trainingHistory,currentBody.trainingHistory,sourceProfile.trainingHistory)})}${iriTextarea('Entrenamiento actual','currentTraining',{value:seed(interview.currentTraining,currentBody.currentTraining,sourceProfile.currentTraining)})}${iriTextarea('Preferencias','preferences',{value:seed(interview.preferences,currentBody.preferences,sourceProfile.preferences)})}${iriTextarea('Antecedentes declarados','healthHistory',{value:seed(interview.healthHistory,currentBody.healthHistory,sourceProfile.healthHistory)})}${iriTextarea('Restricciones o precauciones','restrictions',{value:seed(interview.restrictions,currentBody.restrictions,sourceProfile.restrictions)})}${iriTextarea('Dolor actual','currentPain',{value:seed(interview.currentPain,currentBody.currentPain,sourceProfile.currentPain,sourceProfile.pain)})}${iriTextarea('Observaciones del cribado','screeningNotes',{value:seed(interview.screeningNotes,currentBody.screeningNotes,sourceProfile.screeningNotes)})}<label class="m26-wide m26-consent"><input type="checkbox" name="screeningAccepted" required> He comprobado que no existen síntomas actuales o condiciones declaradas que obliguen a aplazar las pruebas. Esta evaluación no sustituye una valoración clínica.</label></div>`));
  steps.push(iriStep(2,'composicion','Bioimpedancia y composición corporal','Registra el método, el dispositivo y las condiciones. La bioimpedancia se usa como seguimiento descriptivo y no como puntuación.',`${protocolGrid('composicion')}<label class="m26-skip"><input type="checkbox" name="bodyCompositionSkipped"> No realizada</label><p class="m26-skip-help">Al marcarla se desactivan todas las mediciones y pasa a ser obligatorio indicar el motivo. El borrador se conserva. El IRI puede confirmarse cuando existan al menos dos dominios objetivos completos.</p><div class="m26-field-grid">${iriInput('Peso (kg)','weightKg',{type:'number',min:20,max:350,step:.1})}${iriInput('Talla (cm)','heightCm',{type:'number',min:100,max:230,step:.1})}${iriInput('IMC calculado','bmiPreview',{readonly:true})}${iriInput('Grasa corporal (%)','bodyFatPercent',{type:'number',min:1,max:80,step:.1})}${iriInput('Masa magra (kg)','leanMassKg',{type:'number',min:1,max:250,step:.1})}${iriInput('Masa muscular (kg)','muscleMassKg',{type:'number',min:1,max:250,step:.1})}${iriInput('Agua corporal (%)','bodyWaterPercent',{type:'number',min:10,max:80,step:.1})}${iriInput('Cintura (cm)','waistCm',{type:'number',min:30,max:250,step:.1})}${iriInput('Grasa visceral','visceralFatLevel',{type:'number',min:0,max:100})}${iriSelect('Método de medición','bodyCompositionMethod',[['','Seleccionar'],['bioimpedancia-segmental','Bioimpedancia segmental'],['bioimpedancia-tetrapolar','Bioimpedancia tetrapolar'],['antropometria','Antropometría'],['otro','Otro método']])}${iriInput('Equipo y modelo','bodyCompositionDevice',{help:'Registra marca y modelo para comparar futuras mediciones.'})}${iriTextarea('Condiciones de medición','measurementConditions',{placeholder:'Hora, hidratación, ingesta previa, ejercicio reciente y cualquier condición que afecte la comparación.'})}<label class="m26-wide">Informe externo PDF o imagen<input type="file" name="bodyCompositionAttachment" accept="application/pdf,image/png,image/jpeg"><small>PDF, JPG o PNG · máximo 50 MB. La aplicación lo subirá y vinculará a esta evaluación al pulsar «Subir informe».</small></label><input type="hidden" name="bodyCompositionAttachmentName"><input type="hidden" name="bodyCompositionAttachmentType"><input type="hidden" name="bodyCompositionAttachmentSize">${iriTextarea('Motivo de no realización','bodyCompositionSkipReason')}${iriTextarea('Observaciones','bodyCompositionNotes')}</div>`));
  steps.push(iriStep(3,'movilidad','Movilidad y patrones de movimiento','Mediciones en centímetros y observación estructurada; no se estiman grados.',`${protocolGrid('movilidad')}<label class="m26-skip"><input type="checkbox" name="mobilitySkipped"> No realizada</label><p class="m26-skip-help">Al marcarla se desactivan las pruebas y pasa a ser obligatorio indicar el motivo.</p><div class="m26-measure-grid">${trialInputs('ankleLeft','Rodilla a pared · izquierda')}${trialInputs('ankleRight','Rodilla a pared · derecha')}${trialInputs('posteriorLeft','Back-saver · izquierda',{min:-50,max:80})}${trialInputs('posteriorRight','Back-saver · derecha',{min:-50,max:80})}</div><div class="m26-computed-grid"><div><span>Mejor tobillo izquierdo</span><strong data-iri-computed="ankle-left">—</strong></div><div><span>Mejor tobillo derecho</span><strong data-iri-computed="ankle-right">—</strong></div><div><span>Asimetría tobillo</span><strong data-iri-computed="ankle-diff">—</strong></div><div><span>Asimetría cadena posterior</span><strong data-iri-computed="posterior-diff">—</strong></div></div><div class="m26-field-grid">${iriTextarea('Dolor en prueba de tobillo','anklePain')}${iriTextarea('Compensaciones de tobillo','ankleCompensation')}${iriTextarea('Dolor en cadena posterior','posteriorPain')}${iriSelect('Thomas modificado · izquierda','thomasLeft',[['','Seleccionar'],['Sin limitación visible','Sin limitación visible'],['Limitación leve','Limitación leve'],['Limitación evidente','Limitación evidente'],['Dolor','Dolor'],['No evaluable','No evaluable']])}${iriSelect('Thomas modificado · derecha','thomasRight',[['','Seleccionar'],['Sin limitación visible','Sin limitación visible'],['Limitación leve','Limitación leve'],['Limitación evidente','Limitación evidente'],['Dolor','Dolor'],['No evaluable','No evaluable']])}${iriInput('Control pélvico','thomasPelvicControl')}${iriInput('Dolor Thomas','thomasPain')}${iriSelect('Rotación de cadera','hipRotationResult',[['','Seleccionar'],['Simétrica','Simétrica'],['Asimetría leve','Asimetría leve'],['Asimetría evidente','Asimetría evidente'],['Limitación bilateral','Limitación bilateral'],['Dolor','Dolor'],['No evaluable','No evaluable']],{required:true})}${iriTextarea('Compensación en rotación','hipRotationCompensation')}${iriTextarea('Dolor en rotación','hipRotationPain')}${iriSelect('Sentadilla asistida · profundidad','squatDepth',[['','Seleccionar'],['Completa','Completa'],['Paralela','Paralela'],['Parcial','Parcial'],['No evaluable','No evaluable']],{required:true})}${iriInput('Talones','squatHeels')}${iriInput('Rodillas','squatKnees')}${iriInput('Tronco','squatTrunk')}${iriInput('Desplazamiento lateral','squatShift')}${iriInput('Respuesta a elevación o apoyo','squatAssistanceResponse')}${iriInput('Dolor en sentadilla','squatPain')}${iriTextarea('Motivo de no realización','mobilitySkipReason')}${iriTextarea('Observaciones de movilidad','mobilityNotes')}</div>`));
  steps.push(iriStep(4,'fuerza','Fuerza por patrones','Cada variante se registra como un protocolo distinto. No se mezclan baremos incompatibles.',`${protocolGrid('fuerza')}<label class="m26-skip"><input type="checkbox" name="strengthSkipped"> No realizada</label><p class="m26-skip-help">Al marcarla se desactivan las pruebas y pasa a ser obligatorio indicar el motivo. El borrador se conserva. El IRI puede confirmarse cuando existan al menos dos dominios objetivos completos.</p><div class="m26-test-cards"><section><h4>Silla 30 segundos</h4><div class="m26-field-grid">${iriInput('Repeticiones válidas','chairStand30s',{type:'number',min:0,max:100})}${iriInput('Altura de silla (cm)','chairHeightCm',{type:'number',min:30,max:70,step:.1})}<label class="m26-consent"><input type="checkbox" name="chairStandValid"> Protocolo válido</label>${iriTextarea('Observaciones','chairStandNotes')}</div><p class="m26-norm-result" data-iri-norm="chairStand30s" role="status">Introduce un resultado válido para interpretar.</p></section><section><h4>Empuje</h4><div class="m26-field-grid">${iriSelect('Variante','pushVariant',[['','Seleccionar'],['standard','Flexión estándar'],['incline','Flexión inclinada'],['knees','Apoyo de rodillas']])}${iriInput('Repeticiones válidas','pushUps',{type:'number',min:0,max:200})}${iriInput('Altura de apoyo (cm)','pushSupportHeightCm',{type:'number',min:0,max:180,step:.1})}<label class="m26-consent"><input type="checkbox" name="pushValid"> Protocolo válido</label>${iriTextarea('Observaciones','pushNotes')}</div><p class="m26-norm-result" data-iri-norm="pushUps" role="status">Introduce un resultado válido para interpretar.</p></section><section><h4>Tracción TRX</h4><div class="m26-field-grid">${iriInput('Repeticiones válidas','trxRowRepetitions',{type:'number',min:0,max:200})}${iriInput('Altura de asas (cm)','trxHandleHeightCm',{type:'number',min:0,max:250,step:.1})}${iriInput('Talones al anclaje vertical (cm)','trxHeelDistanceCm',{type:'number',min:0,max:300,step:.1})}${iriInput('Posición','trxPosition')}<label class="m26-consent"><input type="checkbox" name="trxValid"> Protocolo válido</label>${iriTextarea('Observaciones','trxNotes')}</div></section><section><h4>Tronco</h4><div class="m26-field-grid">${iriInput('Plancha frontal (s)','frontPlankSeconds',{type:'number',min:0,max:1800})}${iriInput('Plancha lateral izquierda (s)','sidePlankLeftSeconds',{type:'number',min:0,max:1800})}${iriInput('Plancha lateral derecha (s)','sidePlankRightSeconds',{type:'number',min:0,max:1800})}${iriInput('Calidad técnica','coreQuality')}${iriInput('Dolor','corePain')}</div></section><section><h4>Cadena posterior · opcional</h4><div class="m26-field-grid">${iriSelect('Protocolo','posteriorChainProtocol',[['','No realizado'],['sorensen-standard','Biering–Sørensen estándar'],['sorensen-45','Sørensen modificado 45°'],['ito','Ito separado']])}${iriInput('Tiempo (s)','posteriorChainSeconds',{type:'number',min:0,max:1800})}<label class="m26-consent"><input type="checkbox" name="posteriorEquipmentCompatible"> Equipo compatible con el protocolo registrado</label>${iriTextarea('Motivo de no realización','posteriorNotPerformedReason')}${iriInput('Dolor','posteriorChainPain')}</div></section></div><div class="m26-field-grid">${iriTextarea('Motivo de no realización de fuerza','strengthSkipReason')}${iriTextarea('Observaciones generales','strengthNotes')}</div>`));
  steps.push(iriStep(5,'cardio','Prueba cardiorrespiratoria','Máximo 3 minutos de ejercicio y un minuto principal de recuperación.',`${protocolGrid('cardio')}<label class="m26-skip"><input type="checkbox" name="cardioSkipped"> No realizada</label><p class="m26-skip-help">Al marcarla se desactivan la prueba y el temporizador, y pasa a ser obligatorio indicar el motivo. El borrador se conserva. El IRI puede confirmarse cuando existan al menos dos dominios objetivos completos.</p><div class="m26-cardio-hero"><div><span>Protocolo</span><strong>YMCA · 3 minutos</strong><small>96 pulsos/min · subir, subir, bajar, bajar</small></div><div data-iri-timer="cardio" aria-live="polite"><strong>03:00</strong><span>Temporizador con avisos sonoros a 3, 2, 1 y final</span><div class="m26-timer-actions"><button type="button" data-iri-timer-action="start">Iniciar</button><button type="button" data-iri-timer-action="pause">Pausar</button><button type="button" data-iri-timer-action="reset">Reiniciar</button></div></div></div><div class="m26-field-grid">${iriSelect('Variante','cardioProtocol',[['ymca-3min-standard','Estándar · 30,5 cm'],['iberfit-3min-adapted','Adaptada IBERFIT · 20 cm']])}${iriInput('Altura del escalón (cm)','stepHeightCm',{type:'number',min:10,max:50,step:.1,value:30.5})}${iriInput('Cadencia (pulsos/min)','cadenceBpm',{type:'number',min:40,max:160,value:96})}${iriInput('Duración (s)','cardioDurationSeconds',{type:'number',min:30,max:180,value:180})}${iriInput('FC reposo','restingHr',{type:'number',min:30,max:220})}${iriInput('FC final','stepFinalHr',{type:'number',min:30,max:240})}${iriInput('FC al minuto','stepOneMinuteHr',{type:'number',min:30,max:240})}${iriInput('FC a los 2 minutos · opcional','twoMinuteHr',{type:'number',min:30,max:220})}${iriInput('ΔFC calculada','deltaFcPreview',{readonly:true})}${iriInput('RPE final (0–10)','cardioRpe',{type:'number',min:0,max:10,step:.1})}<label class="m26-consent"><input type="checkbox" name="cardioValid"> Prueba válida y cadencia mantenida</label>${iriTextarea('Síntomas','cardioSymptoms')}${iriTextarea('Motivo de finalización','cardioStopReason')}${iriTextarea('Motivo de no realización','cardioSkipReason')}${iriTextarea('Observaciones','cardioNotes')}</div>`));
  steps.push(iriStep(6,'revision','Diagnóstico y entrega','Separa datos objetivos, interpretación profesional y próximos pasos.',`<section class="m26-comparability" data-iri-comparability role="status" aria-live="polite">La comparabilidad se comprobará al registrar la configuración de cada prueba.</section><div class="m26-review-summary"><div><span>Completitud</span><strong data-iri-computed="completion">0%</strong></div><div><span>Recuperación FC</span><strong data-iri-computed="delta">—</strong></div><div><span>Documento cliente</span><strong>7 páginas</strong></div><div><span>Documento interno</span><strong>14 páginas + anexos</strong></div></div><div class="m26-field-grid">${iriTextarea('Fortalezas','diagnosisStrengths',{max:1000,placeholder:'Una por línea',required:true})}${iriTextarea('Prioridades','diagnosisPriorities',{max:1000,placeholder:'Una por línea',required:true})}${iriTextarea('Interpretación del Coach','coachInterpretation',{max:2200,required:true})}${iriTextarea('Implicaciones para el entrenamiento','trainingImplications',{max:2200})}${iriTextarea('Plan inicial','initialPlan',{max:2200,required:true})}${iriInput('Frecuencia recomendada','recommendedFrequency')}${iriInput('Fecha de reevaluación','reevaluationDate',{type:'date'})}<label class="m26-wide m26-consent"><input type="checkbox" name="reviewAccepted" required> He revisado el contenido, los protocolos, las limitaciones y la coherencia del diagnóstico.</label></div><section class="m26-report-choice"><article><img src="/public/isotipo-iberfit.png" alt=""><div><h4>Versión Cliente</h4><p>Resumen visual, comprensible y accionable.</p></div><button type="button" data-workflow-action="generate-client-iri-report"${iriConfirmed?'':' disabled aria-disabled="true" title="Confirma primero la evaluación IRI"'}>Generar PDF Cliente</button></article><article><img src="/public/isotipo-iberfit.png" alt=""><div><h4>Versión Coach / Admin</h4><p>Datos completos, protocolos, validez y trazabilidad.</p></div><button type="button" data-workflow-action="generate-coach-iri-report"${iriConfirmed?'':' disabled aria-disabled="true" title="Confirma primero la evaluación IRI"'}>Generar PDF interno</button></article></section>${iriConfirmed?'':'<p class="m26-notice is-warning">Los informes se habilitan únicamente después de confirmar y verificar la evaluación en el expediente.</p>'}`));
  const editor=vm.canEdit?`<form class="m26-panel m26-iri-wizard" data-workflow-form="iri" data-iri-step-index="0"><input type="hidden" name="entityId" value="${escapeHtml(current.id||'')}"><div class="m26-stepper" role="list">${['Expediente','Entrevista','Composición','Movilidad','Fuerza','Cardio','Revisión'].map((labelText,index)=>`<button type="button" role="listitem" data-iri-step-jump="${index}"${index===0?' class="is-active"':''}><span>${index+1}</span><small>${labelText}</small></button>`).join('')}</div><div class="m26-progress-track"><i data-iri-progress style="width:14.3%"></i></div>${steps.join('')}<div class="m26-wizard-actions"><button type="button" data-workflow-action="iri-prev" disabled>Anterior</button><button type="button" data-workflow-action="save-iri-draft">Guardar borrador</button><button type="button" class="m26-primary-action" data-workflow-action="iri-next">Validar y continuar</button><button type="submit" class="m26-primary-action" data-workflow-action="complete-iri" hidden${current.id?'':' disabled aria-disabled="true"'}>Confirmar evaluación IRI</button></div>${current.id?'':'<p class="m26-notice is-warning">El expediente debe devolver una entidad IRI remota antes de poder confirmar. El borrador y los informes internos pueden prepararse igualmente.</p>'}${workflowStatus('iri')}</form>`:'';
  const domainCards=summary?`<div class="m26-domain-grid">${iriDomainState('Respuesta cardiovascular',summary.domains.cardiovascular)}${iriDomainState('Composición corporal',summary.domains.bodyComposition)}${iriDomainState('Fuerza por patrón',summary.domains.strength)}</div>`:emptyState('Sin evaluación confirmada','Los datos ausentes se mantienen como “Sin registro”.');
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Primera sesión y diagnóstico</p><h2>Índice de Rendimiento IBERFIT</h2><p>Proceso guiado de 7 etapas. Los 3 dominios de resultado resumen evidencia objetiva y nunca forman una puntuación global.</p></div>${badge(summary?summary.processLabel||summary.coverageLabel:'Pendiente',summary?.confirmed?'success':'warning')}</section>${personContext}<section class="m26-content-grid"><article class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Última evaluación confirmada</p><h2>${escapeHtml(summary?.dateLabel||'Sin fecha')}</h2><p>${escapeHtml(summary?.processLabel||'No hay evaluación confirmada.')}</p><p>${escapeHtml(summary?.coverageLabel||'Los dominios de resultado aún no están confirmados.')}</p>${domainCards}<p class="m26-notice">No se presenta una puntuación global automática cuando la evidencia no cubre dominios comparables.</p></article><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Historial</p><h2>Evaluaciones registradas</h2></div>${badge(countLabel(vm.history.length,'registro','registros'),'neutral')}</div>${recordList(vm.history,'Sin evaluaciones IRI')}</section></section>${editor}</div>`;
}

export function renderPlanningRoute(vm){
  const isClient=vm.role==='client';const cycle=vm.currentCycle?.body&&typeof vm.currentCycle.body==='object'?vm.currentCycle.body:(vm.currentCycle||{});const cycleModality=String(cycle.modality||cycle.modalidad||'hibrido').toLowerCase();
  const editor=vm.canEdit?`<form class="m26-panel m26-panel-soft" data-workflow-form="planning"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Entrenador</p><h2>Preparar ciclo de entrenamiento</h2><p>Validar crea una versión interna. Después deberá aprobarse y publicarse de forma expresa.</p></div></div><input type="hidden" name="entityId" value="${escapeHtml(vm.currentCycle?.id||cycle.id||'')}"><div class="m26-field-grid"><label>Nombre del ciclo<input name="name" maxlength="120" value="${escapeHtml(cycle.name||cycle.nombre||'')}" required></label><label>Inicio<input type="date" name="startDate" value="${escapeHtml(String(cycle.startDate||cycle.start_date||'').slice(0,10))}" required></label><label>Fin<input type="date" name="endDate" value="${escapeHtml(String(cycle.endDate||cycle.end_date||'').slice(0,10))}" required></label><label>Modalidad<select name="modality" required><option value="presencial"${selectedOption(cycleModality,'presencial')}>Presencial</option><option value="hibrido"${selectedOption(cycleModality,'hibrido')}>Híbrido</option><option value="online"${selectedOption(cycleModality,'online')}>Online</option></select></label><label>Frecuencia semanal<input type="number" name="weeklyFrequency" min="1" max="14" value="${escapeHtml(cycle.weeklyFrequency||cycle.weekly_frequency||2)}" required></label><label>Duración habitual (min)<input type="number" name="sessionDurationMinutes" min="20" max="240" value="${escapeHtml(cycle.sessionDurationMinutes||cycle.session_duration_minutes||60)}" required></label><label class="m26-wide">Objetivo<textarea name="goal" maxlength="500" required>${escapeHtml(cycle.goal||cycle.objetivo||'')}</textarea></label></div><button type="submit" class="m26-primary-action" data-workflow-action="validate-plan">Validar borrador</button>${workflowStatus('planning')}</form>`:'';
  const title=isClient?'Tu planificación':'Planificación y publicación';
  const copy=isClient?'Aquí tienes tu plan actual y las sesiones que ya están listas para ti.':'Cada contenido pasa por validación, aprobación y publicación. Aprobar no lo hace visible para el cliente.';
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Planificación</p><h2>${title}</h2><p>${copy}</p></div>${badge(countLabel(vm.sessions.length,'sesión','sesiones'),'neutral')}</section><section class="m26-content-grid"><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Ciclos</p><h2>${isClient?'Tu plan vigente':'Ciclos en gestión'}</h2></div>${!isClient?badge(`${vm.cycleCounts?.approved||0} aprobados`,'neutral'):''}</div>${publicationList(vm.cycles,'planning',isClient?'Aún no hay un plan disponible':'Sin ciclos preparados',{clientView:isClient})}</section><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Sesiones</p><h2>${isClient?'Sesiones de tu plan':'Estado de las sesiones'}</h2></div>${!isClient?badge(`${vm.sessionCounts?.published||0} publicadas`,'success'):''}</div>${publicationList(vm.sessions,'session',isClient?'Aún no hay sesiones disponibles':'Sin sesiones preparadas',{clientView:isClient})}</section></section>${editor}</div>`;
}
export function renderAgendaRoute(vm) {
  const options = vm.clients
    .map((item) => {
      const address = [item.profile?.trainingAddress, item.profile?.commune]
        .filter(Boolean)
        .join(' · ');
      return `<option value="${escapeHtml(item.id)}" data-training-address="${escapeHtml(address)}" data-client-modality="${escapeHtml(item.profile?.modality || '')}"${item.id === vm.selectedClientId ? ' selected' : ''}>${escapeHtml(item.name)}</option>`;
    })
    .join('');
  const form = `<form class="m26-panel m26-panel-soft" data-workflow-form="appointment"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Agenda</p><h2>Crear propuesta de cita</h2><p>La propuesta permanece interna hasta que la cita sea confirmada.</p></div></div><div class="m26-field-grid"><label>Cliente<select name="clientId" required>${options}</select></label><label>Modalidad de esta cita<select name="modality" required><option value="presencial">Presencial</option><option value="guiada_en_app">Guiada en la aplicación</option><option value="online">En línea</option></select></label><label>Inicio<input type="datetime-local" name="startAt" required></label><label>Fin<input type="datetime-local" name="endAt" required></label><label class="m26-wide">Ubicación<input name="location" maxlength="300" autocomplete="street-address" aria-describedby="m26-location-help"></label><p id="m26-location-help" class="m26-field-help m26-wide">La dirección habitual del expediente se propone automáticamente para citas presenciales.</p></div><button type="submit" class="m26-primary-action" data-workflow-action="create-appointment">Crear propuesta de cita</button>${workflowStatus('appointment')}</form>`;

  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Agenda del entrenador</p><h2>Citas y propuestas</h2><p>Las propuestas son internas. El cliente solo recibe citas confirmadas.</p></div>${badge(countLabel(vm.appointments.length, 'registro', 'registros'), 'neutral')}</section><section class="m26-panel"><div class="m26-stack">${vm.appointments.length ? vm.appointments.map((item)=>appointmentCard(item,{canManage:['admin','coach'].includes(String(vm.role||''))})).join('') : emptyState('Agenda vacía', 'No hay citas ni propuestas registradas.')}</div></section>${form}</div>`;
}

export function renderSessionsRoute(vm){
  const isClient=vm.role==='client';
  const primary=vm.canBuild?`<button type="button" class="m26-primary-action" data-workflow-action="open-session-builder">Continuar o crear sesión</button>`:`<button type="button" class="m26-primary-action" data-workflow-action="start-published-session"${vm.sessions.length?'':' disabled aria-disabled="true"'}>Iniciar sesión guiada</button>`;
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Motor de sesiones</p><h2>${isClient?'Tus sesiones guiadas':'Construcción y publicación de sesiones'}</h2><p>${isClient?'Elige la sesión preparada para ti y sigue las indicaciones paso a paso.':'Construye desde el catálogo, revisa la vista previa y controla de forma expresa qué recibe el cliente.'}</p></div>${primary}</section><section class="m26-content-grid"><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">${isClient?'Disponibles':'Ciclo de publicación'}</p><h2>${isClient?'Sesiones para realizar':'Sesiones del expediente'}</h2></div>${!isClient?badge(`${vm.sessionCounts?.published||0} publicadas`,'success'):''}</div>${publicationList(vm.sessions,'session',isClient?'No hay sesiones disponibles':'Sin sesiones preparadas',{clientView:isClient})}</section><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Historial</p><h2>${isClient?'Tus sesiones realizadas':'Ejecuciones confirmadas'}</h2></div></div>${recordList(vm.executions,'Sin ejecuciones confirmadas')}</section></section>${!isClient?'<p class="m26-notice">Los borradores locales no aparecen como publicados: se recuperan con “Continuar o crear sesión”.</p>':''}${workflowStatus('session')}</div>`;
}
export function renderReportsRoute(vm){
  const isClient=vm.role==='client';
  const iriId=vm.latestIri?.id||'';
  const diagnosis=vm.iriDiagnosis||(vm.latestIri?{assessmentId:iriId,dateLabel:'Fecha de evaluación confirmada',classification:'Perfil IRI por dominios',processLabel:'Evaluación confirmada',revision:Number(vm.latestIri.revision||1)}:null);
  const clientDiagnosis=isClient&&diagnosis?`<section class="m26-panel m26-iri-diagnosis-card" data-iri-diagnosis data-assessment-id="${escapeHtml(diagnosis.assessmentId)}"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Documento principal</p><h2>Diagnóstico IRI</h2><p>Evaluación confirmada · ${escapeHtml(diagnosis.dateLabel)}</p></div>${badge(`Revisión ${diagnosis.revision}`,'success')}</div><div class="m26-iri-diagnosis-meta">${field('Fecha de evaluación',diagnosis.dateLabel)}${field('Clasificación',diagnosis.classification)}${field('Estado',diagnosis.processLabel)}${field('Versión o revisión',`Revisión ${diagnosis.revision}`)}</div><div class="m26-external-report-actions"><button type="button" class="m26-primary-action" data-m26-area="iri">Ver diagnóstico</button><button type="button" data-workflow-action="generate-client-iri-report" data-assessment-id="${escapeHtml(diagnosis.assessmentId)}">Generar o abrir PDF Cliente</button></div>${workflowStatus('iri-report')}<div data-iri-external-report-host data-assessment-id="${escapeHtml(diagnosis.assessmentId)}"></div></section>`:isClient?`<section class="m26-notice"><strong>Diagnóstico IRI pendiente</strong><p>Tu diagnóstico aparecerá aquí cuando la evaluación esté confirmada.</p></section>`:'';
  const iriDocuments=!isClient&&iriId?`<section class="m26-panel m26-panel-soft m26-iri-report-access"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Diagnóstico inicial confirmado</p><h2>Documentos del IRI</h2><p>Se generan directamente desde la evaluación remota confirmada. No es necesario volver a completar el formulario.</p></div>${badge('Listos para generar','success')}</div><div class="m26-action-grid"><button type="button" class="m26-primary-action" data-workflow-action="generate-client-iri-report">Abrir PDF Cliente</button><button type="button" data-workflow-action="generate-coach-iri-report">Abrir PDF Coach / Admin</button></div>${workflowStatus('iri-report')}</section>`:'';
  const editor=vm.canManage?(iriId?`<form class="m26-panel m26-panel-soft m26-report-editor" data-workflow-form="report-approval"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Edición profesional</p><h2>Preparar informe IBERFIT</h2><p>El informe se aprobará como contenido interno. No será visible para el cliente hasta una publicación posterior y expresa.</p></div>${badge('Formato A4 premium','neutral')}</div><input type="hidden" name="assessmentId" value="${escapeHtml(iriId)}"><div class="m26-field-grid"><label class="m26-wide">Título<input name="title" maxlength="140" value="Informe de evolución IBERFIT" required></label><label>Inicio del periodo<input type="date" name="periodStart" required></label><label>Fin del periodo<input type="date" name="periodEnd" required></label><label class="m26-wide">Resumen del periodo<textarea name="summary" minlength="20" maxlength="2500" required></textarea></label><label class="m26-wide">Conclusiones<textarea name="conclusions" minlength="20" maxlength="2500" required></textarea></label><label class="m26-wide">Recomendaciones y próximos pasos<textarea name="recommendations" minlength="20" maxlength="2500" required></textarea></label></div><section class="m26-report-preview" aria-label="Criterios de revisión del informe"><p class="m26-eyebrow">Revisión previa</p><h3>Comprobación editorial</h3><p>Confirma que el texto distingue datos objetivos, interpretación profesional y próximos pasos; evita diagnósticos y afirmaciones no respaldadas.</p><label><input type="checkbox" name="reviewAccepted" required> He revisado íntegramente el contenido y confirmo que está listo para aprobación interna.</label></section><button type="submit" class="m26-primary-action" data-workflow-action="approve-report">Aprobar informe interno</button>${workflowStatus('report')}</form>`:`<section class="m26-notice is-warning" role="status"><strong>Falta un diagnóstico IRI confirmado</strong><p>El informe premium no puede prepararse hasta que exista una evaluación IRI trazable en el expediente.</p></section>`):'';
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Documentación</p><h2>${isClient?'Tus informes IBERFIT':'Informes y publicación'}</h2><p>${isClient?'Abre tu Diagnóstico IRI y consulta dentro de él su documento complementario de bioimpedancia.':'Los documentos del IRI se generan desde la evaluación confirmada. Los informes de evolución mantienen un ciclo separado de aprobación y publicación.'}</p></div>${badge(countLabel(vm.reports.length,'informe','informes'),'neutral')}</section>${clientDiagnosis}${iriDocuments}<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Seguimiento</p><h2>${isClient?'Informes disponibles':'Informes de evolución'}</h2></div></div>${publicationList(vm.reports,'report',isClient?'Aún no hay informes disponibles':'Sin informes de evolución preparados',{clientView:isClient})}</section>${editor}${!editor?workflowStatus('report'):''}</div>`;
}
export function renderIntelligenceRoute(vm){
  const form=vm.canGenerate?`<form class="m26-panel m26-panel-soft" data-workflow-form="intelligence"><div class="m26-panel-heading"><div><p class="m26-eyebrow">La IA propone</p><h2>Generar propuesta de sesión</h2></div></div><div class="m26-field-grid"><label class="m26-wide">Pregunta o criterio del entrenador<textarea name="coachQuestion" maxlength="1200" placeholder="Ej.: Analiza los datos disponibles, señala limitaciones y propón próximos pasos sin publicar nada."></textarea></label><label>Objetivo<input name="goal" value="fuerza" required></label><label>Duración (min)<input type="number" min="20" max="120" name="durationMinutes" value="50" required></label><label>Experiencia<select name="experience"><option value="inicial">Inicial</option><option value="intermedio" selected>Intermedio</option><option value="avanzado">Avanzado</option></select></label><label>Modalidad<select name="modality"><option value="hibrido">Híbrido</option><option value="online">En línea</option><option value="presencial">Presencial</option></select></label><label>Edad calculada<input type="number" name="ageYears" value="${escapeHtml(vm.ageYears??'')}" readonly aria-describedby="m26-age-help"></label><p id="m26-age-help" class="m26-field-help">Se calcula automáticamente desde la fecha de nacimiento del expediente.</p><label>Material<input name="equipment" value="TRX,mancuernas"></label></div><button type="submit" class="m26-primary-action" data-workflow-action="generate-intelligence">Generar propuesta revisable</button>${vm.ageYears==null?'<p class="m26-notice is-warning">No hay fecha de nacimiento confirmada. La propuesta podrá generarse, pero no aplicará baremos dependientes de la edad.</p>':''}${workflowStatus('intelligence')}<div data-intelligence-preview></div></form>`:'';
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Motor IBERFIT</p><h2>Inteligencia con criterio</h2><p>Usa adherencia, recuperación y carga histórica. Nunca publica ni progresa cargas automáticamente.</p></div>${badge(vm.alerts.some((x)=>x.severity==='critical')?'Revisión requerida':'Contexto disponible',vm.alerts.some((x)=>x.severity==='critical')?'danger':'success')}</section>${form}<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Historial</p><h2>Propuestas confirmadas</h2></div></div>${recordList(vm.runs,'Sin propuestas remotas')}</section></div>`;
}
export function renderLibraryRoute(vm){
  const groups=renderExerciseLibraryGroups(vm.catalog,vm.mediaMap,{role:vm.role||'coach'});
  const credit=vm.mediaMap?renderExerciseMediaCredit():'';
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Biblioteca visual</p><h2>Ejercicios IBERFIT</h2><p>Organizados por musculatura principal, con indicaciones y referencias visuales validadas. El catálogo sigue siendo la fuente canónica y no admite escritura libre en las sesiones.</p></div>${badge(`${vm.total} ejercicios`,'neutral')}</section><section class="m26-panel"><div class="m26-library-controls"><label>Buscar ejercicio<input type="search" data-library-search autocomplete="off" spellcheck="false" aria-describedby="m26-library-status"></label><label>Material<select data-library-filter="equipment"><option value="">Todo</option><option value="sin material">Sin material</option><option value="trx">TRX</option><option value="mancuerna">Mancuernas</option><option value="banda">Bandas</option><option value="máquina">Máquina</option></select></label><label>Patrón<select data-library-filter="pattern"><option value="">Todos</option><option value="sentadilla">Sentadilla</option><option value="empuje">Empuje</option><option value="tracción">Tracción</option><option value="bisagra">Bisagra</option><option value="core">Core</option></select></label><label>Referencia visual<select data-library-filter="visual"><option value="">Todas</option><option value="with-image">Con imagen validada</option><option value="without-image">Sin imagen</option></select></label><button type="button" data-library-clear>Limpiar filtros</button></div><div class="m26-library-groups" data-library-grid>${groups||emptyState('Biblioteca no cargada','No se pudo leer el catálogo local.')}</div><p id="m26-library-status" data-library-status role="status" aria-live="polite">Mostrando los ${vm.total} ejercicios del catálogo, agrupados por musculatura principal. Escribe para filtrar.</p>${credit}</section></div>`;
}

function renderRouteContent(vm) {
  const admin=renderAdminRoute(vm);
  if(admin!==null)return admin;
  const communication=renderCommunicationRoute(vm);
  if(communication!==null)return communication;
  const rc39=renderRc39Route(vm);
  if(rc39!==null)return rc39;
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
  return `<section class="m26-route-placeholder"><p class="m26-eyebrow">${escapeHtml(vm.title || 'IBERFIT')}</p><h2>${escapeHtml(vm.title || 'Módulo')}</h2><p>Esta sección no está disponible. Vuelve al menú principal.</p></section>`;
}
/* M26_CLIENT_BOTTOM_NAV_V2 */
const CLIENT_BOTTOM_NAV_ITEMS = Object.freeze([
  {key:'hoy',label:'Hoy',area:'hoy',activeKinds:['hoy']},
  {key:'planificacion',label:'Planificación',area:'planificacion',activeKinds:['planificacion','agenda']},
  {key:'sesiones',label:'Sesiones',area:'sesion',activeKinds:['sesion']},
  {key:'progreso',label:'Progreso',area:'progreso',activeKinds:['progreso','iri','informes']},
]);
const CLIENT_BOTTOM_NAV_MORE_KINDS = Object.freeze(['expediente','actividad','biblioteca','verificacion']);

function clientBottomNavIcon(name){
  const icons={
    hoy:`<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M20.7 5.4a10.8 10.8 0 1 0 5.9 16.8A11.8 11.8 0 0 1 20.7 5.4Z"/><path d="M25.8 5.5v3.2M24.2 7.1h3.2M7.4 7.6 5.8 5.9M5.6 17.4H2.9M9.6 3.2 8.7.8"/></svg>`,
    planificacion:`<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="m5.2 6.2 20.9 20.9M26.8 5.8 5.9 26.7"/><circle cx="5.2" cy="6.2" r="2.1"/><circle cx="26.8" cy="5.8" r="2.1"/><circle cx="5.9" cy="26.7" r="2.1"/><circle cx="26.1" cy="27.1" r="2.1"/><path d="m13.6 11.9 2.6-2.6 2.5 2.5-2.6 2.6M13.5 20.2l2.6-2.6 2.5 2.5-2.6 2.6"/></svg>`,
    sesiones:`<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="20.8" cy="5.7" r="2.8"/><path d="m18.7 10.1-4.8 5.1-6.2-1.4M18.2 11.1l4 5.4 4.9-3.2M16.1 15.2l-2 6.3-5.6 5.1M19 16.4l-1.1 6.1 5.5 4.1M4.2 27.1h23.6M5.8 8.6h6.5"/><path d="M7.2 8.6v4.7M10.8 8.6v5.5"/></svg>`,
    progreso:`<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M4.5 25.8 12 18.2l5.1 4.3L27.4 9.2"/><path d="M21.7 9.2h5.7v5.7"/><path d="M4.5 28.1h23"/></svg>`,
    mas:`<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="7" cy="16" r="2.3" fill="currentColor" stroke="none"/><circle cx="16" cy="9" r="2.3" fill="currentColor" stroke="none"/><circle cx="16" cy="23" r="2.3" fill="currentColor" stroke="none"/><circle cx="25" cy="16" r="2.3" fill="currentColor" stroke="none"/><path d="M29 7.2v4M27 9.2h4"/></svg>`,
  };
  return icons[name]||icons.mas;
}

function clientBottomNavItem(item,currentKind){
  const active=item.activeKinds.includes(currentKind);
  return `<button type="button" class="m26-client-bottom-nav-item${active?' is-active':''}" data-m26-area="${escapeHtml(item.area)}"${active?' aria-current="page"':''}><span class="m26-client-bottom-nav-icon">${clientBottomNavIcon(item.key)}</span><span class="m26-client-bottom-nav-label">${escapeHtml(item.label)}</span></button>`;
}

function clientBottomNavMore(currentKind){
  const active=CLIENT_BOTTOM_NAV_MORE_KINDS.includes(currentKind);
  return `<details class="m26-client-bottom-nav-more${active?' is-active':''}"><summary class="m26-client-bottom-nav-item${active?' is-active':''}"${active?' aria-current="page"':''}><span class="m26-client-bottom-nav-icon">${clientBottomNavIcon('mas')}</span><span class="m26-client-bottom-nav-label">Más</span><span class="m26-client-bottom-nav-spark" aria-hidden="true">✦</span></summary><div class="m26-client-bottom-nav-menu" role="menu" aria-label="Más opciones"><button type="button" role="menuitem" data-m26-area="expediente"><span>Mi expediente</span><small>Datos y contexto personal</small></button><button type="button" role="menuitem" data-m26-area="actividad"><span>Bienestar y hábitos</span><small>Registros y dispositivos</small></button><button type="button" role="menuitem" data-m26-area="biblioteca"><span>Biblioteca</span><small>Ejercicios IBERFIT</small></button><button type="button" role="menuitem" data-m26-area="verificacion"><span>Sincronización</span><small>Estado de tus cambios</small></button></div></details>`;
}



function renderClientBottomNav(vm){
  const currentKind=String(vm?.kind||'hoy');
  return `<div class="m26-client-bottom-nav-layer"><nav class="m26-client-bottom-nav" aria-label="Navegación principal de la aplicación cliente">${CLIENT_BOTTOM_NAV_ITEMS.map((item)=>clientBottomNavItem(item,currentKind)).join('')}${clientBottomNavMore(currentKind)}</nav></div>`;
}

function renderClientRouteShell(vm,content){
  return `<div class="m26-client-route-shell" data-client-bottom-nav-route="${escapeHtml(vm?.kind||'hoy')}">${content}${renderClientBottomNav(vm)}</div>`;
}

export function renderRouteView(vm) {
  const content=renderRouteContent(vm);
  return vm.role==='client'?renderClientRouteShell(vm,content):content;
}
