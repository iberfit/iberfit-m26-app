import {renderCommunicationRoute} from '../communication/route-render.js';
import {buildCoachFollowUpPlan} from '../engagement/adherence-engine.js';
import {renderAdminRoute} from '../admin/route-render.js';
import {renderRc39Route} from '../rc39/route-render.js';
import {IBERFIT_UI_LOCALE,castilianEntityLabel,castilianOperationDetail,castilianPlatformLabel,castilianSourceLabel,castilianStatusLabel} from '../ui/castellano.js';
import {formatIberfitDate} from '../domain/civil-date.js';
import {renderExerciseLibraryGroups,renderExerciseMediaCredit} from '../library/exercise-media-ui.js';
import {iriProtocolsForStep} from '../workflows/iri-protocol-catalog.js';
import {renderLongitudinalDataExperience,renderDataTrustStrip,wearableSummaryTrust,wearableRecordTrust} from '../data-experience/index.js';
import {renderGuidanceTrigger} from '../guidance/contextual-guidance.js';
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
function appointmentCard(item,{canManage=false,canStartSession=false}={}) {
  const detail=[item.modality,item.location]
    .filter(Boolean)
    .filter((value,index,list)=>list.indexOf(value)===index)
    .join(' · ');
  const confirmable=canManage&&['propuesta','pendiente'].includes(String(item.statusRaw||'').toLowerCase());
  const startable=
    canStartSession&&
    Boolean(item.sessionId)&&
    String(item.statusRaw||'').toLowerCase()==='confirmada';

  const controls=confirmable
    ? `<div class="m26-list-card-actions"><button type="button" class="m26-primary-action" data-workflow-action="confirm-appointment" data-entity-id="${escapeHtml(item.id)}">Confirmar cita</button><small>Al confirmar será visible para el cliente.</small></div>`
    : startable
      ? `<div class="m26-list-card-actions"><button type="button" class="m26-primary-action" data-workflow-action="start-published-session" data-entity-id="${escapeHtml(item.sessionId)}">Iniciar entrenamiento</button><small>Abre la sesión publicada vinculada a esta cita.</small></div>`
      : '';
  return `<article class="m26-list-card m26-appointment-card"><div><p class="m26-eyebrow">${escapeHtml(item.dateLabel)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(detail||'Modalidad pendiente de definir')}</p></div><div class="m26-appointment-state">${badge(item.status,/confirm|realiz|complet/i.test(item.status)?'success':'neutral')}${controls}</div></article>`;
}
function clientIriState(client={}) {
  if (client.iri?.confirmed || client.iri?.status === 'Completada') return 'completed';
  if (Number(client.iri?.coverageCount || 0) > 0) return 'progress';
  return 'pending';
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
  const nextStep = client.nextAction?.label || 'Revisar seguimiento';
  const experienceLabel =
    client.experience?.stageLabel ||
    'Seguimiento por revisar';
  const experiencePriority =
    Number(client.experience?.priority || 5);
  const experienceStage =
    String(client.experience?.stage || 'active');
  const searchable = foldSearch(
    [
      client.name,
      client.modality,
      statusText,
      accessText,
      iri,
      objective,
      frequency,
      experienceLabel,
      client.profile?.email,
      client.profile?.phone,
    ]
      .filter(Boolean)
      .join(' ')
  );
  const accessTone = client.accessKnown ? 'success' : 'neutral';

  return `<article class="m26-client-card${selected ? ' is-selected' : ''}" data-client-text="${escapeHtml(searchable)}" data-client-iri="${iriState}" data-client-modality="${escapeHtml(foldSearch(client.modality))}" data-client-name="${escapeHtml(foldSearch(client.name))}" data-client-priority="${escapeHtml(experiencePriority)}" data-client-stage="${escapeHtml(experienceStage)}">
    <button type="button" data-m26-select-client="${escapeHtml(client.id)}" aria-label="Abrir expediente de ${escapeHtml(client.name)}">
      <div class="m26-client-avatar" aria-hidden="true">${escapeHtml(client.name.slice(0, 1).toUpperCase())}</div>
      <div class="m26-client-copy"><p class="m26-eyebrow">${escapeHtml(client.modality)}</p><h3>${escapeHtml(client.name)}</h3><p>${escapeHtml(iri)} · ${escapeHtml(frequency)}</p><small>${escapeHtml(objective)}</small><strong class="m26-client-next">Siguiente: ${escapeHtml(nextStep)}</strong></div>
      <div class="m26-client-meta">${selected ? badge('Expediente activo', 'success') : ''}${badge(experienceLabel, experienceStage === 'active' ? 'success' : 'pending')}${badge(statusText, /activ/i.test(statusText) ? 'success' : 'neutral')}${badge(accessText, accessTone)}<small>${client.nextAppointment ? `Próxima cita: ${escapeHtml(client.nextAppointment.dateLabel)}` : 'Sin cita programada'}</small><span class="m26-card-action">Abrir expediente</span></div>
    </button>
  </article>`;
}

function coachPriorityCard(item={}) {
  const tone=
    item.kind==='critical'
      ?'danger'
      :item.kind==='warning'
        ?'warning'
        :item.kind==='process'
          ?'pending'
          :'neutral';

  return `<article class="m26-list-card m26-coach-priority-card">
    <div>
      <p class="m26-eyebrow">${escapeHtml(item.stageLabel||'Seguimiento')}</p>
      <h3>${escapeHtml(item.clientName||'Cliente')}</h3>
      <p><strong>${escapeHtml(item.reason||'Revisión pendiente')}</strong></p>
      <small>${escapeHtml(item.detail||'')}</small>
      <strong class="m26-client-next">${escapeHtml(item.guidance||'Revisar expediente.')}</strong>
    </div>
    <div class="m26-list-card-actions">
      ${badge(item.signalLabel||'Seguimiento',tone)}
      <button
        type="button"
        class="m26-text-action"
        data-m26-select-client="${escapeHtml(item.clientId||'')}"
        aria-label="Abrir expediente de ${escapeHtml(item.clientName||'cliente')}"
      >Abrir expediente</button>
    </div>
  </article>`;
}

