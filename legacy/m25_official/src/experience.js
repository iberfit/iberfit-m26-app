export const COACH_DESKTOP_NAV = Object.freeze([
  ['hoy', 'Hoy'],
  ['clientes', 'Clientes'],
  ['agenda', 'Agenda'],
  ['planificar', 'Planificar'],
  ['inteligencia', 'Inteligencia'],
  ['biblioteca', 'Biblioteca'],
]);

export const COACH_MOBILE_NAV = Object.freeze([
  ['hoy', 'Hoy'],
  ['clientes', 'Clientes'],
  ['agenda', 'Agenda'],
  ['entrenar', 'Sesión'],
  ['mas', 'Más'],
]);

export const COACH_MORE_NAV = Object.freeze([
  ['evaluar', 'Evaluar'],
  ['informes', 'Informes'],
  ['expediente', 'Expediente'],
  ['planificar', 'Planificar'],
  ['inteligencia', 'Inteligencia'],
  ['biblioteca', 'Biblioteca'],
  ['operacion', 'Operación'],
]);

const PRIORITY_WEIGHT = Object.freeze({ crítica: 0, alta: 1, media: 2, baja: 3 });

function item({ id, priority, title, detail, action, actionLabel }) {
  return { id, priority, title, detail, action, actionLabel };
}

export function buildCoachAttentionQueue(state, runtime = {}) {
  const items = [];
  const conflicts = Number(runtime.conflictCount || 0);
  const pending = Number(runtime.outboxCount || 0);
  const incidents = Number(state?.activeSession?.incidents?.length || 0);
  const approvedReports = (state?.reports || []).filter((report) => report.status === 'aprobado').length;
  const iriSections = state?.iriAssessment?.sections || {};
  const iriFields = Object.values(iriSections).flatMap((section) => Object.values(section || {}));
  const completedIri = iriFields.filter((value) => value !== null && value !== undefined && String(value).trim() !== '').length;
  const iriRatio = iriFields.length ? completedIri / iriFields.length : 0;

  if (conflicts > 0) items.push(item({
    id: 'conflicts', priority: 'crítica', title: `${conflicts} conflicto${conflicts === 1 ? '' : 's'} de sincronización`,
    detail: 'Existe una diferencia local/remota que requiere una decisión explícita.', action: 'coach-section:hoy', actionLabel: 'Resolver ahora',
  }));
  if (incidents > 0) items.push(item({
    id: 'incidents', priority: 'alta', title: `${incidents} incidencia${incidents === 1 ? '' : 's'} en sesión`,
    detail: 'Revisar dolor, tolerancia y contexto antes de modificar la carga.', action: 'open-field-mode', actionLabel: 'Abrir sesión',
  }));
  if (approvedReports > 0) items.push(item({
    id: 'reports', priority: 'media', title: `${approvedReports} informe${approvedReports === 1 ? '' : 's'} listo${approvedReports === 1 ? '' : 's'} para publicar`,
    detail: 'El cliente todavía no ve el contenido aprobado.', action: 'coach-section:informes', actionLabel: 'Revisar publicación',
  }));
  if (pending > 0) items.push(item({
    id: 'outbox', priority: conflicts ? 'alta' : 'media', title: `${pending} operación${pending === 1 ? '' : 'es'} pendiente${pending === 1 ? '' : 's'}`,
    detail: 'Los cambios están guardados localmente y esperan confirmación remota.', action: 'reconcile', actionLabel: 'Sincronizar',
  }));
  if (iriRatio < 1) items.push(item({
    id: 'iri', priority: 'baja', title: `IRI ${Math.round(iriRatio * 100)}% completo`,
    detail: 'Completar únicamente los datos necesarios para cerrar la lectura profesional.', action: 'coach-section:evaluar', actionLabel: 'Continuar IRI',
  }));
  if (state?.planning?.status !== 'publicado') items.push(item({
    id: 'planning', priority: 'baja', title: 'Planificación aún no publicada',
    detail: 'El cliente conserva la última versión válida hasta una publicación explícita.', action: 'coach-section:planificar', actionLabel: 'Abrir planificación',
  }));

  if (!items.length) items.push(item({
    id: 'stable', priority: 'baja', title: 'Sin intervenciones urgentes',
    detail: 'La operación está estable. El próximo paso es revisar la agenda y preparar la siguiente sesión.', action: 'coach-section:agenda', actionLabel: 'Ver agenda',
  }));

  return items.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]).slice(0, 4);
}

export function buildCoachAgenda(state) {
  const clients = state?.clients || [];
  const selected = state?.selectedClientId;
  return clients.map((client, index) => {
    const isSelected = client.id === selected;
    const modality = client.modalidad || 'Presencial';
    const execution = modality === 'Presencial' ? 'Sesión presencial' : 'Sesión guiada en app';
    const when = isSelected && state?.client?.nextSession ? state.client.nextSession : index === 1 ? 'Jueves · 19:00' : index === 2 ? 'Sábado · 10:00' : 'Pendiente de confirmar';
    return {
      id: `agenda-${client.id}`,
      clientId: client.id,
      clientName: client.name,
      modality,
      execution,
      when,
      objective: client.objective || 'Objetivo por confirmar',
      status: when === 'Pendiente de confirmar' ? 'pendiente' : 'confirmada',
    };
  });
}

export function detectAbruptRecovery(activeSession, now = new Date().toISOString()) {
  if (!activeSession) return null;
  if (!['activa', 'pausada'].includes(activeSession.status)) return null;
  const completed = (activeSession.steps || []).filter((step) => step.status === 'completada').length;
  return {
    detected: true,
    detectedAt: now,
    sessionId: activeSession.sessionId || activeSession.id || null,
    cursor: Number(activeSession.cursor || 0),
    completed,
    title: 'Sesión recuperada',
    detail: `Se restauró el progreso local: ${completed} serie${completed === 1 ? '' : 's'} completada${completed === 1 ? '' : 's'}.`,
  };
}

export function coachInteractionBudget() {
  return Object.freeze({
    frequentActionMaxTaps: 1,
    fieldPrimaryActions: ['Completar', 'Descanso', 'Incidencia'],
    analysisDepthOnly: ['IRI', 'Planificación', 'Informes', 'Inteligencia', 'Auditoría'],
  });
}
