import {IBERFIT_UI_LOCALE,castilianEntityLabel,castilianOperationDetail,castilianPlatformLabel,castilianSourceLabel,castilianStatusLabel} from '../ui/castellano.js';
import {formatIberfitDate} from '../domain/civil-date.js';
import {renderExerciseLibraryGroups,renderExerciseMediaCredit} from '../library/exercise-media-ui.js';
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
function appointmentCard(item) {
  const detail=[item.modality,item.location]
    .filter(Boolean)
    .filter((value,index,list)=>list.indexOf(value)===index)
    .join(' · ');

  return `<article class="m26-list-card"><div><p class="m26-eyebrow">${escapeHtml(item.dateLabel)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(detail||'Modalidad pendiente de definir')}</p></div>${badge(item.status,/confirm|realiz|complet/i.test(item.status)?'success':'neutral')}</article>`;
}
function clientCard(client, selected = false) {
  const iri = client.iri
    ? `${client.iri.coverageCount}/3 dominios IRI`
    : 'IRI pendiente';
  const searchable = foldSearch(
    [
      client.name,
      client.modality,
      client.status,
      client.access,
      client.profile?.email,
      client.profile?.phone,
    ]
      .filter(Boolean)
      .join(' ')
  );
  const accessTone = client.accessKnown
    ? /activ|habilit|conect/i.test(client.access)
      ? 'success'
      : 'neutral'
    : 'neutral';

  return `<article class="m26-client-card${selected ? ' is-selected' : ''}" data-client-text="${escapeHtml(searchable)}">
    <button type="button" data-m26-select-client="${escapeHtml(client.id)}" aria-label="Abrir expediente de ${escapeHtml(client.name)}">
      <div class="m26-client-avatar" aria-hidden="true">${escapeHtml(client.name.slice(0, 1).toUpperCase())}</div>
      <div class="m26-client-copy"><p class="m26-eyebrow">${escapeHtml(client.modality)}</p><h3>${escapeHtml(client.name)}</h3><p>${escapeHtml(client.access)} · ${escapeHtml(iri)}</p></div>
      <div class="m26-client-meta">${badge(client.status, /activ/i.test(client.status) ? 'success' : 'neutral')}${badge(client.accessKnown ? 'Acceso registrado' : 'Acceso no informado', accessTone)}<small>${client.nextAppointment ? escapeHtml(client.nextAppointment.dateLabel) : 'Sin próxima cita confirmada'}</small></div>
    </button>
  </article>`;
}

export function renderHoyRoute(vm) {
  const isClient = vm.role === 'client';
  const client = vm.clients[0] || null;
  const proposalCount = vm.proposals?.length || 0;
  const heroTitle = isClient
    ? `Tu acompañamiento, ${escapeHtml(client?.name || 'IBERFIT')}`
    : 'Tu operación de hoy, con criterio';
  const heroCopy = isClient
    ? 'Revisa tu próxima sesión, planificación y evolución confirmada.'
    : 'Prioriza sesiones confirmadas y propuestas pendientes sin mezclar sus estados.';
  const appointments = vm.appointments.length
    ? vm.appointments.map(appointmentCard).join('')
    : emptyState(
        'Sin sesiones confirmadas para hoy',
        isClient
          ? 'Tu entrenador publicará aquí tus próximas citas confirmadas.'
          : 'No hay sesiones confirmadas para hoy.'
      );
  const proposals = !isClient && proposalCount
    ? `<section class="m26-panel m26-panel-soft"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Pendientes de decisión</p><h2>Propuestas de hoy</h2></div>${badge(countLabel(proposalCount, 'propuesta', 'propuestas'), 'pending')}</div><div class="m26-stack">${vm.proposals.map(appointmentCard).join('')}</div></section>`
    : '';
  const clients = !isClient && vm.clients.length
    ? vm.clients.slice(0, 5).map((item) => clientCard(item)).join('')
    : '';
  const next = vm.upcoming[0];
  const operationalState = vm.operations.conflicts
    ? 'Requiere revisión'
    : vm.operations.pending
      ? 'Sincronizando'
      : proposalCount
        ? 'Propuestas por revisar'
        : 'Sin bloqueos';
  const iriDetail = client?.iri
    ? `<div class="m26-mini-metric"><span>Última evaluación IRI</span><strong>${escapeHtml(client.iri.coverageLabel)}</strong><small>${escapeHtml(client.iri.dateLabel)}</small></div>`
    : '';

  return `<div class="m26-route m26-hoy-route">
    ${operationBanner(vm.operations)}
    <section class="m26-hero-panel"><div><p class="m26-eyebrow">IBERFIT · Hoy</p><h2>${heroTitle}</h2><p>${heroCopy}</p></div><div class="m26-hero-signal"><span>Estado operativo</span><strong>${operationalState}</strong></div></section>
    <section class="m26-stat-grid">
      ${stat('Sesiones confirmadas hoy', vm.appointments.length, 'No incluye propuestas')}
      ${isClient ? stat('Tu modalidad', client?.modality || 'Sin modalidad', 'Según tu expediente') : stat('Propuestas de hoy', proposalCount, proposalCount ? 'Requieren confirmación' : 'Ninguna pendiente')}
      ${stat('Próxima cita confirmada', next ? next.dateLabel : 'Sin agenda', next?.title || 'No hay una cita confirmada próxima')}
      ${stat('Conflictos', vm.operations.conflicts, vm.operations.conflicts ? 'Resolver antes de continuar' : 'Sin bloqueos')}
    </section>
    <section class="m26-content-grid">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Agenda</p><h2>Sesiones confirmadas de hoy</h2></div>${badge(countLabel(vm.appointments.length, 'confirmada', 'confirmadas'), 'neutral')}</div><div class="m26-stack">${appointments}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Siguiente paso</p><h2>${next ? escapeHtml(next.title) : 'Sin próxima cita confirmada'}</h2><p>${next ? escapeHtml(next.dateLabel) : 'Planifica o confirma una propuesta cuando corresponda.'}</p>${iriDetail}</aside>
    </section>
    ${proposals}
    ${clients ? `<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Seguimiento</p><h2>Clientes visibles</h2></div><button type="button" class="m26-text-action" data-m26-area="clientes">Ver todos</button></div><div class="m26-client-grid">${clients}</div></section>` : ''}
  </div>`;
}