export function renderHoyRoute(vm) {
  const isClient = vm.role === 'client';
  const client = vm.clients[0] || null;
  const proposalCount = vm.proposals?.length || 0;
  const cockpit =
    !isClient
      ? vm.coachCockpit || null
      : null;
  const heroTitle = isClient
    ? `Tu acompañamiento, ${escapeHtml(client?.name || 'IBERFIT')}`
    : 'Prioridades de hoy';
  const heroCopy = isClient
    ? 'Consulta lo que tienes preparado, registra cómo estás y continúa desde una única ruta clara.'
    : 'Primero las decisiones que requieren una acción; después, el resto del seguimiento.';
  const appointments = vm.appointments.length
    ? vm.appointments.map((item)=>appointmentCard(item,{canStartSession:isClient})).join('')
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
  const queueItems=
    cockpit?.items?.slice(0,6)||[];

  const queueTone=
    cockpit?.criticalCount
      ?'danger'
      :cockpit?.warningCount
        ?'warning'
        :cockpit?.processCount
          ?'pending'
          :'neutral';

  const queueLabel=
    cockpit?.attentionCount
      ?countLabel(
          cockpit.attentionCount,
          'prioridad',
          'prioridades'
        )
      :cockpit?.infoCount
        ?countLabel(
            cockpit.infoCount,
            'seguimiento',
            'seguimientos'
          )
        :'Al día';

  const priorityQueue=
    !isClient&&cockpit
      ?`<section class="m26-panel m26-panel-soft">
          <div class="m26-panel-heading">
            <div>
              <p class="m26-eyebrow">Atención de cartera</p>
              <h2>Qué requiere tu decisión</h2>
              <p>Ordenado por bienestar, adherencia y etapa del recorrido. Estas señales orientan la revisión y no sustituyen tu criterio profesional.</p>
            </div>
            ${badge(queueLabel,queueTone)}
          </div>
          ${
            cockpit.totalClients===0
              ?emptyState(
                  'Sin clientes asignados',
                  'Cuando la administración te asigne clientes, su seguimiento aparecerá aquí.'
                )
              :queueItems.length
                ?`<div class="m26-stack">${queueItems.map(coachPriorityCard).join('')}</div>`
                :emptyState(
                    'Cartera al día',
                    'No hay señales ni pasos pendientes que requieran atención adicional.'
                  )
          }
          ${
            cockpit.items?.length>6
              ?`<button type="button" class="m26-text-action" data-m26-area="clientes">Ver toda la cartera</button>`
              :''
          }
        </section>`
      :'';

  const coachRiskFocus=
    !isClient
      ?cockpit?.riskFocus||null
      :null;

  const next = vm.upcoming[0];
  const operationalState = vm.operations.conflicts
    ? 'Requiere revisión'
    : vm.operations.pending
      ? 'Sincronizando cambios'
      : cockpit?.criticalCount
        ? 'Atención prioritaria'
        : cockpit?.warningCount
          ? 'Requiere contexto'
          : proposalCount
            ? 'Propuestas por revisar'
            : cockpit?.processCount
              ? 'Seguimiento pendiente'
              : 'Al día';
  const iriDetail = client?.iri
    ? `<div class="m26-mini-metric"><span>Evaluación IRI</span><strong>${escapeHtml(client.iri.processLabel || client.iri.coverageLabel)}</strong><small>${escapeHtml(client.iri.coverageLabel)}</small></div>`
    : '';
  const nextAction = isClient
    ? client?.nextAction
      ? {
          area: client.nextAction.area,
          title: client.adaptiveExperience?.label || client.experience?.stageLabel || 'Tu siguiente paso',
          copy: client.nextAction.reason || 'Continúa con tu recorrido IBERFIT.',
          label: client.nextAction.label,
        }
      : {
          area: 'actividad',
          title: 'Tu siguiente paso',
          copy: 'Registra cómo estás para mantener actualizado tu seguimiento.',
          label: 'Registrar bienestar',
        }
    : coachRiskFocus
      ? {
          area: 'expediente',
          clientId: coachRiskFocus.clientId,
          title: coachRiskFocus.clientName,
          copy: `${coachRiskFocus.signalLabel}: ${coachRiskFocus.reason}. ${coachRiskFocus.detail}`,
          label: 'Abrir expediente',
        }
      : next
      ? {
          area: 'agenda',
          title: next.title,
          copy: next.dateLabel,
          label: 'Abrir agenda',
        }
      : proposalCount
        ? {
            area: 'agenda',
            title: 'Revisar propuestas pendientes',
            copy: 'Confirma, modifica o descarta cada propuesta.',
            label: 'Revisar agenda',
          }
        : client?.nextAction
          ? {
              area: client.nextAction.area,
              title: client.nextAction.label,
              copy: client.nextAction.reason || client.experience?.stageLabel || 'Seguimiento pendiente.',
              label: client.nextAction.label,
            }
          : {
              area: 'clientes',
              title: 'Revisar cartera de clientes',
              copy: 'Abre un expediente para decidir el siguiente paso.',
              label: 'Ver clientes',
            };

  const nextActionButton=
    nextAction.clientId
      ?`<button type="button" class="m26-primary-action" data-m26-select-client="${escapeHtml(nextAction.clientId)}">${escapeHtml(nextAction.label)}</button>`
      :`<button type="button" class="m26-primary-action" data-m26-area="${escapeHtml(nextAction.area)}">${escapeHtml(nextAction.label)}</button>`;

  const stats = [
    stat('Sesiones confirmadas hoy', vm.appointments.length, vm.appointments.length ? 'Listas para realizar' : 'No hay sesiones hoy'),
    next ? stat('Próxima cita confirmada', next.dateLabel, next.title) : stat('Próxima cita confirmada', 'Sin cita programada', isClient ? 'Tu entrenador confirmará aquí la siguiente cita' : 'Programa o confirma la siguiente cita'),
  ];
  if (isClient) {
    stats.push(stat('Tu plan', client?.cycle?.name || 'Pendiente', client?.cycle ? 'Plan confirmado disponible' : 'Tu entrenador lo publicará cuando esté listo'));
    stats.push(stat('Evaluación IRI', client?.iri?.processLabel || 'Pendiente', client?.iri?.confirmed ? client.iri.coverageLabel : 'La completa y confirma tu entrenador'));
  }
  if (!isClient && cockpit) {
    stats.push(
      stat(
        'Clientes que requieren atención',
        cockpit.attentionCount,
        cockpit.attentionCount
          ? 'Ordenados por prioridad operativa'
          : 'Sin revisiones prioritarias pendientes'
      )
    );

    stats.push(
      stat(
        'Cartera visible',
        cockpit.totalClients,
        cockpit.totalClients
          ? 'Solo clientes dentro de tu cartera'
          : 'Sin clientes asignados'
      )
    );
  }

  if (!isClient && proposalCount) stats.push(stat('Propuestas pendientes', proposalCount, 'Requieren una decisión'));
  if (vm.operations.conflicts) stats.push(stat('Conflictos por resolver', vm.operations.conflicts, 'Resolver antes de continuar'));
  const clientShortcuts = isClient
    ? `<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Accesos rápidos</p><h2>Tu ruta IBERFIT</h2><p>Solo se muestra contenido confirmado para ti.</p></div></div><div class="m26-action-grid"><button type="button" data-m26-area="actividad">Registrar bienestar</button><button type="button" data-m26-area="planificacion">Ver planificación</button><button type="button" data-m26-area="sesion">Abrir sesiones</button><button type="button" data-m26-area="progreso">Revisar progreso</button><button type="button" data-m26-area="informes">Consultar informes</button></div></section>`
    : '';

    const rc70DailyLoop = isClient
    ? `<section class="m26-today-loop" aria-labelledby="m26-today-loop-title">
        <div class="m26-panel-heading">
          <div>
            <p class="m26-eyebrow">Tu recorrido</p>
            <h2 id="m26-today-loop-title">Qué hacer hoy</h2>
          </div>
          ${badge('Tres pasos', 'neutral')}
        </div>
        <div class="m26-today-action-grid">
          <button type="button" class="m26-today-action is-primary" data-m26-area="sesion">
            <span>1</span>
            <strong>Entrenar</strong>
            <small>Abre tus sesiones y continúa desde la acción publicada disponible.</small>
          </button>
          <button type="button" class="m26-today-action" data-m26-area="actividad">
            <span>2</span>
            <strong>Registrar cómo estoy</strong>
            <small>Energía, sueño, estrés, dolor y hábitos.</small>
          </button>
          <button type="button" class="m26-today-action" data-m26-area="progreso">
            <span>3</span>
            <strong>Ver mi evolución</strong>
            <small>Adherencia, progreso y tendencias confirmadas.</small>
          </button>
        </div>
      </section>`
    : `<section class="m26-today-loop" aria-labelledby="m26-today-loop-title">
        <div class="m26-panel-heading">
          <div>
            <p class="m26-eyebrow">Control operativo</p>
            <h2 id="m26-today-loop-title">Siguiente decisión</h2>
          </div>
          ${badge(vm.operations.conflicts ? 'Requiere revisión' : 'Operación protegida', vm.operations.conflicts ? 'danger' : 'neutral')}
        </div>
        <div class="m26-today-action-grid">
          <button type="button" class="m26-today-action is-primary" data-m26-area="agenda">
            <span>1</span>
            <strong>Gestionar agenda</strong>
            <small>${vm.appointments.length ? `${vm.appointments.length} sesión${vm.appointments.length === 1 ? '' : 'es'} hoy.` : 'Sin sesiones pendientes hoy.'}</small>
          </button>
          <button type="button" class="m26-today-action" data-m26-area="clientes">
            <span>2</span>
            <strong>Revisar clientes</strong>
            <small>${vm.clients.length} expediente${vm.clients.length === 1 ? '' : 's'} dentro de tu alcance.</small>
          </button>
          <button type="button" class="m26-today-action" data-m26-area="verificacion">
            <span>3</span>
            <strong>Verificar operaciones</strong>
            <small>Revisa únicamente cambios que necesiten confirmación.</small>
          </button>
        </div>
      </section>`;
  return `<div class="m26-route m26-hoy-route">
    ${operationBanner(vm.operations)}
    ${rc70DailyLoop}
    <section class="m26-hero-panel"><div><p class="m26-eyebrow">IBERFIT · Hoy</p><h2>${heroTitle}</h2><p>${heroCopy}</p></div><div class="m26-hero-signal"><span>Estado operativo</span><strong>${operationalState}</strong></div></section>
    <section class="m26-stat-grid">${stats.join('')}</section>
    <section class="m26-content-grid">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Agenda</p><h2>Sesiones confirmadas de hoy</h2></div>${vm.appointments.length ? badge(countLabel(vm.appointments.length, 'confirmada', 'confirmadas'), 'success') : ''}</div><div class="m26-stack">${appointments}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Siguiente acción</p><h2>${escapeHtml(nextAction.title)}</h2><p>${escapeHtml(nextAction.copy)}</p>${iriDetail}${nextActionButton}</aside>
    </section>
    ${priorityQueue}
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
  /* RC70_1_1_FOLLOWUP_QUEUE_BEGIN */
  const followUpRows=vm.clients
    .filter((item)=>item.followUp)
    .slice()
    .sort((a,b)=>{
      const priority={critical:0,warning:1,info:2,clear:3};
      return (priority[a.followUp?.signal?.level]??4)-(priority[b.followUp?.signal?.level]??4);
    });
  const followUpCounts=followUpRows.reduce((acc,item)=>{
    const level=item.followUp?.signal?.level||'clear';
    acc[level]=(acc[level]||0)+1;
    return acc;
  },{critical:0,warning:0,info:0,clear:0});
  const followUpQueue=followUpRows.length
    ? `<section class="m26-followup-panel" aria-labelledby="m26-followup-title">
        <div class="m26-panel-heading">
          <div>
            <p class="m26-eyebrow">Seguimiento inteligente</p>
            <h2 id="m26-followup-title">Prioridad de acompañamiento</h2>
            <p>Señales deterministas basadas en registros confirmados. El entrenador decide la intervención.</p>
          </div>
          ${badge(`${followUpRows.length} cliente${followUpRows.length===1?'':'s'}`,'neutral')}
        </div>
        <div class="m26-followup-summary" role="list" aria-label="Resumen de seguimiento">
          <div role="listitem"><span>Prioritaria</span><strong>${followUpCounts.critical}</strong></div>
          <div role="listitem"><span>Requiere contexto</span><strong>${followUpCounts.warning}</strong></div>
          <div role="listitem"><span>Seguimiento activo</span><strong>${followUpCounts.info}</strong></div>
          <div role="listitem"><span>Sin alertas</span><strong>${followUpCounts.clear}</strong></div>
        </div>
        <div class="m26-followup-list">
          ${followUpRows.map((item)=>{
            const follow=item.followUp;
            const level=follow.signal?.level||'clear';
            const kind=level==='critical'?'danger':level==='warning'?'warning':level==='clear'?'success':'neutral';
            const adherence=Number.isFinite(follow.adherence)?`${Math.round(follow.adherence*100)}% adherencia`:'Adherencia sin dato';
            const reason=follow.topAlert?.title||(
              follow.plannedSessions>0
                ? `${follow.completedSessions} de ${follow.plannedSessions} sesiones completadas`
                : 'Sin sesiones planificadas en la ventana'
            );
            return `<button type="button" class="m26-followup-row is-${escapeHtml(level)}" data-m26-select-client="${escapeHtml(item.id)}" aria-label="Abrir seguimiento de ${escapeHtml(item.name)}">
              <div class="m26-followup-person">
                <span class="m26-client-avatar" aria-hidden="true">${escapeHtml(item.name.slice(0,1).toUpperCase())}</span>
                <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.modality)} · ${escapeHtml(adherence)}</small></span>
              </div>
              <div class="m26-followup-context">
                ${badge(follow.signal?.label||'Seguimiento',kind)}
                <small>${escapeHtml(reason)}</small>
              </div>
            </button>`;
          }).join('')}
        </div>
      </section>`
    : '';
  /* RC70_1_1_FOLLOWUP_QUEUE_END */
  const content = vm.clients.length
    ? `<div class="m26-client-grid" data-client-grid>${vm.clients.map((item) => clientCard(item, item.id === vm.selectedClientId)).join('')}</div>`
    : emptyState('Todavía no hay clientes', 'Crea el primer expediente para comenzar la evaluación inicial.');
  const productivity=['coach','admin'].includes(String(vm.role||''))
    ? `<section class="m26-coach-productivity-toolbar" data-coach-productivity-toolbar><div><p class="m26-eyebrow">Productividad Coach</p><h3>Vistas y recientes</h3><p>Guarda combinaciones de búsqueda y filtros en este dispositivo. No se guardan datos de salud.</p></div><div class="m26-coach-productivity-controls"><label>Nombre de la vista<input data-coach-view-name maxlength="60" placeholder="Ej. Seguimiento activo"></label><label>Vistas guardadas<select data-coach-saved-view><option value="">Seleccionar vista…</option></select></label><button type="button" data-coach-save-view>Guardar vista actual</button><button type="button" data-coach-delete-view>Eliminar vista</button></div><div class="m26-coach-recents" data-coach-recents><span>Recientes</span><small>Aparecerán al abrir expedientes.</small></div><p class="m26-coach-productivity-status" data-coach-productivity-status role="status" aria-live="polite"></p></section>`
    : '';
  return `<div class="m26-route">${followUpQueue}<section class="m26-route-intro"><div><p class="m26-eyebrow">Seguimiento de clientes</p><h2>Clientes y próximos pasos</h2><p>Abre un expediente, identifica la prioridad y continúa desde una única ruta de trabajo.</p></div>${badge(`${vm.clients.length} cliente${vm.clients.length === 1 ? '' : 's'}`, 'neutral')}</section>${vm.canCreate ? clientOnboardingForm() : ''}<section class="m26-panel"><div class="m26-client-controls"><label>Buscar cliente<input type="search" data-client-search autocomplete="off" spellcheck="false" aria-describedby="m26-client-search-status" placeholder="Nombre, objetivo, modalidad, etapa o estado"></label><label>Estado del IRI<select data-client-filter="iri"><option value="">Todos</option><option value="pending">No iniciado</option><option value="progress">En progreso</option><option value="completed">Completado</option></select></label><label>Modalidad<select data-client-filter="modality"><option value="">Todas</option><option value="presencial">Presencial</option><option value="hibrid">Híbrida</option><option value="online">Online</option></select></label><label>Etapa del seguimiento<select data-client-filter="stage"><option value="">Todas</option><option value="onboarding">Alta incompleta</option><option value="evaluation">Evaluación pendiente</option><option value="planning">Planificación pendiente</option><option value="scheduling">Próxima cita pendiente</option><option value="active">Seguimiento activo</option></select></label><label>Ordenar<select data-client-sort><option value="priority">Prioridad operativa</option><option value="name">Nombre</option></select></label><button type="button" data-client-clear>Limpiar filtros</button></div>${productivity}<p id="m26-client-search-status" data-client-search-status role="status" aria-live="polite">Mostrando ${countLabel(vm.clients.length, 'cliente', 'clientes')}.</p>${content}</section></div>`;
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

function exerciseMemorySetCopy(set){
  const parts=[];

  if(set?.load?.raw){
    parts.push(set.load.raw);
  }

  if(Number.isFinite(set?.reps)){
    parts.push(
      `${set.reps} rep${set.reps===1?'':'s'}`,
    );
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

function exerciseMemoryFacts(memory){
  return memory?.facts||memory||{};
}

function exerciseMemoryAssessment(memory){
  return memory?.coachAssessment||null;
}

function exerciseMemoryMetricLabel(metricKey){
  return {
    load:'Carga comparable',
    repsPerSet:'Repeticiones por serie',
    secondsPerSet:'Segundos por serie',
    averageRpe:'RPE medio',
    averageRir:'RIR medio',
    volumeKg:'Volumen confirmado',
  }[metricKey]||'Métrica confirmada';
}

function exerciseMemoryVisual(memory){
  const facts=exerciseMemoryFacts(memory);
  const assessment=exerciseMemoryAssessment(memory);
  const metrics=facts?.trend?.metrics||{};

  const causalMetric=
    assessment?.causalMetric||
    null;

  const factualFallback=
    !assessment
      ?facts?.trend?.primaryMetric||null
      :null;

  const metricKey=
    causalMetric||
    factualFallback;

  const metric=
    metricKey
      ?metrics?.[metricKey]||null
      :null;

  const hasCausalMetric=
    Boolean(
      assessment&&
      causalMetric&&
      metric?.comparable,
    );

  const assessmentVisible=
    Boolean(
      assessment&&
      (
        assessment.status==='stable'||
        assessment.status==='indeterminate'||
        hasCausalMetric
      ),
    );

  const status=
    assessmentVisible
      ?assessment.status
      :'indeterminate';

  const label=
    assessmentVisible
      ?`${assessment.label} ${assessment.symbol}`
      :assessment
        ?'Sin conclusión ·'
        :'Evolución registrada ·';

  const basis=
    assessmentVisible
      ?assessment.basis
      :assessment
        ?'La clasificación existe, pero no dispone de una métrica causal visualizable con suficiente seguridad.'
        :'Vista factual de datos confirmados; no incluye interpretación profesional.';

  const tone=
    status==='progress'&&
    assessment?.colorEligible&&
    hasCausalMetric
      ?'positive'
      :status==='regression'&&
        assessment?.colorEligible&&
        hasCausalMetric
        ?'negative'
        :status==='stable'
          ?'stable'
          :'neutral';

  return Object.freeze({
    facts,
    assessment,
    causalMetric,
    metricKey,
    metric,
    hasCausalMetric,
    status,
    label,
    basis,
    tone,
  });
}

function exerciseMemoryToneColor(tone){
  return {
    positive:'#1f6a4a',
    negative:'#9d3b3b',
    stable:'#9a7a32',
    neutral:'#6f7772',
  }[tone]||'#6f7772';
}

function exerciseMemoryBadgeTone(tone){
  return tone==='positive'
    ?'success'
    :tone==='negative'
      ?'danger'
      :'neutral';
}

function exerciseMemoryDeltaCopy(memory){
  const visual=exerciseMemoryVisual(memory);
  const metric=visual.metric;

  if(
    !metric||
    !metric.comparable||
    !Number.isFinite(metric.absoluteDelta)
  ){
    return 'Sin dos referencias comparables para esta métrica';
  }

  const sign=
    metric.absoluteDelta>0
      ?'+'
      :'';

  const unit=
    metric.unit
      ?` ${metric.unit}`
      :'';

  const percent=
    Number.isFinite(metric.percentageDelta)
      ?` · ${metric.percentageDelta>0?'+':''}${metric.percentageDelta}%`
      :'';

  return `Cambio vs anterior: ${sign}${metric.absoluteDelta}${unit}${percent}`;
}

function exerciseMemorySmoothPath(points){
  if(!Array.isArray(points)||points.length<2)return '';
  const parts=[`M ${points[0].x} ${points[0].y}`];
  for(let index=0;index<points.length-1;index+=1){
    const current=points[index];
    const next=points[index+1];
    const previous=points[index-1]||current;
    const after=points[index+2]||next;
    parts.push(`C ${current.x+(next.x-previous.x)/6} ${current.y+(next.y-previous.y)/6}, ${next.x-(after.x-current.x)/6} ${next.y-(after.y-current.y)/6}, ${next.x} ${next.y}`);
  }
  return parts.join(' ');
}
function exerciseMemoryChartPalette(tone){
  return {positive:'#2f8a63',negative:'#b44f52',stable:'#b08a38',neutral:'#68746e'}[tone]||'#68746e';
}
function exerciseMemorySparkline(memory){
  const visual=exerciseMemoryVisual(memory);
  const metric=visual.metric;
  const metricLabel=
    exerciseMemoryMetricLabel(
      visual.metricKey,
    );

  const source=(metric?.points||[])
    .map((point)=>({
      ...point,
      value:Number(point?.value),
    }))
    .filter(
      (point)=>
        Number.isFinite(point.value),
    );

  if(source.length<2){
    return `<section
      class="m26-exercise-chart-shell is-empty"
      data-m26-exercise-chart-shell="empty"
      data-m26-exercise-causal-metric="${escapeHtml(visual.metricKey||'none')}"
      data-m26-exercise-performance-status="${escapeHtml(visual.status)}"
    >
      <div class="m26-exercise-chart-title">
        <div>
          <p class="m26-eyebrow">Tendencia confirmada</p>
          <h4>${escapeHtml(metricLabel)}</h4>
        </div>
        <span>Sin conclusión ·</span>
      </div>

      <div class="m26-exercise-chart-empty">
        <strong>Falta otra referencia comparable</strong>
        <small>
          La evolución aparecerá cuando existan al menos dos registros confirmados.
        </small>
      </div>
    </section>`;
  }

  const chartPoints=
    source.map(
      (point,index)=>{
        const rawDate=String(
          point?.date
          ||point?.completedAt
          ||point?.observedAt
          ||'',
        ).trim();

        const dateMatch=
          rawDate.match(
            /^\d{4}-\d{2}-\d{2}/u,
          );

        const date=
          dateMatch?.[0]
          ||'';

        const label=
          date
          ||String(point?.label||'').trim()
          ||`Registro ${index+1}`;

        return date
          ?Object.freeze({
              date,
              value:point.value,
            })
          :Object.freeze({
              label,
              value:point.value,
            });
      },
    );

  const first=source[0];
  const latest=source[source.length-1];

  const unit=
    metric?.unit
      ?` ${metric.unit}`
      :'';

  const delta=Number(
    metric?.absoluteDelta,
  );

  const percent=Number(
    metric?.percentageDelta,
  );

  const deltaText=
    Number.isFinite(delta)
      ?`${delta>0?'+':''}${delta}${unit}${
          Number.isFinite(percent)
            ?` · ${percent>0?'+':''}${percent}%`
            :''
        }`
      :'Sin cambio calculable';

  const payload=
    escapeHtml(
      JSON.stringify(chartPoints),
    );

  const aria=
    `${visual.label}. ${metricLabel}. ${deltaText}`;

  const rows=
    chartPoints
      .map(
        (point,index)=>
          `<tr>
            <td>${escapeHtml(point.date||point.label||`Registro ${index+1}`)}</td>
            <td>${escapeHtml(`${source[index].value}${unit}`)}</td>
          </tr>`,
      )
      .join('');

  return `<section
    class="m26-exercise-chart-shell is-${escapeHtml(visual.tone)}"
    data-m26-exercise-chart-shell="echarts-v1"
    data-m26-exercise-causal-metric="${escapeHtml(visual.metricKey||'none')}"
    data-m26-exercise-performance-status="${escapeHtml(visual.status)}"
  >
    <div class="m26-exercise-chart-title">
      <div>
        <p class="m26-eyebrow">Tendencia confirmada</p>
        <h4>${escapeHtml(metricLabel)}</h4>
      </div>
      <span>${escapeHtml(visual.label)}</span>
    </div>

    <div class="m26-exercise-chart-kpis">
      <div>
        <small>Actual</small>
        <strong>${escapeHtml(`${latest.value}${unit}`)}</strong>
      </div>

      <div>
        <small>Cambio</small>
        <strong>${escapeHtml(deltaText)}</strong>
      </div>

      <div>
        <small>Historial</small>
        <strong>${escapeHtml(source.length)} registros</strong>
      </div>
    </div>

    <figure
      class="m26-exercise-chart-figure"
      aria-label="${escapeHtml(aria)}"
    >
      <m26-echart
        class="m26-echart"
        data-density="compact"
        data-tone="${escapeHtml(visual.tone)}"
        data-label="${escapeHtml(metricLabel)}"
        data-unit="${escapeHtml(metric?.unit||'')}"
        data-points="${payload}"
        aria-label="${escapeHtml(aria)}"
      ></m26-echart>
    </figure>

    <div class="m26-exercise-chart-foot">
      <span>
        <small>Inicio comparable</small>
        <strong>${escapeHtml(`${first.value}${unit}`)}</strong>
      </span>

      <span>
        <small>Referencia actual</small>
        <strong>${escapeHtml(`${latest.value}${unit}`)}</strong>
      </span>
    </div>

    <details class="m26-data-fallback">
      <summary>Ver datos del gráfico</summary>
      <div class="m26-data-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Referencia</th>
              <th>${escapeHtml(metricLabel)}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
  </section>`;
}
function exerciseMemoryLoadRecord(facts){
  const points=
    facts?.trend?.metrics?.load?.points||
    [];

  const values=points
    .map((point)=>Number(point?.value))
    .filter(Number.isFinite);

  if(!values.length){
    return 'Sin récord de carga comparable';
  }

  const unit=
    facts?.trend?.metrics?.load?.unit||
    '';

  return `${Math.max(...values)}${unit?` ${unit}`:''}`;
}

function renderExerciseMemoryCard(memory){
  const visual=exerciseMemoryVisual(memory);
  const facts=visual.facts;
  const latest=facts?.latest;

  if(!latest){
    return '';
  }

  const name=
    memory.exerciseName||
    'Ejercicio registrado';

  const lastLoad=
    latest.lastLoad?.raw||
    (
      Number.isFinite(latest.lastLoad?.value)
        ?`${latest.lastLoad.value}${latest.lastLoad.unit?` ${latest.lastLoad.unit}`:''}`
        :'Sin carga registrada'
    );

  const latestSets=
    (latest.sets||[])
      .slice(0,4)
      .map(exerciseMemorySetCopy)
      .join(' · ');

  const rpe=
    Number.isFinite(latest.averageRpe)
      ?`RPE medio ${latest.averageRpe}`
      :'RPE sin dato';

  const rir=
    Number.isFinite(latest.averageRir)
      ?`RIR medio ${latest.averageRir}`
      :'RIR sin dato';

  const record=
    exerciseMemoryLoadRecord(facts);

  const interpretation=
    visual.assessment
      ?`<p class="m26-notice" data-m26-exercise-assessment="coach"><strong>${escapeHtml(visual.label)}</strong><br>${escapeHtml(visual.basis)}</p>`
      :`<p class="m26-notice"><strong>Datos confirmados</strong><br>${escapeHtml(visual.basis)}</p>`;

  return `<article
    class="m26-panel m26-panel-soft"
    data-m26-exercise-performance-card
    data-m26-exercise-performance-tone="${escapeHtml(visual.tone)}"
  >
    <div class="m26-panel-heading">
      <div>
        <p class="m26-eyebrow">Última referencia confirmada · ${escapeHtml(safeDateLabel(latest.completedAt))}</p>
        <h3>${escapeHtml(name)}</h3>
      </div>
      ${badge(visual.label,exerciseMemoryBadgeTone(visual.tone))}
    </div>
    <div class="m26-field-grid">
      <div class="m26-field">
        <span>Última carga</span>
        <strong>${escapeHtml(lastLoad)}</strong>
      </div>
      <div class="m26-field">
        <span>Esfuerzo</span>
        <strong>${escapeHtml(`${rpe} · ${rir}`)}</strong>
      </div>
      <div class="m26-field">
        <span>Máximo registrado</span>
        <strong>${escapeHtml(record)}</strong>
      </div>
      <div class="m26-field">
        <span>Exposiciones confirmadas</span>
        <strong>${escapeHtml(facts.exposureCount)}</strong>
      </div>
    </div>
    <p>${escapeHtml(latestSets||'Sin detalle de series disponible.')}</p>
    <p><strong>${escapeHtml(exerciseMemoryDeltaCopy(memory))}</strong></p>
    ${exerciseMemorySparkline(memory)}
    ${interpretation}
  </article>`;
}
function renderExercisePerformanceOverview(items=[]){
  const cards=
    items
      .slice(0,4)
      .map(renderExerciseMemoryCard)
      .filter(Boolean)
      .join('');

  const content=
    cards
      ?`<div class="m26-content-grid">${cards}</div>`
      :`<p class="m26-empty-copy">La memoria aparecerá cuando exista al menos una ejecución confirmada con detalle por ejercicio.</p>`;

  return `<section
    class="m26-panel"
    aria-label="Rendimiento por ejercicio"
    data-m26-expediente-section="resumen"
  >
    <div class="m26-panel-heading">
      <div>
        <p class="m26-eyebrow">Memoria longitudinal</p>
        <h2>Rendimiento por ejercicio</h2>
        <p>Últimas referencias confirmadas para recordar qué se hizo y cómo cambió con el tiempo.</p>
      </div>
    </div>

    ${content}

    <div class="m26-list-card-actions">
      <button
        type="button"
        data-m26-area="progreso"
       class="iberfit-button m26-primary-action m26-progress-empty-cta">Ver progreso completo</button>
      <small>Se muestran hechos comparables. El entrenador interpreta el contexto y decide.</small>
    </div>
  </section>`;
}
export /* RC70_2_EXERCISE_RENDER_BEGIN */
function exerciseProgressMetric(value,fallback='Sin dato'){
  return value===null||value===undefined||value===''
    ? fallback
    : String(value);
}

function exerciseProgressTrend(trend,label){
  if(!trend||trend.direction==='indeterminate'){
    return badge(`${label}: sin comparación`,'neutral');
  }

  const prefix=trend.direction==='up'
    ? '↑'
    : trend.direction==='down'
      ? '↓'
      : '=';

  return badge(
    `${label} ${prefix} ${trend.label}`,
    'neutral'
  );
}

function exerciseProgressSparkline(points,key){
  const values=points
    .map((point)=>Number(point?.[key]))
    .filter(Number.isFinite);

  if(values.length<2)return '';

  const min=Math.min(...values);
  const max=Math.max(...values);
  const span=max-min||1;

  const coords=values.map((value,index)=>{
    const x=values.length===1
      ? 50
      : (index/(values.length-1))*100;
    const y=34-((value-min)/span)*28;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `<svg class="m26-exercise-sparkline" viewBox="0 0 100 40" role="img" aria-label="Tendencia de carga conocida">
    <polyline points="${escapeHtml(coords)}" fill="none" vector-effect="non-scaling-stroke"></polyline>
  </svg>`;
}

function exercisePointLoad(point){
  if(Number.isFinite(point?.maxLoadKg)){
    return `${point.maxLoadKg} kg`;
  }

  const labels=Array.isArray(point?.loadLabels)
    ? point.loadLabels.filter(Boolean)
    : [];

  return labels.length
    ? labels.join(' · ')
    : 'Sin carga registrada';
}

function renderExerciseProgressSection(
  progress,
  {compact=false}={}
){
  if(!progress){
    return '';
  }

  const exercises=Array.isArray(progress.exercises)
    ? progress.exercises
    : [];

  if(!exercises.length){
    return `<section class="m26-panel m26-exercise-progress-panel">
      <div class="m26-panel-heading">
        <div>
          <p class="m26-eyebrow">IBERFIT · Evolución 360</p>
          <h2>Evolución por ejercicio</h2>
        </div>
      </div>
      ${emptyState(
        'Aún no hay series comparables',
        'Cuando existan ejecuciones completadas, aquí aparecerán carga, repeticiones, RPE/RIR, tiempo y volumen confirmado por ejercicio.'
      )}
    </section>`;
  }

  const visible=compact
    ? exercises.slice(0,6)
    : exercises;

  const rows=visible.map((exercise,index)=>{
    const latest=exercise.latest||{};
    const history=Array.isArray(exercise.history)
      ? exercise.history.slice().reverse()
      : [];

    const visibleHistory=compact
      ? history.slice(0,5)
      : history.slice(0,16);

    const loadSpark=exerciseProgressSparkline(
      exercise.history||[],
      'maxLoadKg'
    );

    const historyRows=visibleHistory.map((point)=>`
      <tr>
        <td>${escapeHtml(safeDateLabel(point.at))}</td>
        <td>${escapeHtml(exercisePointLoad(point))}</td>
        <td>${escapeHtml(exerciseProgressMetric(point.bestReps))}</td>
        <td>${escapeHtml(exerciseProgressMetric(point.totalSeconds))}</td>
        <td>${escapeHtml(exerciseProgressMetric(point.averageRpe))}</td>
        <td>${escapeHtml(exerciseProgressMetric(point.averageRir))}</td>
        <td>${escapeHtml(
          Number.isFinite(point.volumeKgReps)
            ? `${point.volumeKgReps} kg·rep`
            : 'Sin dato comparable'
        )}</td>
      </tr>
    `).join('');

    return `<details class="m26-exercise-progress-card"${index===0?' open':''}>
      <summary>
        <span>
          <strong>${escapeHtml(exercise.exerciseName)}</strong>
          <small>${exercise.sessions} sesión${exercise.sessions===1?'':'es'} · ${exercise.totalSets} serie${exercise.totalSets===1?'':'s'} · dato ${escapeHtml(exercise.dataQuality)}</small>
        </span>
        <span class="m26-exercise-progress-current">
          <strong>${escapeHtml(exercisePointLoad(latest))}</strong>
          <small>${escapeHtml(safeDateLabel(latest.at))}</small>
        </span>
      </summary>

      <div class="m26-exercise-progress-body">
        <div class="m26-exercise-progress-stats">
          <div><span>Mejor carga conocida</span><strong>${escapeHtml(
            Number.isFinite(exercise.bestLoadKg)
              ? `${exercise.bestLoadKg} kg`
              : 'Sin kg confirmados'
          )}</strong></div>
          <div><span>Últimas repeticiones</span><strong>${escapeHtml(
            exerciseProgressMetric(latest.bestReps)
          )}</strong></div>
          <div><span>RPE medio</span><strong>${escapeHtml(
            exerciseProgressMetric(latest.averageRpe)
          )}</strong></div>
          <div><span>RIR medio</span><strong>${escapeHtml(
            exerciseProgressMetric(latest.averageRir)
          )}</strong></div>
          <div><span>Volumen conocido</span><strong>${escapeHtml(
            Number.isFinite(latest.volumeKgReps)
              ? `${latest.volumeKgReps} kg·rep`
              : 'Sin dato comparable'
          )}</strong></div>
          <div><span>Cobertura de carga kg</span><strong>${escapeHtml(
            Number.isFinite(exercise.loadCoverage)
              ? `${Math.round(exercise.loadCoverage*100)}%`
              : 'Sin dato'
          )}</strong></div>
        </div>

        <div class="m26-exercise-progress-trends">
          ${exerciseProgressTrend(exercise.loadTrend,'Carga')}
          ${exerciseProgressTrend(exercise.repsTrend,'Reps')}
          ${exerciseProgressTrend(exercise.volumeTrend,'Volumen')}
          ${exerciseProgressTrend(exercise.rpeTrend,'RPE')}
          ${exerciseProgressTrend(exercise.rirTrend,'RIR')}
        </div>

        ${loadSpark}

        <div class="m26-table-scroll">
          <table class="m26-exercise-progress-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Carga</th>
                <th>Mejor reps</th>
                <th>Segundos</th>
                <th>RPE</th>
                <th>RIR</th>
                <th>Volumen</th>
              </tr>
            </thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      </div>
    </details>`;
  }).join('');

  return `<section class="m26-panel m26-exercise-progress-panel">
    <div class="m26-panel-heading">
      <div>
        <p class="m26-eyebrow">IBERFIT · Evolución 360</p>
        <h2>Evolución por ejercicio</h2>
        <p>Carga, repeticiones, tiempo y esfuerzo de ejecuciones completadas. La carga solo se trata como kg cuando la unidad es explícita.</p>
      </div>
      ${badge(`${progress.totalExercises} ejercicio${progress.totalExercises===1?'':'s'}`,'neutral')}
    </div>

    <div class="m26-exercise-progress-list">
      ${rows}
    </div>

    ${compact&&exercises.length>visible.length
      ? `<button type="button" class="m26-primary-action" data-m26-area="progreso">Ver todos los ejercicios y tendencias</button>`
      : ''
    }
  </section>`;
}
/* RC70_2_EXERCISE_RENDER_END */

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

  const progress=vm.progress||{};
  const cockpit=vm.coachCockpit||{};
  const focus=cockpit.items?.[0]||null;

  const focusTone=
    focus?.kind==='critical'
      ?'danger'
      :focus?.kind==='warning'
        ?'warning'
        :focus?.kind==='process'
          ?'pending'
          :'neutral';

  const pulseLabel=
    focus?.signalLabel||
    'Seguimiento al día';

  const pulseTitle=
    focus?.reason||
    'Sin señales prioritarias';

  const pulseCopy=
    focus?.detail||
    'No hay señales que requieran una acción adicional con los datos confirmados disponibles.';

  const pulseGuidance=
    focus?.guidance||
    'Mantener el seguimiento previsto.';

  const pulseSourceAction={
    registro_bienestar:{
      area:'actividad',
      label:'Revisar bienestar',
    },
    sessions:{
      area:'progreso',
      label:'Revisar progreso',
    },
    planning:{
      area:'planificacion',
      label:'Revisar planificación',
    },
    'data-quality':{
      area:'progreso',
      label:'Revisar datos',
    },
  };

  const structuralPulseAction=
    focus?.kind==='process'||
    focus?.source==='adaptive-experience'||
    focus?.source==='experience-core';

  const contextualPulseAction=
    focus
      ?pulseSourceAction[focus.source]||null
      :null;

  const pulseActionArea=
    structuralPulseAction
      ?focus?.nextAction?.area||'progreso'
      :contextualPulseAction?.area||'progreso';

  const pulseActionLabel=
    structuralPulseAction
      ?focus?.nextAction?.label||'Revisar seguimiento'
      :contextualPulseAction?.label||'Revisar progreso';

  const lastSessionLabel=
    progress.lastExecutionAt
      ?safeDateLabel(progress.lastExecutionAt)
      :'Sin sesión confirmada';

  const lastSessionNote=
    progress.lastExecutionAt
      ?Number.isFinite(progress.lastExecutionRpe)
        ?`RPE ${progress.lastExecutionRpe} · esfuerzo percibido confirmado`
        :'Sin RPE confirmado'
      :'No existe una ejecución confirmada en la ventana';

  const adherenceNote=
    Number.isFinite(progress.adherence)
      ?`${progress.completedSessions} completadas sobre ${progress.plannedSessions} registradas en el periodo`
      :'Sin base suficiente para calcular adherencia';

  const volumeTrend=
    Number.isFinite(progress.volumeDelta)
      ?`${progress.volumeDelta>0?'+':''}${progress.volumeDelta}%`
      :'Sin comparación suficiente';

  const iriPulseValue=
    iri
      ?iri.processLabel
      :'Pendiente';

  const iriPulseNote=
    iri
      ?iri.coverageLabel
      :'Sin evaluación IRI confirmada';

  const pulseStats=[
    stat(
      'Última sesión confirmada',
      lastSessionLabel,
      lastSessionNote
    ),
    stat(
      'Adherencia 28 días',
      formatPercent(progress.adherence),
      adherenceNote
    ),
    stat(
      'Tendencia de volumen',
      volumeTrend,
      Number.isFinite(progress.volumeDelta)
        ?'Mitad reciente frente a la anterior del periodo'
        :'Se necesitan al menos dos sesiones con carga registrada'
    ),
    stat(
      'Evaluación IRI',
      iriPulseValue,
      iriPulseNote
    ),
  ].join('');

  const latestCheckin=
    progress.latestCheckin||null;

  const wellbeingAvailable=
    Boolean(latestCheckin)&&
    [
      latestCheckin.energy,
      latestCheckin.sleep,
      latestCheckin.stress,
      latestCheckin.pain,
    ].some(Number.isFinite);

  const wellbeingContext=
    wellbeingAvailable
      ?`<article class="m26-panel m26-panel-soft">
          <div class="m26-panel-heading">
            <div>
              <p class="m26-eyebrow">Bienestar confirmado</p>
              <h3>${escapeHtml(
                progress.latestCheckinAt
                  ?safeDateLabel(progress.latestCheckinAt)
                  :'Último registro disponible'
              )}</h3>
              <p>Percepción registrada por la persona. Se muestra como contexto y no como diagnóstico.</p>
            </div>
            ${badge('Registro confirmado','success')}
          </div>

          <div class="m26-wellbeing-grid">
            ${wellbeingMeter(
              'Energía',
              latestCheckin.energy,
              '0 muy baja · 10 muy alta'
            )}
            ${wellbeingMeter(
              'Sueño',
              latestCheckin.sleep,
              '0 muy malo · 10 excelente'
            )}
            ${wellbeingMeter(
              'Estrés',
              latestCheckin.stress,
              '0 ninguno · 10 máximo'
            )}
            ${wellbeingMeter(
              'Dolor',
              latestCheckin.pain,
              '0 ninguno · 10 máximo'
            )}
          </div>
        </article>`
      :`<article class="m26-panel m26-panel-soft">
          <p class="m26-eyebrow">Bienestar confirmado</p>
          <h3>Sin registro reciente</h3>
          <p>No hay un check-in confirmado disponible en la ventana actual. La ausencia se mantiene como ausencia.</p>
        </article>`;

  const contextWearable=
    progress.wearable||{
      metrics:{},
      providers:[],
      daysWithData:0,
      latestDate:null,
      freshness:'sin_datos',
      quality:'limitada',
    };

  const wearableContextAvailable=
    wearableHasData(contextWearable);

  const wearableProviders=
    (contextWearable.providers||[])
      .map((provider)=>castilianSourceLabel(provider))
      .join(' · ');

  const wearableContext=
    wearableContextAvailable
      ?`<article class="m26-panel m26-panel-soft">
          <div class="m26-panel-heading">
            <div>
              <p class="m26-eyebrow">Dispositivos · últimos 7 días</p>
              <h3>${
                contextWearable.latestDate
                  ?escapeHtml(safeDateLabel(contextWearable.latestDate))
                  :'Última fecha disponible'
              }</h3>
              <p>${escapeHtml(
                wearableProviders||'Fuente confirmada'
              )} · Calidad ${escapeHtml(
                contextWearable.quality||'limitada'
              )} · ${escapeHtml(
                contextWearable.daysWithData||0
              )} ${Number(contextWearable.daysWithData||0)===1?'día':'días'} con datos.</p>
            </div>
            ${badge(
              contextWearable.freshness==='reciente'
                ?'Datos recientes'
                :'Revisar fecha',
              contextWearable.freshness==='reciente'
                ?'success'
                :'neutral'
            )}
          </div>

          <div class="m26-stat-grid">
            ${stat(
              'Pasos medios',
              metricValue(contextWearable.metrics?.steps),
              'Promedio diario disponible'
            )}
            ${stat(
              'Actividad',
              metricValue(
                contextWearable.metrics?.activeMinutes,
                ' min'
              ),
              'Minutos activos'
            )}
            ${stat(
              'Sueño objetivo',
              sleepHoursPerDay(
                contextWearable.metrics?.sleepMinutes
              ),
              'Media diaria · dato de dispositivo'
            )}
            ${stat(
              'FC en reposo',
              metricValue(
                contextWearable.metrics?.restingHeartRate,
                ' lpm'
              ),
              'Dato de dispositivo'
            )}
          </div>
        </article>`
      :`<article class="m26-panel m26-panel-soft">
          <p class="m26-eyebrow">Dispositivos · últimos 7 días</p>
          <h3>Sin datos confirmados</h3>
          <p>No se infieren valores ni se reconstruyen métricas ausentes. El seguimiento continúa con sesiones, IRI y bienestar confirmados.</p>
        </article>`;

  const recentContext=
    `<section class="m26-panel" aria-label="Contexto reciente">
      <div class="m26-panel-heading">
        <div>
          <p class="m26-eyebrow">Antes de decidir</p>
          <h2>Contexto reciente</h2>
          <p>Combina percepción registrada y datos objetivos disponibles sin atribuir causas ni modificar automáticamente el plan.</p>
        </div>
        ${badge(
          wellbeingAvailable||wearableContextAvailable
            ?'Contexto disponible'
            :'Sin contexto reciente',
          'neutral'
        )}
      </div>

      <div class="m26-content-grid">
        ${wellbeingContext}
        ${wearableContext}
      </div>

      <div class="m26-action-grid">
        <button type="button" data-m26-area="actividad">Revisar bienestar y dispositivos</button>
        <button type="button" data-m26-area="progreso">Abrir progreso completo</button>
      </div>

      <p class="m26-notice">Dato confirmado y contexto no son una prescripción. El entrenador interpreta y decide.</p>
    </section>`;

  const unconfirmedCount=
    Number(progress.unconfirmedExecutions||0);

  const pendingProgressNotice=
    unconfirmedCount>0
      ?`<section class="m26-notice is-pending" role="status"><strong>Progreso protegido</strong><p>Sesiones fuera del cálculo por no estar confirmadas: ${escapeHtml(unconfirmedCount)}. Se incorporarán únicamente cuando queden confirmadas.</p></section>`
      :'';

  const summaryStats=[
    stat(
      'Perfil esencial',
      `${profile.completeness??0}%`,
      profile.missing?.length
        ?`${profile.missing.length} campos pendientes`
        :'Datos esenciales completos'
    ),
  ];

  if(data.counts.sessions>0){
    summaryStats.push(
      stat(
        'Sesiones planificadas',
        data.counts.sessions,
        'Dentro del expediente activo'
      )
    );
  }

  if(data.counts.executions>0){
    summaryStats.push(
      stat(
        'Ejecuciones',
        data.counts.executions,
        'Sesiones realizadas y confirmadas'
      )
    );
  }

  return `<div class="m26-route" data-m26-expediente data-m26-expediente-view="resumen">
    ${renderCoachFollowUpPlan(vm.alerts)}
    <section class="m26-profile-hero m26-profile-hero-premium">
      <div class="m26-profile-brand-lockup">
        <div class="m26-profile-brand-orb">
          <img
            src="/isotipo-iberfit.png"
            alt="IBERFIT"
            class="m26-profile-brand-logo"
          >
        </div>
        <span class="m26-profile-client-initial" aria-hidden="true">
          ${escapeHtml(data.name.slice(0, 1).toUpperCase())}
        </span>
      </div>

      <div class="m26-profile-hero-copy">
        <div class="m26-profile-brand-word">
          <img
            src="/isotipo-iberfit.png"
            alt=""
            aria-hidden="true"
          >
          <span>IBERFIT</span>
        </div>

        <p class="m26-eyebrow">Cliente 360º · Expediente profesional</p>
        <h2>${escapeHtml(data.name)}</h2>
        <p>${escapeHtml(data.modality)} · ${escapeHtml(displayStatus)}</p>
      </div>

      <div class="m26-profile-hero-status">
        ${accessBadge(data)}
      </div>
    </section>
        <nav
      class="m26-expediente-tabs"
      role="tablist"
      aria-label="Vistas del expediente"
    >
      <button
        type="button"
        role="tab"
        aria-selected="true"
        tabindex="0"
        data-m26-expediente-tab="resumen"
      >Resumen</button>

      <button
        type="button"
        role="tab"
        aria-selected="false"
        tabindex="-1"
        data-m26-expediente-tab="contexto"
      >Contexto</button>

      <button
        type="button"
        role="tab"
        aria-selected="false"
        tabindex="-1"
        data-m26-expediente-tab="perfil"
      >Perfil</button>

      <button
        type="button"
        role="tab"
        aria-selected="false"
        tabindex="-1"
        data-m26-expediente-tab="plan"
      >Plan</button>
    </nav>
    <div class="m26-expediente-detail">
<section class="m26-panel m26-panel-soft" aria-label="Estado actual del cliente" data-m26-expediente-section="resumen">
      <div class="m26-panel-heading">
        <div>
          <p class="m26-eyebrow">Lo importante antes de decidir</p>
          <h2>Estado actual</h2>
          <p><strong>${escapeHtml(pulseTitle)}</strong>. ${escapeHtml(pulseCopy)}</p>
        </div>
        ${badge(pulseLabel,focusTone)}
      </div>

      <div class="m26-stat-grid">
        ${pulseStats}
      </div>

      <div class="m26-list-card-actions">
        <button
          type="button"
          class="m26-primary-action"
          data-m26-area="${escapeHtml(pulseActionArea)}"
        >${escapeHtml(pulseActionLabel)}</button>

        <small>${escapeHtml(pulseGuidance)} · Resumen construido con datos confirmados y reglas explicables.</small>
      </div>
    </section>

    ${renderExercisePerformanceOverview(vm.exercisePerformance)}

    <div data-m26-expediente-section="resumen">${pendingProgressNotice}</div>

    <div data-m26-expediente-section="contexto">${recentContext}</div>

    <div data-m26-expediente-section="perfil">${profileMissingNotice(profile)}</div>

    <section class="m26-stat-grid" data-m26-expediente-section="perfil">
      ${summaryStats.join('')}
    </section>
    <section class="m26-profile-sections" data-m26-expediente-section="perfil">
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Identificación y baremos</p><h2>Datos de la persona</h2></div></div><div class="m26-field-grid">${field('Fecha de nacimiento', profile.birthDate)}${field('Sexo utilizado para baremos', profile.sexForNormsLabel)}${field('Identidad de género', profile.genderIdentity)}${field('Pronombres', profile.pronouns)}</div></section>
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Contacto</p><h2>Datos de contacto</h2></div></div><div class="m26-field-grid">${field('Correo electrónico', profile.email)}${field('Teléfono', profile.phone)}${field('Canal preferido', profile.preferredContactChannel)}${field('Horario de contacto', profile.preferredContactTime)}${field('Zona horaria', profile.timezone)}</div></section>
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Logística</p><h2>Entrenamiento</h2></div>${profile.logisticsRequired && !profile.trainingAddress ? badge('Dirección pendiente', 'warning') : ''}</div><div class="m26-field-grid">${field('Modalidad', data.modality)}${field('Dirección de entrenamiento', address)}${field('Tipo de lugar', profile.locationType)}${field('Acceso o punto de encuentro', profile.accessInstructions)}${field('Horario preferido', profile.preferredSchedule)}${field('Frecuencia semanal', profile.weeklyFrequency ? `${profile.weeklyFrequency} sesiones` : null)}${field('Duración habitual', profile.sessionDurationMinutes ? `${profile.sessionDurationMinutes} min` : null)}${field('Material disponible', listValue(profile.equipment))}</div></section>
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Objetivos y seguridad</p><h2>Contexto de trabajo</h2></div></div><div class="m26-field-grid">${field('Objetivo principal', profile.primaryObjective)}${field('Objetivos secundarios', listValue(profile.secondaryObjectives))}${field('Contacto de emergencia', emergency)}</div></section>
    </section>
    <section class="m26-content-grid" data-m26-expediente-section="plan">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Planificación</p><h2>Contexto de acompañamiento</h2></div></div><div class="m26-field-grid">${field('Estado', displayStatus)}${field('Ciclo activo', data.cycle?.name)}${field('Próxima cita confirmada', data.nextAppointment?.dateLabel)}${field('Seguimiento', vm.alertSignal?.label)}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Evaluación IRI</p><h2>${iri ? escapeHtml(iri.coverageLabel) : 'Pendiente'}</h2><p>${iri ? `${escapeHtml(iri.dateLabel)} · ${escapeHtml(iri.status)}` : 'No hay una evaluación IRI confirmada.'}</p><button type="button" class="m26-primary-action" data-m26-area="iri">Abrir evaluación IRI</button></aside>
    </section>
    <section class="m26-panel" data-m26-expediente-section="plan"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Ruta de trabajo</p><h2>Continuar con este cliente</h2></div></div><div class="m26-action-grid"><button type="button" data-m26-area="planificacion">Planificación</button><button type="button" data-m26-area="sesion">Sesiones</button><button type="button" data-m26-area="progreso">Progreso</button><button type="button" data-m26-area="actividad">Registros de bienestar y hábitos</button><button type="button" data-m26-area="informes">Informes</button><button type="button" data-m26-area="notas">Notas privadas</button><button type="button" data-m26-area="inteligencia">Inteligencia IBERFIT</button></div></section>
      </div>
  ${renderExerciseProgressSection(vm.exerciseProgress,{compact:true})}</div>`;
}

/* RC70_4_FOLLOWUP_RENDER_BEGIN */
function renderCoachFollowUpPlan(alerts=[]){
  const plan=buildCoachFollowUpPlan(alerts);

  const kind=
    plan.level==='critical'
      ? 'danger'
      : plan.level==='warning'
        ? 'warning'
        : plan.level==='info'
          ? 'neutral'
          : 'success';

  const label=
    plan.level==='critical'
      ? 'Prioridad alta'
      : plan.level==='warning'
        ? 'Requiere contexto'
        : plan.level==='info'
          ? 'Seguimiento'
          : 'Al día';

  return `<section class="m26-followup-plan" aria-labelledby="m26-followup-plan-title">
    <div class="m26-panel-heading">
      <div>
        <p class="m26-eyebrow">Siguiente acción del Coach</p>
        <h2 id="m26-followup-plan-title">${escapeHtml(plan.actionTitle)}</h2>
        <p>${escapeHtml(plan.actionDetail)}</p>
      </div>
      ${badge(label,kind)}
    </div>

    <div class="m26-followup-context">
      <span>Señal que origina la revisión</span>
      <strong>${escapeHtml(plan.signalTitle)}</strong>
      <p>${escapeHtml(plan.signalDetail)}</p>
    </div>

    <div class="m26-followup-actions">
      <button
        type="button"
        class="m26-primary-action"
        data-m26-area="${escapeHtml(plan.primaryArea)}"
      >${escapeHtml(plan.primaryLabel)}</button>

      <button
        type="button"
        class="m26-text-action"
        data-m26-area="${escapeHtml(plan.secondaryArea)}"
      >${escapeHtml(plan.secondaryLabel)}</button>
    </div>

    <p class="m26-data-footnote">
      IBERFIT prioriza el contexto; el entrenador decide. No prescribe ni envía mensajes automáticamente.
    </p>
  </section>`;
}
/* RC70_4_FOLLOWUP_RENDER_END */

function formatPercent(value){ return Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'Sin dato'; }
function metricValue(value, suffix=''){ return value === null || value === undefined ? 'Sin dato' : `${value}${suffix}`; }
function sleepHoursPerDay(minutes){
  const numeric=Number(minutes);
  if(!Number.isFinite(numeric))return 'Sin dato';
  const hours=Math.round((numeric/60)*10)/10;
  return `${hours} h/día`;
}
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
function wearableDailyRecordCard(item,role='client'){const metrics=item?.metrics||{};const provider=castilianSourceLabel(item?.provider||'normalized_file');return `<article class="m26-wearable-day" data-wearable-date="${escapeHtml(item?.date||'')}"><header><div><p class="m26-eyebrow">${escapeHtml(provider)}</p><h3>${escapeHtml(safeDateLabel(item?.date))}</h3></div>${badge(escapeHtml(item?.quality||'limitada'),item?.quality==='alta'?'success':'neutral')}</header><div class="m26-field-grid">${wearableMetric('Pasos',metrics.steps)}${wearableMetric('Minutos activos',metrics.activeMinutes,' min')}${wearableMetric('Sueño',sleepHoursPerDay(metrics.sleepMinutes))}${wearableMetric('FC en reposo',metrics.restingHeartRate,' lpm')}${wearableMetric('VFC',metrics.hrvMs,' ms')}${wearableMetric('Energía activa',metrics.activeEnergyKcal,' kcal')}${wearableMetric('Entrenamiento',metrics.workoutMinutes,' min')}</div>${renderDataTrustStrip(wearableRecordTrust(item),{role,compact:true})}</article>`;}
function wearableCoveragePanel(wearable){const coverage=wearable?.coverage||{};return `<section class="m26-panel m26-wearable-free-coverage"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Plan gratuito de integraciones</p><h2>Todo lo gratuito que puede usarse ahora</h2><p>Los ocho orígenes pueden identificarse mediante archivos JSON, CSV o TSV compatibles y la plantilla IBERFIT. Los puentes nativos y las conexiones externas solo se activan cuando existen aplicación, permisos y credenciales reales.</p></div>${badge('Coste cero y control del cliente','success')}</div><div class="m26-stat-grid">${stat('Importación local',coverage.fileImport??0,'Fuentes admitidas')}${stat('Puentes detectados',coverage.nativeBridge??0,'Solo en aplicación nativa')}${stat('Conexiones bloqueadas',coverage.directBlocked??0,'Sin autorización real')}${stat('Fuentes reconocidas',coverage.total??0,'Formato canónico IBERFIT')}</div></section>`;}

export function renderProgressRoute(vm){
  const summary=vm.summary;
  if(!summary)return `<div class="m26-route">${emptyState('Sin expediente disponible','No existe un cliente autorizado para calcular progreso.')}</div>`;
  const timeline=vm.timeline.length?vm.timeline.map(timelineItem).join(''):emptyState('Sin eventos de progreso','Los datos ausentes se mantienen como ausentes y no se convierten en cero.');
  const adherenceVisual=Number.isFinite(summary.adherence)?`<section class="m26-panel m26-progress-overview" aria-label="Resumen visual de adherencia"><div class="m26-progress-heading"><span>Adherencia confirmada</span><strong>${formatPercent(summary.adherence)}</strong></div><meter min="0" max="1" value="${escapeHtml(Math.max(0,Math.min(1,summary.adherence)))}">${formatPercent(summary.adherence)}</meter><small>${escapeHtml(summary.completedSessions)} de ${escapeHtml(summary.plannedSessions)} sesiones confirmadas en la ventana seleccionada.</small></section>`:'';
  const wearable=summary.wearable||{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'};
  const unconfirmedCount=Number(summary.unconfirmedExecutions||0);
  const volumeTrend=Number.isFinite(summary.volumeDelta)
    ?`${summary.volumeDelta>0?'+':''}${summary.volumeDelta}%`
    :'Sin comparación suficiente';
  const sessionImpact=summary.lastExecutionAt
    ?`<section class="m26-panel m26-panel-soft"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Última sesión confirmada</p><h2>${escapeHtml(safeDateLabel(summary.lastExecutionAt))}</h2></div>${badge('Incluida en progreso','success')}</div><div class="m26-stat-grid">${stat('RPE de la sesión',metricValue(summary.lastExecutionRpe),'Esfuerzo percibido confirmado')}${stat('Tendencia de volumen',volumeTrend,Number.isFinite(summary.volumeDelta)?'Mitad reciente frente a la anterior del periodo':'Se necesitan al menos dos sesiones con carga registrada')}</div></section>`
    :'';
  const pendingProgressNotice=unconfirmedCount>0
    ?`<section class="m26-notice is-pending" role="status"><strong>Progreso protegido</strong><p>Sesiones fuera del cálculo por no estar confirmadas: ${escapeHtml(unconfirmedCount)}. Se incorporarán únicamente cuando queden confirmadas.</p></section>`
    :'';
  const hasCheckins=Number(summary.checkins||0)>0;
  const wearablePanel=wearableHasData(wearable)?`<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Actividad de dispositivo</p><h2>Tendencia objetiva complementaria</h2></div>${badge(wearable.freshness==='reciente'?'Actualizada':'Revisar fecha','neutral')}</div><div class="m26-field-grid">${wearableMetric('Pasos medios',wearable.metrics?.steps)}${wearableMetric('Minutos activos',wearable.metrics?.activeMinutes,' min')}${wearableMetric('Sueño de dispositivo',sleepHoursPerDay(wearable.metrics?.sleepMinutes))}${wearableMetric('FC en reposo',wearable.metrics?.restingHeartRate,' lpm')}</div>${renderDataTrustStrip(wearableSummaryTrust(wearable),{role:vm.role,compact:true})}<p class="m26-notice">Se presenta junto al registro de bienestar, no en sustitución de cómo se siente la persona ni como criterio clínico.</p></section>`:`<details class="m26-panel m26-optional-section"><summary>Actividad de dispositivo · sin datos confirmados</summary><p>No hay información de dispositivos para este periodo. El progreso se calcula únicamente con sesiones, evaluaciones y registros confirmados.</p></details>`;
  return `<div class="m26-route">
    <section class="m26-route-intro"><div><p class="m26-eyebrow">Seguimiento confirmado</p><h2>Progreso y adherencia</h2><p>Ventana de ${escapeHtml(summary.days)} días · calidad del dato ${escapeHtml(summary.dataQuality)}.</p></div>${badge(vm.signal.label,vm.signal.level==='critical'?'danger':vm.signal.level==='warning'?'warning':'neutral')}</section>
    <section class="m26-stat-grid">
      ${stat('Adherencia',formatPercent(summary.adherence),`${summary.completedSessions} de ${summary.plannedSessions} sesiones`)}
      ${stat('RPE medio',metricValue(summary.averageRpe),'Solo ejecuciones confirmadas')}
      ${stat('Volumen medio',metricValue(summary.volume),'Carga × repeticiones cuando existe')}
      ${stat('Evaluaciones IRI',summary.iriCurrent===null?'Sin evaluación':'Datos disponibles',summary.iriDelta===null?'Sin dos evaluaciones comparables':'Comparar por dominios, no por puntuación global')}
    </section>
    ${pendingProgressNotice}
    ${sessionImpact}
    ${adherenceVisual}
    ${renderLongitudinalDataExperience(vm.longitudinal,{role:vm.role})}
    <section class="m26-content-grid">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Cronología</p><h2>Evolución registrada</h2></div>${badge(`${vm.timeline.length} eventos`,'neutral')}</div><div class="m26-timeline">${timeline}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Recuperación</p><h2>Promedio de bienestar</h2><div class="m26-wellbeing-grid">${wellbeingMeter('Energía',hasCheckins?summary.checkinAverage.energy:null,'0 muy baja · 10 muy alta')}${wellbeingMeter('Sueño',hasCheckins?summary.checkinAverage.sleep:null,'0 muy malo · 10 excelente')}${wellbeingMeter('Estrés',hasCheckins?summary.checkinAverage.stress:null,'0 ninguno · 10 máximo')}${wellbeingMeter('Dolor',hasCheckins?summary.checkinAverage.pain:null,'0 ninguno · 10 máximo')}</div><p class="m26-notice">La aplicación no diagnostica ni atribuye causas. El entrenador interpreta el contexto.</p></aside>
    </section>
    ${wearablePanel}
    <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Alertas explicables</p><h2>Qué requiere atención</h2></div></div>${renderAlerts(vm.alerts)}</section>
  ${renderExerciseProgressSection(vm.exerciseProgress,{compact:false})}</div>`;
}

function capabilityNotice(capability,label){
  if(capability.ready)return '';
  return `<div class="m26-notice is-warning" role="status"><strong>${escapeHtml(label)}</strong><p>Esta función todavía no está disponible. Puedes conservar el borrador en este dispositivo, pero no se mostrará como confirmado hasta completar la conexión segura.</p></div>`;
}
function wearableFreshnessLabel(value){return value==='reciente'?'Actualizado':value==='atrasada'?'Revisar actualización':value==='obsoleta'?'Datos antiguos':'Sin datos';}
function wearableProviderCard(item){const policy=item.policy||{};const direct=item.nativeReady?'Puente nativo detectado y pendiente del permiso del cliente.':policy.directLabel||'Conexión directa no activada.';const connectionState='No está conectada ni comparte datos.';const copy=item.importReady?`Importación local disponible. ${item.nativeReady?'Conexión directa preparada.':'Conexión directa: No disponible.'} ${connectionState} ${direct}`:`${connectionState} ${direct}`;const label=item.nativeReady?'Puente disponible':item.importReady?'Importación disponible':'No disponible';const tone=item.nativeReady||item.importReady?'success':'warning';return `<article class="m26-wearable-source" data-provider="${escapeHtml(item.key)}" data-zero-cost-tier="${escapeHtml(policy.tier||'unknown')}"><div><p class="m26-eyebrow">${escapeHtml(castilianPlatformLabel(item.platform))}</p><h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(copy)}</p></div>${badge(label,tone)}</article>`;}

function lastCheckinSummary(last){
  if(!last)return `<p>No hay registros confirmados todavía.</p>`;
  const body=last.body||{};
  return `<div class="m26-wellbeing-grid m26-wellbeing-grid-compact">${wellbeingMeter('Energía',body.energy,'0 muy baja · 10 muy alta')}${wellbeingMeter('Sueño',body.sleep,'0 muy malo · 10 excelente')}${wellbeingMeter('Estrés',body.stress,'0 ninguno · 10 máximo')}${wellbeingMeter('Dolor',body.pain,'0 ninguno · 10 máximo')}</div>`;
}
export function renderActivityRoute(vm){
  const last=vm.checkins[0];const wearable=vm.wearables||{summary:{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'},connections:[],providers:[],canControl:false};const wearableSummary=wearable.summary;
  const habits=vm.habits.length?vm.habits.map((item)=>`<article class="m26-list-card"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.status)} · ${escapeHtml(item.dateLabel)}</p></div><div class="m26-inline-actions">${badge(item.status,'neutral')}<button type="button" data-engagement-action="log-habit" data-habit-id="${escapeHtml(item.id)}" aria-label="Registrar hoy: ${escapeHtml(item.title)}"${vm.capabilities.habits.ready?'':' disabled aria-disabled="true"'}>Registrar hoy</button></div></article>`).join(''):emptyState('Sin hábitos publicados',vm.capabilities.habits.ready?'Define el primer hábito para iniciar su seguimiento.':'La publicación de hábitos todavía no está disponible; el borrador puede prepararse sin mostrarlo como confirmado.');
  const manager=vm.canManageHabits?`<form class="m26-panel m26-panel-soft" data-engagement-form="habit-definition"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Entrenador</p><h2>Definir hábito</h2></div></div><div class="m26-field-grid"><label>Nombre<input name="title" maxlength="120" required></label><label>Objetivo<input name="target" type="number" min="1" step="1" required></label><label>Unidad<input name="unit" maxlength="40" value="veces"></label><label>Frecuencia<select name="frequency" required><option value="diario">Diario</option><option value="semanal">Semanal</option><option value="dias_especificos">Días específicos</option></select></label><label class="m26-wide">Descripción<textarea name="description" maxlength="500"></textarea></label></div><div class="m26-action-grid"><button type="button" data-engagement-action="save-habit-draft">Guardar borrador</button><button type="submit" class="m26-primary-action" data-engagement-action="define-habit"${vm.capabilities.habits.ready?'':' disabled aria-disabled="true"'}>Publicar hábito</button></div><p class="m26-form-status" data-engagement-status="habit" role="status" aria-live="polite"></p></form>`:'';
  const importer=wearable.canControl?`<form class="m26-panel m26-panel-soft" data-wearable-import aria-describedby="wearable-import-help"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Privacidad primero</p><h2>Revisar una exportación</h2></div>${badge('Solo vista previa local · gratuito','success')}</div><p id="wearable-import-help">La importación local permite revisar el formato sin crear cuentas ni enviar el archivo. Nada se incorpora al expediente hasta una confirmación posterior y explícita.</p><div class="m26-field-grid"><label>Origen del archivo<select name="wearableProvider" required><option value="normalized_file">Archivo normalizado IBERFIT</option><option value="health_connect">Exportación Health Connect</option><option value="samsung_health">Exportación Samsung Health</option><option value="strava">Exportación Strava</option><option value="apple_health">Exportación Apple Health</option><option value="fitbit">Exportación Google Health API / Fitbit</option><option value="oura">Exportación Oura</option><option value="garmin_connect">Exportación Garmin</option></select></label><label>Archivo JSON o CSV<input type="file" name="wearableFile" accept=".json,.csv,.tsv,application/json,text/csv,text/tab-separated-values" required></label></div><div class="m26-action-grid"><button type="button" data-wearable-action="download-template">Descargar plantilla</button><button type="submit" class="m26-primary-action">Analizar archivo</button><button type="button" data-wearable-action="clear-preview">Limpiar vista previa</button></div><p class="m26-form-status" data-wearable-status role="status" aria-live="polite" aria-atomic="true"></p><section class="m26-wearable-preview" data-wearable-preview hidden aria-live="polite"></section></form>`:`<aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Control del cliente</p><h2>Conexiones de dispositivos</h2><p>El cliente decide qué fuentes comparte, puede pausar la sincronización y conserva el control de sus permisos. El entrenador recibe únicamente resúmenes confirmados.</p></aside>`;
  const connectionCopy=wearable.connections.length?wearable.connections.map((item)=>`${item.label}: ${castilianStatusLabel(item.status)}`).join(' · '):'No hay conexiones remotas confirmadas.';
  const dailyRecords=wearable.dailyRecords?.length?`<section class="m26-panel m26-wearable-history"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Expediente confirmado</p><h2>Últimos registros diarios</h2><p>Valores individuales normalizados; no son estimaciones reconstruidas desde promedios.</p></div>${badge(`${wearable.dailyRecords.length} registro${wearable.dailyRecords.length===1?'':'s'}`,'success')}</div><div class="m26-wearable-day-grid">${wearable.dailyRecords.map((item)=>wearableDailyRecordCard(item,vm.role)).join('')}</div></section>`:'';
  const deviceSummary=wearableHasData(wearableSummary)?`<section class="m26-panel m26-wearable-overview"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Datos de dispositivos</p><h2>Resumen de los últimos 7 días</h2><p>${escapeHtml(connectionCopy)}</p></div>${badge(wearableFreshnessLabel(wearableSummary.freshness),wearableSummary.freshness==='reciente'?'success':'neutral')}</div><div class="m26-stat-grid">${stat('Pasos medios',metricValue(wearableSummary.metrics.steps),`${wearableSummary.daysWithData} días con datos`)}${stat('Actividad',metricValue(wearableSummary.metrics.activeMinutes,' min'),'Promedio diario disponible')}${stat('Sueño objetivo',sleepHoursPerDay(wearableSummary.metrics.sleepMinutes),'Media diaria · dato de dispositivo, no percepción')}${stat('FC en reposo',metricValue(wearableSummary.metrics.restingHeartRate,' lpm'),`Calidad ${wearableSummary.quality}`)}</div><div class="m26-field-grid m26-wearable-secondary">${wearableMetric('VFC media',wearableSummary.metrics.hrvMs,' ms')}${wearableMetric('Energía activa',wearableSummary.metrics.activeEnergyKcal,' kcal')}${wearableMetric('Entrenamiento registrado',wearableSummary.metrics.workoutMinutes,' min')}${wearableMetric('Fuentes',wearableSummary.providers.join(', ')||'Sin fuentes')}</div>${renderDataTrustStrip(wearableSummaryTrust(wearableSummary),{role:vm.role})}<p class="m26-notice">IBERFIT muestra procedencia, fecha y calidad. No transforma estos datos en indicaciones clínicas ni aumenta cargas sin revisión del entrenador.</p></section>`:`<section class="m26-notice"><strong>Sin datos de dispositivos confirmados</strong><p>El registro de bienestar y las sesiones continúan funcionando sin conectar ningún dispositivo.</p>${renderDataTrustStrip(wearableSummaryTrust(wearableSummary),{role:vm.role})}</section>`;
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
    <details class="m26-panel m26-optional-section"><summary>Dispositivos e integraciones opcionales</summary><div class="m26-optional-section-body">${deviceSummary}${dailyRecords}${wearableCoveragePanel(wearable)}<section class="m26-content-grid">${importer}<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Fuentes compatibles</p><h2>Importación y conexiones reales</h2><p>Seleccionar una fuente identifica el origen del archivo; no crea una conexión. Las conexiones directas siguen bloqueadas hasta completar su autorización real. Ninguna fuente aparece como conectada antes de completar su autorización.</p></div></div><div class="m26-wearable-sources">${wearable.providers.map(wearableProviderCard).join('')}</div></section></section></div></details>
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
  const center=vm.center;
  const hasItems=center.items.length>0;
  const content=hasItems
    ?center.items.map(operationCard).join('')
    :emptyState(
      'Estado local pendiente de revisión',
      'No se realiza una lectura automática al iniciar sesión. Usa Actualizar estado local para comprobar operaciones pendientes, conflictos o rechazos.'
    );
  const stateBadge=hasItems
    ?badge(center.deploymentBlocked?'Bloqueo activo':'Operaciones cargadas',center.deploymentBlocked?'danger':'neutral')
    :badge('Estado local no comprobado','neutral');
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Sincronización</p><h2>Centro de verificación</h2><p>Permite inspeccionar, reintentar o descartar únicamente la copia local. Nunca oculta un conflicto.</p></div><div class="m26-inline-actions">${stateBadge}<button type="button" data-verification-action="refresh">Actualizar estado local</button></div></section>${hasItems?`<section class="m26-stat-grid">${stat('Pendientes',center.summary.pending)}${stat('Conflictos',center.summary.conflicts)}${stat('Rechazadas',center.summary.rejected)}${stat('Total',center.summary.total)}</section>`:''}<section class="m26-panel"><div class="m26-stack">${content}</div></section></div>`;
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
  const reuse=entity==='session'?`<div class="m26-inline-actions"><button type="button" data-workflow-action="reuse-session" data-entity-id="${escapeHtml(item.id||'')}">Reutilizar como borrador</button><small>Crea una copia independiente; la sesión original permanece intacta.</small></div>`:'';
  return `<article class="m26-publication-card" data-publication-card><div class="m26-publication-card-main"><div><p class="m26-eyebrow">${escapeHtml(item.dateLabel||'IBERFIT')}</p><h3>${escapeHtml(item.title||'Contenido IBERFIT')}</h3><p>${escapeHtml(publicationVisibilityCopy(item))}</p></div>${badge(item.publication?.statusLabel||item.status||'Sin estado',publicationTone(item.publication?.status))}</div>${preview}${reuse}${controls}</article>`;
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
  const personContext=`<section class="m26-panel m26-panel-soft m26-iri-person"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Primera sesión</p><div class="m26-guidance-inline"><h2>${current.id?'Evaluación vinculada al expediente':'Evaluación todavía no preparada'}</h2>${renderGuidanceTrigger('iri',{label:'Ayuda sobre la evaluación IRI'})}</div><p>El borrador se conserva en este dispositivo. Solo una confirmación remota actualiza el expediente.</p></div>${current.id?badge('Entidad IRI disponible','success'):badge('Falta entidad IRI remota','warning')}</div><div class="m26-field-grid">${field('Fecha de nacimiento',profile.birthDate)}${field('Sexo utilizado para baremos',profile.sexForNormsLabel)}${field('Correo',profile.email)}${field('Teléfono',profile.phone)}${field('Modalidad',profile.modalityLabel)}${field('Dirección',[profile.trainingAddress,profile.commune].filter(Boolean).join(' · '))}</div></section>`;
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
/* RC71_0_CHALLENGE_SETTINGS_RENDER_BEGIN */
function rc71ChallengeStatus(item){
  if(!item.available){
    return badge('Pendiente de datos','neutral');
  }

  if(item.completed){
    return badge('Completado','success');
  }

  return badge(`${item.progress??0}%`,'neutral');
}

function rc71ChallengeCard(item){
  const current=item.current===null
    ? '—'
    : `${item.current} ${item.unit||''}`.trim();

  const target=item.target===null
    ? 'Sin objetivo activo'
    : `Objetivo ${item.target} ${item.unit||''}`.trim();

  return `<article class="m26-challenge-card${item.completed?' is-complete':''}">
    <div class="m26-challenge-head">
      <div>
        <p class="m26-eyebrow">Reto personal</p>
        <h3>${escapeHtml(item.title)}</h3>
      </div>
      ${rc71ChallengeStatus(item)}
    </div>
    <p>${escapeHtml(item.detail)}</p>
    <div class="m26-challenge-value">
      <strong>${escapeHtml(current)}</strong>
      <small>${escapeHtml(target)}</small>
    </div>
    ${item.available
      ? `<progress max="100" value="${escapeHtml(item.progress??0)}" aria-label="${escapeHtml(item.title)} ${escapeHtml(item.progress??0)}%">${escapeHtml(item.progress??0)}%</progress>`
      : ''
    }
  </article>`;
}

export function renderChallengesRoute(vm){
  if(!vm.clientId){
    return `<div class="m26-route">${emptyState(
      'Sin contexto para retos',
      'Selecciona un cliente autorizado para ver sus retos.'
    )}</div>`;
  }

  const challenges=Array.isArray(vm.challenges)
    ? vm.challenges
    : [];

  const cards=challenges.length
    ? challenges.map(rc71ChallengeCard).join('')
    : emptyState(
        'Todavía no hay retos activos',
        'Los retos aparecerán a partir de datos confirmados.'
      );

  return `<div class="m26-route m26-challenges-route">
    <section class="m26-route-intro">
      <div>
        <p class="m26-eyebrow">IBERFIT · Retos</p>
        <h2>Retos que acompañan tu proceso</h2>
        <p>Objetivos transparentes basados en planificación, registros y datos confirmados. Sin inventar rendimiento.</p>
      </div>
      ${badge(
        vm.social?.visibility==='private'
          ? 'Privado'
          : 'Compartido',
        'neutral'
      )}
    </section>

    <section class="m26-challenge-grid">
      ${cards}
    </section>

    <section class="m26-content-grid">
      <div class="m26-panel">
        <div class="m26-panel-heading">
          <div>
            <p class="m26-eyebrow">Comunidad IBERFIT</p>
            <h2>Social, con privacidad primero</h2>
          </div>
          ${badge(vm.social?.sharingEnabled?'Compartir manual habilitado':'Privado por defecto',vm.social?.sharingEnabled?'neutral':'success')}
        </div>
        <p>${vm.social?.sharingEnabled?'Consentimiento activo para compartir manualmente con '+escapeHtml(vm.social.audience==='coach'?'tu Coach':'alcance privado')+'.':'Tus logros permanecen privados.'} No existe publicación automática ni ranking público.</p><button type="button" data-m26-area="ajustes">Revisar privacidad social</button>
      </div>

      <aside class="m26-panel m26-panel-soft">
        <p class="m26-eyebrow">Siguiente paso</p>
        <h2>Usa el reto como contexto, no como presión</h2>
        <p>Revisa tu evolución o completa tus registros para mantener el seguimiento con datos reales.</p>
        <div class="m26-inline-actions">
          <button type="button" class="m26-primary-action" data-m26-area="progreso">Ver progreso</button>
          <button type="button" data-m26-area="actividad">Actividad y wearables</button>
        </div>
      </aside>
    </section>
  </div>`;
}