export function renderClientsRoute(vm) {
  const content = vm.clients.length
    ? `<div class="m26-client-grid">${vm.clients.map((item) => clientCard(item, item.id === vm.selectedClientId)).join('')}</div>`
    : emptyState('No hay clientes visibles', 'No hay expedientes disponibles dentro de tus permisos.');
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Cartera autorizada</p><h2>Clientes y seguimiento</h2><p>Solo se muestran los expedientes autorizados para tu cuenta.</p></div>${badge(`${vm.clients.length} cliente${vm.clients.length === 1 ? '' : 's'}`, 'neutral')}</section><section class="m26-panel"><label>Buscar cliente<input type="search" data-client-search autocomplete="off" spellcheck="false" aria-describedby="m26-client-search-status" placeholder="Nombre, modalidad o estado"></label><p id="m26-client-search-status" data-client-search-status role="status" aria-live="polite">Mostrando ${countLabel(vm.clients.length,'cliente','clientes')}.</p>${content}</section></div>`;
}

function field(label, value) {
  return `<div class="m26-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || 'Sin registro')}</strong></div>`;
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

  return `<div class="m26-route">
    <section class="m26-profile-hero"><div class="m26-profile-avatar">${escapeHtml(data.name.slice(0, 1).toUpperCase())}</div><div><p class="m26-eyebrow">Expediente IBERFIT</p><h2>${escapeHtml(data.name)}</h2><p>${escapeHtml(data.modality)} · ${escapeHtml(data.status)}</p></div><div>${accessBadge(data)}</div></section>
    <section class="m26-stat-grid">${stat('Sesiones planificadas', data.counts.sessions)}${stat('Ejecuciones', data.counts.executions)}${stat('Adherencia 28 días', vm.progress ? formatPercent(vm.progress.adherence) : 'Sin dato')}${stat('Perfil esencial', `${profile.completeness ?? 0}%`, profile.missing?.length ? `${profile.missing.length} campos pendientes` : 'Datos esenciales completos')}</section>
    <section class="m26-profile-sections">
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Identificación y baremos</p><h2>Datos de la persona</h2></div></div><div class="m26-field-grid">${field('Fecha de nacimiento', profile.birthDate)}${field('Sexo utilizado para baremos', profile.sexForNormsLabel)}${field('Identidad de género', profile.genderIdentity)}${field('Pronombres', profile.pronouns)}</div></section>
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Contacto</p><h2>Canales autorizados</h2></div></div><div class="m26-field-grid">${field('Correo electrónico', profile.email)}${field('Teléfono', profile.phone)}${field('Canal preferido', profile.preferredContactChannel)}${field('Horario de contacto', profile.preferredContactTime)}${field('Zona horaria', profile.timezone)}</div></section>
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Logística</p><h2>Entrenamiento</h2></div>${profile.logisticsRequired && !profile.trainingAddress ? badge('Dirección pendiente', 'warning') : ''}</div><div class="m26-field-grid">${field('Modalidad', data.modality)}${field('Dirección de entrenamiento', address)}${field('Tipo de lugar', profile.locationType)}${field('Acceso o punto de encuentro', profile.accessInstructions)}${field('Horario preferido', profile.preferredSchedule)}${field('Frecuencia semanal', profile.weeklyFrequency ? `${profile.weeklyFrequency} sesiones` : null)}${field('Duración habitual', profile.sessionDurationMinutes ? `${profile.sessionDurationMinutes} min` : null)}${field('Material disponible', listValue(profile.equipment))}</div></section>
      <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Objetivos y seguridad</p><h2>Contexto de trabajo</h2></div></div><div class="m26-field-grid">${field('Objetivo principal', profile.primaryObjective)}${field('Objetivos secundarios', listValue(profile.secondaryObjectives))}${field('Contacto de emergencia', emergency)}</div></section>
    </section>
    <section class="m26-content-grid">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Planificación</p><h2>Contexto de acompañamiento</h2></div></div><div class="m26-field-grid">${field('Estado', data.status)}${field('Ciclo activo', data.cycle?.name)}${field('Próxima cita confirmada', data.nextAppointment?.dateLabel)}${field('Seguimiento', vm.alertSignal?.label)}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Evaluación IRI</p><h2>${iri ? escapeHtml(iri.coverageLabel) : 'Pendiente'}</h2><p>${iri ? `${escapeHtml(iri.dateLabel)} · ${escapeHtml(iri.status)}` : 'No hay una evaluación IRI confirmada.'}</p><button type="button" class="m26-primary-action" data-m26-area="iri">Abrir evaluación IRI</button></aside>
    </section>
    <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Ruta de trabajo</p><h2>Acciones del expediente</h2></div></div><div class="m26-action-grid"><button type="button" data-m26-area="planificacion">Planificación</button><button type="button" data-m26-area="sesion">Sesiones</button><button type="button" data-m26-area="progreso">Progreso</button><button type="button" data-m26-area="actividad">Registros de bienestar y hábitos</button><button type="button" data-m26-area="informes">Informes</button><button type="button" data-m26-area="notas">Notas privadas</button><button type="button" data-m26-area="inteligencia">Inteligencia IBERFIT</button></div></section>
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
      ${stat('Evaluaciones IRI',summary.iriCurrent===null?'Sin evaluación':'Datos disponibles',summary.iriDelta===null?'Sin dos evaluaciones comparables':'Comparar por dominios, no por puntuación global')}
    </section>
    <section class="m26-content-grid">
      <div class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Cronología</p><h2>Evolución registrada</h2></div>${badge(`${vm.timeline.length} eventos`,'neutral')}</div><div class="m26-timeline">${timeline}</div></div>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Recuperación</p><h2>Promedio de registros de bienestar</h2><div class="m26-field-grid">${field('Energía',metricValue(summary.checkinAverage.energy,'/10'))}${field('Sueño',metricValue(summary.checkinAverage.sleep,'/10'))}${field('Estrés',metricValue(summary.checkinAverage.stress,'/10'))}${field('Dolor',metricValue(summary.checkinAverage.pain,'/10'))}</div><p class="m26-notice">La aplicación no diagnostica ni atribuye causas. El entrenador interpreta el contexto.</p></aside>
    </section>
    <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Actividad de dispositivo</p><h2>Tendencia objetiva complementaria</h2></div>${badge(vm.summary.wearable?.freshness==='reciente'?'Actualizada':'Sin actualización reciente','neutral')}</div><div class="m26-field-grid">${wearableMetric('Pasos medios',vm.summary.wearable?.metrics?.steps)}${wearableMetric('Minutos activos',vm.summary.wearable?.metrics?.activeMinutes,' min')}${wearableMetric('Sueño de dispositivo',vm.summary.wearable?.metrics?.sleepMinutes,' min')}${wearableMetric('FC en reposo',vm.summary.wearable?.metrics?.restingHeartRate,' lpm')}</div><p class="m26-notice">Se presenta junto al registro de bienestar, no en sustitución de cómo se siente la persona ni como criterio clínico.</p></section>
    <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Alertas explicables</p><h2>Qué requiere atención</h2></div></div>${renderAlerts(vm.alerts)}</section>
  </div>`;
}