export function renderSettingsRoute(vm){
  const languageOptions=(vm.languageOptions||[])
    .map(item=>
      `<option value="${escapeHtml(item.value)}"${item.value===vm.language?' selected':''}>${escapeHtml(item.label)}</option>`
    )
    .join('');

  const localeOptions=(vm.localeOptions||[])
    .map(item=>
      `<option value="${escapeHtml(item.value)}"${item.value===vm.locale?' selected':''}>${escapeHtml(item.label)}</option>`
    )
    .join('');

  const plannedLanguages=(vm.plannedLanguages||[])
    .filter((item)=>!item.complete)
    .map((item)=>`<span class="m26-badge is-neutral" aria-disabled="true">${escapeHtml(item.label)} · próximamente</span>`)
    .join('');

  const preferences=vm.preferences||{};
  const social=preferences.social||{};
  const notifications=preferences.notifications||{};
  const checked=(value)=>value?' checked':'';
  const wearableNote=vm.hasClientContext
    ? `${vm.wearableConnections} conexión${vm.wearableConnections===1?'':'es'} registrada${vm.wearableConnections===1?'':'s'}`
    : 'Abre un expediente para revisar conexiones del cliente';

  const notificationToggle=(key,label,copy)=>
    `<label class="m26-consent">
      <input
        type="checkbox"
        data-m26-preference="notifications.${escapeHtml(key)}"
        ${checked(Boolean(notifications[key]))}
      >
      <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(copy)}</small></span>
    </label>`;

  return `<div class="m26-route m26-settings-route">
    <section class="m26-route-intro">
      <div>
        <p class="m26-eyebrow">IBERFIT · Ajustes</p>
        <h2>Cuenta, idioma, avisos y privacidad</h2>
        <p>Preferencias de experiencia separadas de datos clínicos, decisiones de entrenamiento y permisos operativos.</p>
      </div>
    </section>

    <section class="m26-settings-grid">
      <article class="m26-panel">
        <p class="m26-eyebrow">Idioma</p>
        <h3>Idioma de la interfaz</h3>
        <label>
          Idioma
          <select data-m26-ui-language>${languageOptions}</select>
        </label>
        <p class="m26-data-footnote">Solo aparecen idiomas con traducción completa. La arquitectura ya contempla Español, English, Deutsch, Français y Português.</p>
        <div class="m26-inline-actions">${plannedLanguages}</div>
      </article>

      <article class="m26-panel">
        <p class="m26-eyebrow">Región</p>
        <h3>Fechas, números y formatos</h3>
        <label>
          Región y formato
          <select data-m26-ui-locale data-m26-language>${localeOptions}</select>
        </label>
        <p class="m26-data-footnote">Idioma y región son preferencias distintas. Cambiar la región no cambia los textos de la interfaz.</p>
      </article>

      <article class="m26-panel">
        <p class="m26-eyebrow">Social</p>
        <h3>Compartir solo con consentimiento</h3>
        <label class="m26-consent">
          <input type="checkbox" data-m26-preference="social.sharingEnabled"${checked(Boolean(social.sharingEnabled))}>
          <span><strong>Permitir compartir manualmente</strong><small>Nunca publica por sí solo.</small></span>
        </label>
        <label>
          Alcance
          <select data-m26-preference="social.audience"${social.sharingEnabled?'':' disabled aria-disabled="true"'}>
            <option value="private"${social.audience==='private'?' selected':''}>Solo yo</option>
            <option value="coach"${social.audience==='coach'?' selected':''}>Mi Coach</option>
          </select>
        </label>
        <label class="m26-consent">
          <input type="checkbox" data-m26-preference="social.shareSessionSummary"${checked(Boolean(social.shareSessionSummary))}${social.sharingEnabled?'':' disabled aria-disabled="true"'}>
          <span><strong>Resumen de sesiones</strong><small>Autoriza compartirlo manualmente con el alcance elegido.</small></span>
        </label>
        <label class="m26-consent">
          <input type="checkbox" data-m26-preference="social.shareMilestones"${checked(Boolean(social.shareMilestones))}${social.sharingEnabled?'':' disabled aria-disabled="true"'}>
          <span><strong>Hitos</strong><small>Solo hitos confirmados; nunca peso, IMC, dolor, IRI o datos clínicos.</small></span>
        </label>
        <p class="m26-notice"><strong>Bloqueado por diseño:</strong> publicación automática desactivada y ranking público desactivado.</p>
      </article>

      <article class="m26-panel">
        <p class="m26-eyebrow">Avisos</p>
        <h3>Qué quieres recibir</h3>
        ${notificationToggle('sessionReminders','Próxima sesión','Recordatorio de una sesión confirmada.')}
        ${notificationToggle('scheduleChanges','Cambios de agenda','Cambios confirmados en fecha u hora.')}
        ${notificationToggle('planPublished','Plan publicado','Cuando el Coach publica una planificación.')}
        ${notificationToggle('coachMessages','Mensajes del Coach','Avisos asociados a comunicación real del Coach.')}
        ${notificationToggle('challenges','Retos','Cambios relevantes en retos privados.')}
        ${notificationToggle('milestones','Hitos','Hitos calculados únicamente desde datos confirmados.')}
        <p class="m26-data-footnote">Estas preferencias registran consentimiento. No se solicita permiso push ni se promete entrega push hasta que exista el servicio. Los conflictos de sincronización siguen visibles siempre dentro de la app.</p>
      </article>

      <article class="m26-panel">
        <p class="m26-eyebrow">Wearables</p>
        <h3>Dispositivos y actividad</h3>
        <p>${escapeHtml(wearableNote)}</p>
        <button type="button" class="m26-primary-action" data-m26-area="actividad">Gestionar wearables</button>
      </article>

      <article class="m26-panel">
        <p class="m26-eyebrow">Privacidad</p>
        <h3>Control por defecto</h3>
        <p>Retos privados por defecto, preferencias aisladas por cuenta, sin publicación social automática, sin ranking público y notas privadas del entrenador fuera de la vista del cliente.</p>
        ${badge('Privacidad activa','success')}
      </article>

      <article class="m26-panel m26-panel-soft">
        <p class="m26-eyebrow">Cuenta</p>
        <h3>${escapeHtml(vm.identity?.name||'Cuenta IBERFIT')}</h3>
        <p>${escapeHtml(vm.identity?.roleLabel||vm.role||'')}</p>
        <button type="button" class="m26-danger-action" data-m26-action="logout">Cerrar sesión</button>
      </article>
    </section>
  </div>`;
}
/* RC71_2_CHALLENGE_SETTINGS_RENDER_END */


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
  return `<div class="m26-client-route-shell" data-client-bottom-nav-route="${escapeHtml(vm?.kind||'hoy')}">${content}</div>`;
}

export function renderRouteView(vm) {
  if (vm.kind === 'retos') return renderChallengesRoute(vm);
  if (vm.kind === 'ajustes') return renderSettingsRoute(vm);
  const content=renderRouteContent(vm);
  return vm.role==='client'?renderClientRouteShell(vm,content):content;
}