function capabilityNotice(capability,label){
  if(capability.ready)return `<div class="m26-notice is-success"><strong>Función disponible: ${escapeHtml(label)}</strong><p>Está preparada para guardar con confirmación segura.</p></div>`;
  return `<div class="m26-notice is-warning" role="status"><strong>Función no disponible todavía: ${escapeHtml(label)}</strong><p>Puedes conservar el borrador en este dispositivo; no se mostrará como confirmado hasta que la función esté disponible.</p></div>`;
}
function wearableFreshnessLabel(value){return value==='reciente'?'Actualizado':value==='atrasada'?'Revisar actualización':value==='obsoleta'?'Datos antiguos':'Sin datos';}
function wearableProviderCard(item) {
  const policy = item.policy || {};
  const copy = item.usableNow
    ? 'Disponible ahora sin coste adicional'
    : item.key === 'samsung_health'
      ? 'Samsung Health puede aportar pasos, ejercicio, frecuencia cardiaca y sueño mediante Health Connect y consentimiento del usuario.'
      : item.key === 'strava'
        ? 'OAuth preparado para actividades deportivas; necesita registro de aplicación y canje de tokens en backend antes de activarse.'
        : policy.tier === 'free_development'
          ? 'Preparado para desarrollo gratuito; requiere puente móvil real'
          : policy.tier === 'restricted_review'
            ? 'La autorización externa está preparada, pero requiere una revisión antes de activarse'
            : policy.tier === 'paid_distribution'
              ? 'Arquitectura preservada; activación pausada por la regla de coste cero'
              : policy.tier === 'partner_access'
                ? 'No se activará mientras requiera acceso de socio o licencia'
                : policy.tier === 'external_oauth'
                  ? 'En espera hasta confirmar una vía gratuita'
                  : 'Vista previa local disponible';
  const label = item.usableNow ? 'Disponible' : policy.label || 'Preparado';
  const tone = item.usableNow
    ? 'success'
    : policy.developmentAllowed
      ? 'neutral'
      : 'warning';

  return `<article class="m26-wearable-source" data-provider="${escapeHtml(item.key)}" data-zero-cost-tier="${escapeHtml(policy.tier || 'unknown')}"><div><p class="m26-eyebrow">${escapeHtml(castilianPlatformLabel(item.platform))} · integración controlada</p><h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(copy)}</p></div>${badge(label, tone)}</article>`;
}

function wearableMetric(label,value,suffix=''){return field(label,value===null||value===undefined?'Sin dato':`${value}${suffix}`);}
export function renderActivityRoute(vm){
  const last=vm.checkins[0];const wearable=vm.wearables||{summary:{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'},connections:[],providers:[],canControl:false};const wearableSummary=wearable.summary;
  const habits=vm.habits.length?vm.habits.map((item)=>`<article class="m26-list-card"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.status)} · ${escapeHtml(item.dateLabel)}</p></div><div class="m26-inline-actions">${badge(item.status,'neutral')}<button type="button" data-engagement-action="log-habit" data-habit-id="${escapeHtml(item.id)}" aria-label="Registrar hoy: ${escapeHtml(item.title)}"${vm.capabilities.habits.ready?'':' disabled aria-disabled="true"'}>Registrar hoy</button></div></article>`).join(''):emptyState('Sin hábitos publicados','El entrenador podrá definirlos cuando esta función esté disponible.');
  const manager=vm.canManageHabits?`<form class="m26-panel m26-panel-soft" data-engagement-form="habit-definition"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Entrenador</p><h2>Definir hábito</h2></div></div><div class="m26-field-grid"><label>Nombre<input name="title" maxlength="120" required></label><label>Objetivo<input name="target" type="number" min="1" step="1" required></label><label>Unidad<input name="unit" maxlength="40" value="veces"></label><label>Frecuencia<select name="frequency" required><option value="diario">Diario</option><option value="semanal">Semanal</option><option value="dias_especificos">Días específicos</option></select></label><label class="m26-wide">Descripción<textarea name="description" maxlength="500"></textarea></label></div><div class="m26-action-grid"><button type="button" data-engagement-action="save-habit-draft">Guardar borrador</button><button type="submit" class="m26-primary-action" data-engagement-action="define-habit"${vm.capabilities.habits.ready?'':' disabled aria-disabled="true"'}>Publicar hábito</button></div><p class="m26-form-status" data-engagement-status="habit" role="status" aria-live="polite"></p></form>`:'';
  const importer=wearable.canControl?`<form class="m26-panel m26-panel-soft" data-wearable-import aria-describedby="wearable-import-help"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Privacidad primero</p><h2>Revisar una exportación</h2></div>${badge('Solo vista previa local · gratuito','success')}</div><p id="wearable-import-help">La importación local permite revisar el formato sin crear cuentas ni enviar el archivo. Nada se incorpora al expediente hasta una confirmación posterior y explícita.</p><div class="m26-field-grid"><label>Origen del archivo<select name="wearableProvider" required><option value="normalized_file">Archivo normalizado IBERFIT</option><option value="health_connect">Exportación Health Connect</option><option value="samsung_health">Exportación Samsung Health</option><option value="strava">Exportación Strava</option><option value="apple_health">Exportación Apple Health</option><option value="fitbit">Exportación Google Health API / Fitbit</option><option value="oura">Exportación Oura</option><option value="garmin_connect">Exportación Garmin</option></select></label><label>Archivo JSON o CSV<input type="file" name="wearableFile" accept=".json,.csv,application/json,text/csv" required></label></div><div class="m26-action-grid"><button type="button" data-wearable-action="download-template">Descargar plantilla</button><button type="submit" class="m26-primary-action">Analizar archivo</button><button type="button" data-wearable-action="clear-preview">Limpiar vista previa</button></div><p class="m26-form-status" data-wearable-status role="status" aria-live="polite" aria-atomic="true"></p><section class="m26-wearable-preview" data-wearable-preview hidden aria-live="polite"></section></form>`:`<aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Control del cliente</p><h2>Conexiones de dispositivos</h2><p>El cliente decide qué fuentes comparte, puede pausar la sincronización y conserva el control de sus permisos. El entrenador recibe únicamente resúmenes confirmados.</p></aside>`;
  const connectionCopy=wearable.connections.length?wearable.connections.map((item)=>`${item.label}: ${castilianStatusLabel(item.status)}`).join(' · '):'No hay conexiones remotas confirmadas.';
  return `<div class="m26-route">
    <section class="m26-route-intro"><div><p class="m26-eyebrow">Actividad y contexto</p><h2>Registros de bienestar, hábitos y dispositivos</h2><p>El registro de bienestar sigue siendo la fuente principal de contexto. Los datos de dispositivos aportan tendencias objetivas, nunca diagnósticos ni decisiones automáticas.</p></div>${badge(last?'Último registro de bienestar disponible':'Sin registro de bienestar','neutral')}</section>
    ${capabilityNotice(vm.capabilities.checkins,'Registros de bienestar')}
    <section class="m26-content-grid">
      <form class="m26-panel" data-engagement-form="checkin"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Registro de bienestar</p><h2>Cómo estás hoy</h2></div></div><div class="m26-field-grid">
        <label>Energía (0–10)<input type="number" min="0" max="10" inputmode="numeric" name="energy" required></label>
        <label>Sueño (0–10)<input type="number" min="0" max="10" inputmode="numeric" name="sleep" required></label>
        <label>Estrés (0–10)<input type="number" min="0" max="10" inputmode="numeric" name="stress" required></label>
        <label>Dolor (0–10)<input type="number" min="0" max="10" inputmode="numeric" name="pain" required></label>
        <label class="m26-wide">Observaciones<textarea name="notes" maxlength="1000"></textarea></label>
      </div><div class="m26-action-grid"><button type="button" data-engagement-action="save-checkin-draft">Guardar borrador</button><button type="submit" class="m26-primary-action" data-engagement-action="submit-checkin"${vm.capabilities.checkins.ready?'':' disabled aria-disabled="true"'}>Enviar registro de bienestar</button></div><p class="m26-form-status" data-engagement-status="checkin" role="status" aria-live="polite"></p></form>
      <aside class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Último registro confirmado</p><h2>${last?escapeHtml(last.dateLabel):'Sin registro'}</h2><p>${last?'Disponible entre los registros confirmados.':'La ausencia se mantiene como dato faltante.'}</p></aside>
    </section>
    <section class="m26-panel m26-wearable-overview"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Datos de dispositivos</p><h2>Resumen de los últimos 7 días</h2><p>${escapeHtml(connectionCopy)}</p></div>${badge(wearableFreshnessLabel(wearableSummary.freshness),wearableSummary.freshness==='reciente'?'success':'neutral')}</div><div class="m26-stat-grid">${stat('Pasos medios',metricValue(wearableSummary.metrics.steps),`${wearableSummary.daysWithData} días con datos`)}${stat('Actividad',metricValue(wearableSummary.metrics.activeMinutes,' min'),'Promedio diario disponible')}${stat('Sueño objetivo',metricValue(wearableSummary.metrics.sleepMinutes,' min'),'Dato de dispositivo, no percepción')}${stat('FC en reposo',metricValue(wearableSummary.metrics.restingHeartRate,' lpm'),`Calidad ${wearableSummary.quality}`)}</div><div class="m26-field-grid m26-wearable-secondary">${wearableMetric('VFC media',wearableSummary.metrics.hrvMs,' ms')}${wearableMetric('Energía activa',wearableSummary.metrics.activeEnergyKcal,' kcal')}${wearableMetric('Entrenamiento registrado',wearableSummary.metrics.workoutMinutes,' min')}${wearableMetric('Fuentes',wearableSummary.providers.join(', ')||'Sin fuentes')}</div><p class="m26-notice">IBERFIT muestra procedencia, fecha y calidad. No transforma datos de dispositivos conectados en indicaciones clínicas ni progresa cargas sin revisión del entrenador.</p></section>
    <section class="m26-content-grid">${importer}<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Arquitectura preparada</p><h2>Plan gratuito de integraciones</h2><p>Solo se habilitan rutas sin coste confirmado. Las demás permanecen visibles como arquitectura, pero bloqueadas.</p></div>${badge('Coste cero','success')}</div><div class="m26-wearable-sources">${wearable.providers.map(wearableProviderCard).join('')}</div></section></section>
    ${capabilityNotice(vm.capabilities.habits,'Hábitos')}
    ${manager}
    <section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Seguimiento</p><h2>Hábitos activos</h2></div>${badge(countLabel(vm.habits.length,'hábito','hábitos'),'neutral')}</div><div class="m26-stack">${habits}</div><p class="m26-form-status" data-engagement-status="habit-log" role="status" aria-live="polite"></p></section>
  </div>`;
}

export function renderPrivateNotesRoute(vm){
  const notes=vm.notes.length?vm.notes.map((item)=>`<article class="m26-list-card"><div><p class="m26-eyebrow">${escapeHtml(item.dateLabel)}</p><h3>${escapeHtml(item.title)}</h3><p>Contenido protegido para el equipo de entrenamiento y administración.</p></div>${badge(item.status,'neutral')}</article>`).join(''):emptyState('Sin notas privadas','No hay notas confirmadas visibles para este expediente.');
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Uso interno</p><h2>Notas privadas del entrenador</h2><p>Nunca son visibles para el cliente y requieren permisos internos específicos.</p></div>${badge(countLabel(vm.notes.length,'nota','notas'),'neutral')}</section>${capabilityNotice(vm.capability,'Notas privadas')}<section class="m26-panel">${notes}</section><section class="m26-panel m26-panel-soft"><label>Nueva nota<textarea data-private-note-draft maxlength="4000"${vm.capability.ready?'':' disabled aria-disabled="true"'}></textarea></label><button type="button" class="m26-primary-action" data-engagement-action="save-private-note"${vm.capability.ready?'':' disabled aria-disabled="true"'}>Guardar nota privada</button><p role="status" data-engagement-status="private-note"></p></section></div>`;
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
  const preview=`<section class="m26-publication-preview" aria-label="Vista previa para el cliente"><p class="m26-eyebrow">Así lo verá el cliente</p><h4>${escapeHtml(item.clientContent?.title||item.title||'Contenido IBERFIT')}</h4>${clientContentBody(item.clientContent,{preview:true})}</section>`;
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

export function renderIriRoute(vm) {
  const current = vm.current || {};
  const summary = vm.currentSummary;
  const profile = vm.profile || {};
  const sexValue = current.sexForNorms || current.sex_for_norms || profile.sexForNorms || '';
  const personContext = `<section class="m26-panel m26-panel-soft m26-iri-person"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Persona evaluada</p><h2>Contexto del expediente</h2><p>Los datos de contacto y logística se mantienen en el expediente; la evaluación conserva el contexto de baremo usado.</p></div>${profile.missing?.length ? badge(`${profile.missing.length} datos esenciales pendientes`, 'warning') : badge('Contexto completo', 'success')}</div><div class="m26-field-grid">${field('Fecha de nacimiento', profile.birthDate)}${field('Sexo utilizado para baremos', profile.sexForNormsLabel)}${field('Correo electrónico', profile.email)}${field('Teléfono', profile.phone)}${field('Modalidad', profile.modalityLabel)}${field('Dirección de entrenamiento', [profile.trainingAddress, profile.commune].filter(Boolean).join(' · '))}</div></section>`;
  const editor = vm.canEdit
    ? `<form class="m26-panel" data-workflow-form="iri"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Evaluación</p><h2>Completar evaluación IRI</h2></div></div><input type="hidden" name="entityId" value="${escapeHtml(current.id || '')}"><div class="m26-field-grid"><label>Fecha de evaluación<input type="date" name="assessmentDate" value="${escapeHtml(String(current.assessmentDate || current.evaluatedAt || '').slice(0, 10))}" required></label><label>Fecha de nacimiento<input type="date" name="birthDate" value="${escapeHtml(profile.birthDate || '')}" required></label><label>Sexo para baremos<select name="sexForNorms" required><option value="">Seleccionar</option><option value="female"${selectedOption(sexValue, 'female')}>Mujer</option><option value="male"${selectedOption(sexValue, 'male')}>Hombre</option></select></label><label>FC al finalizar la prueba de escalón<input type="number" min="30" max="240" name="stepFinalHr" value="${escapeHtml(current.stepFinalHr ?? current.step_final_hr ?? '')}" required></label><label>FC al minuto<input type="number" min="30" max="240" name="stepOneMinuteHr" value="${escapeHtml(current.stepOneMinuteHr ?? current.step_one_minute_hr ?? '')}" required></label><label>Flexiones válidas<input type="number" min="0" max="500" inputmode="numeric" name="pushUps" value="${escapeHtml(current.pushUps ?? current.push_ups ?? '')}" required></label><label>Levantarse de la silla durante 30 s<input type="number" min="0" max="500" inputmode="numeric" name="chairStand30s" value="${escapeHtml(current.chairStand30s ?? current.chair_stand_30s ?? '')}" required></label><label>% grasa corporal<input type="number" min="0" max="80" step="0.1" inputmode="decimal" name="bodyFatPercent" required value="${escapeHtml(current.bodyComposition?.bodyFatPercent ?? current.body_composition?.bodyFatPercent ?? '')}"></label><p class="m26-field-help m26-wide">Registra resultados objetivos. Solo se muestra una interpretación cuando sexo para baremos, edad, protocolo y evidencia son compatibles.</p></div><button type="submit" class="m26-primary-action" data-workflow-action="complete-iri"${current.id ? '' : ' disabled aria-disabled="true"'}>Validar y guardar evaluación</button>${current.id ? '' : '<p class="m26-notice is-warning">Prepara primero la evaluación IRI del expediente.</p>'}${workflowStatus('iri')}</form>`
    : '';
  const domainCards = summary
    ? `<div class="m26-domain-grid">${iriDomainState('Respuesta cardiovascular', summary.domains.cardiovascular)}${iriDomainState('Composición corporal', summary.domains.bodyComposition)}${iriDomainState('Fuerza por patrón', summary.domains.strength)}</div>`
    : emptyState('Sin evaluación confirmada', 'Los datos ausentes se mantienen como “Sin registro”.');

  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Evaluación funcional</p><h2>Índice de Rendimiento IBERFIT</h2><p>ΔFC, composición corporal y fuerza por patrón, con contexto de sexo y edad para baremos cuando exista evidencia aplicable.</p></div>${badge(summary ? summary.coverageLabel : 'Pendiente', summary?.coverageCount === 3 ? 'success' : 'warning')}</section>${personContext}<section class="m26-content-grid"><article class="m26-panel m26-panel-soft"><p class="m26-eyebrow">Última evaluación</p><h2>${escapeHtml(summary?.dateLabel || 'Sin fecha')}</h2><p>${escapeHtml(summary?.coverageLabel || 'No hay una evaluación confirmada.')}</p>${domainCards}<p class="m26-notice">IBERFIT no presenta una puntuación global ni una clasificación automática sin un baremo validado aplicable.</p></article><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Historial</p><h2>Evaluaciones registradas</h2></div>${badge(countLabel(vm.history.length, 'registro', 'registros'), 'neutral')}</div>${recordList(vm.history, 'Sin evaluaciones IRI')}</section></section>${editor}</div>`;
}

export function renderPlanningRoute(vm){
  const isClient=vm.role==='client';
  const editor=vm.canEdit?`<form class="m26-panel m26-panel-soft" data-workflow-form="planning"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Entrenador</p><h2>Preparar ciclo de entrenamiento</h2><p>Validar crea una versión interna. Después deberá aprobarse y publicarse de forma expresa.</p></div></div><input type="hidden" name="entityId" value="${escapeHtml(vm.currentCycle?.id||'')}"><div class="m26-field-grid"><label>Nombre del ciclo<input name="name" maxlength="120" value="${escapeHtml(vm.currentCycle?.name||'')}" required></label><label>Inicio<input type="date" name="startDate" required></label><label>Fin<input type="date" name="endDate" required></label><label class="m26-wide">Objetivo<textarea name="goal" maxlength="500" required>${escapeHtml(vm.currentCycle?.goal||'')}</textarea></label></div><button type="submit" class="m26-primary-action" data-workflow-action="validate-plan">Validar borrador</button>${workflowStatus('planning')}</form>`:'';
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

  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Agenda del entrenador</p><h2>Citas y propuestas</h2><p>Las propuestas son internas. El cliente solo recibe citas confirmadas.</p></div>${badge(countLabel(vm.appointments.length, 'registro', 'registros'), 'neutral')}</section><section class="m26-panel"><div class="m26-stack">${vm.appointments.length ? vm.appointments.map(appointmentCard).join('') : emptyState('Agenda vacía', 'No hay citas ni propuestas registradas.')}</div></section>${form}</div>`;
}

export function renderSessionsRoute(vm){
  const isClient=vm.role==='client';
  const primary=vm.canBuild?`<button type="button" class="m26-primary-action" data-workflow-action="open-session-builder">Crear sesión</button>`:`<button type="button" class="m26-primary-action" data-workflow-action="start-published-session"${vm.sessions.length?'':' disabled aria-disabled="true"'}>Iniciar sesión guiada</button>`;
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Motor de sesiones</p><h2>${isClient?'Tus sesiones guiadas':'Construcción y publicación de sesiones'}</h2><p>${isClient?'Elige la sesión preparada para ti y sigue las indicaciones paso a paso.':'Construye desde el catálogo, revisa la vista previa y controla de forma expresa qué recibe el cliente.'}</p></div>${primary}</section><section class="m26-content-grid"><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">${isClient?'Disponibles':'Ciclo de publicación'}</p><h2>${isClient?'Sesiones para realizar':'Sesiones del expediente'}</h2></div>${!isClient?badge(`${vm.sessionCounts?.published||0} publicadas`,'success'):''}</div>${publicationList(vm.sessions,'session',isClient?'No hay sesiones disponibles':'Sin sesiones preparadas',{clientView:isClient})}</section><section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Historial</p><h2>${isClient?'Tus sesiones realizadas':'Ejecuciones confirmadas'}</h2></div></div>${recordList(vm.executions,'Sin ejecuciones confirmadas')}</section></section>${workflowStatus('session')}</div>`;
}
export function renderReportsRoute(vm){
  const isClient=vm.role==='client';
  const iriId=vm.latestIri?.id||'';
  const editor=vm.canManage?(iriId?`<form class="m26-panel m26-panel-soft m26-report-editor" data-workflow-form="report-approval"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Edición profesional</p><h2>Preparar informe IBERFIT</h2><p>El informe se aprobará como contenido interno. No será visible para el cliente hasta una publicación posterior y expresa.</p></div>${badge('Formato A4 premium','neutral')}</div><input type="hidden" name="assessmentId" value="${escapeHtml(iriId)}"><div class="m26-field-grid"><label class="m26-wide">Título<input name="title" maxlength="140" value="Informe de evolución IBERFIT" required></label><label>Inicio del periodo<input type="date" name="periodStart" required></label><label>Fin del periodo<input type="date" name="periodEnd" required></label><label class="m26-wide">Resumen del periodo<textarea name="summary" minlength="20" maxlength="2500" required></textarea></label><label class="m26-wide">Conclusiones<textarea name="conclusions" minlength="20" maxlength="2500" required></textarea></label><label class="m26-wide">Recomendaciones y próximos pasos<textarea name="recommendations" minlength="20" maxlength="2500" required></textarea></label></div><section class="m26-report-preview" aria-label="Criterios de revisión del informe"><p class="m26-eyebrow">Revisión previa</p><h3>Comprobación editorial</h3><p>Confirma que el texto distingue datos objetivos, interpretación profesional y próximos pasos; evita diagnósticos y afirmaciones no respaldadas.</p><label><input type="checkbox" name="reviewAccepted" required> He revisado íntegramente el contenido y confirmo que está listo para aprobación interna.</label></section><button type="submit" class="m26-primary-action" data-workflow-action="approve-report">Aprobar informe interno</button>${workflowStatus('report')}</form>`:`<section class="m26-notice is-warning" role="status"><strong>Falta un diagnóstico IRI confirmado</strong><p>El informe premium no puede prepararse hasta que exista una evaluación IRI trazable en el expediente.</p></section>`):'';
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Documentación</p><h2>${isClient?'Tus informes IBERFIT':'Informes y publicación'}</h2><p>${isClient?'Consulta tus informes de evolución y los próximos pasos acordados con tu entrenador.':'Aprobar y publicar son decisiones separadas. Un informe aprobado sigue siendo interno hasta su publicación.'}</p></div>${badge(countLabel(vm.reports.length,'informe','informes'),'neutral')}</section><section class="m26-panel">${publicationList(vm.reports,'report',isClient?'Aún no hay informes disponibles':'Sin informes preparados',{clientView:isClient})}</section>${editor}${!editor?workflowStatus('report'):''}</div>`;
}
export function renderIntelligenceRoute(vm){
  const form=vm.canGenerate?`<form class="m26-panel m26-panel-soft" data-workflow-form="intelligence"><div class="m26-panel-heading"><div><p class="m26-eyebrow">La IA propone</p><h2>Generar propuesta de sesión</h2></div></div><div class="m26-field-grid"><label>Objetivo<input name="goal" value="fuerza" required></label><label>Duración (min)<input type="number" min="20" max="120" name="durationMinutes" value="50" required></label><label>Experiencia<select name="experience"><option value="inicial">Inicial</option><option value="intermedio" selected>Intermedio</option><option value="avanzado">Avanzado</option></select></label><label>Modalidad<select name="modality"><option value="hibrido">Híbrido</option><option value="online">En línea</option><option value="presencial">Presencial</option></select></label><label>Edad calculada<input type="number" name="ageYears" value="${escapeHtml(vm.ageYears??'')}" readonly aria-describedby="m26-age-help"></label><p id="m26-age-help" class="m26-field-help">Se calcula automáticamente desde la fecha de nacimiento del expediente.</p><label>Material<input name="equipment" value="TRX,mancuernas"></label></div><button type="submit" class="m26-primary-action" data-workflow-action="generate-intelligence"${vm.ageYears==null?' disabled aria-disabled="true"':''}>Generar propuesta revisable</button>${vm.ageYears==null?'<p class="m26-notice is-warning">Registra primero la fecha de nacimiento en el expediente.</p>':''}${workflowStatus('intelligence')}<div data-intelligence-preview></div></form>`:'';
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Motor IBERFIT</p><h2>Inteligencia con criterio</h2><p>Usa adherencia, recuperación y carga histórica. Nunca publica ni progresa cargas automáticamente.</p></div>${badge(vm.alerts.some((x)=>x.severity==='critical')?'Revisión requerida':'Contexto disponible',vm.alerts.some((x)=>x.severity==='critical')?'danger':'success')}</section>${form}<section class="m26-panel"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Historial</p><h2>Propuestas confirmadas</h2></div></div>${recordList(vm.runs,'Sin propuestas remotas')}</section></div>`;
}
export function renderLibraryRoute(vm){
  const groups=renderExerciseLibraryGroups(vm.catalog,vm.mediaMap,{role:vm.role||'coach'});
  const credit=vm.mediaMap?renderExerciseMediaCredit():'';
  return `<div class="m26-route"><section class="m26-route-intro"><div><p class="m26-eyebrow">Biblioteca visual</p><h2>Ejercicios IBERFIT</h2><p>Organizados por musculatura principal, con indicaciones y referencias visuales validadas. El catálogo sigue siendo la fuente canónica y no admite escritura libre en las sesiones.</p></div>${badge(`${vm.total} ejercicios`,'neutral')}</section><section class="m26-panel"><label>Buscar ejercicio<input type="search" data-library-search autocomplete="off" spellcheck="false" aria-describedby="m26-library-status"></label><div class="m26-library-groups" data-library-grid>${groups||emptyState('Biblioteca no cargada','No se pudo leer el catálogo local.')}</div><p id="m26-library-status" data-library-status role="status" aria-live="polite">Mostrando los ${vm.total} ejercicios del catálogo, agrupados por musculatura principal. Escribe para filtrar.</p>${credit}</section></div>`;
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
  return `<section class="m26-route-placeholder"><p class="m26-eyebrow">${escapeHtml(vm.title || 'IBERFIT')}</p><h2>${escapeHtml(vm.title || 'Módulo')}</h2><p>Esta sección no está disponible. Vuelve al menú principal.</p></section>`;
}
