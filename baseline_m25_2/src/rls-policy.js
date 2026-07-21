const CLIENT_VISIBLE_PUBLICATION_TABLES = new Set(['client_app_profiles', 'training_cycles', 'sessions']);
const COACH_CLIENT_TABLES = new Set([
  'clients', 'client_app_profiles', 'training_cycles', 'sessions', 'session_events',
  'session_executions', 'iri_assessments', 'reports', 'documents', 'intelligence_runs',
  'plan_change_proposals', 'client_timeline_events',
]);
const CLIENT_SESSION_EVENT_TYPES = new Set([
  'SESION_INICIADA', 'SERIE_COMPLETADA', 'INCIDENCIA_REGISTRADA', 'CHECKIN_REGISTRADO',
  'FEEDBACK_REGISTRADO', 'SESION_CERRADA', 'EJERCICIO_OMITIDO', 'EJERCICIO_REEMPLAZADO',
  'EJERCICIO_AÑADIDO', 'DESCANSO_EDITADO',
]);

function assigned(actor, clientId, assignments) {
  return assignments.some((item) => item.coachUserId === actor.id && item.clientId === clientId && item.active !== false);
}

function result(allowed, code, detail) {
  return { allowed, code, detail };
}

export function evaluateRlsAccess({ actor, action = 'select', table, row = {}, assignments = [] } = {}) {
  if (!actor?.id || !actor?.role) return result(false, 'NO_AUTH', 'Sesión no autenticada');
  if (!table) return result(false, 'NO_TABLE', 'Tabla no indicada');
  if (actor.role === 'admin') return result(true, 'ADMIN', 'Administrador autorizado');

  const clientId = row.clientId || row.client_id || (table === 'clients' ? row.id : null);

  if (actor.role === 'cliente') {
    if (!actor.clientId || clientId !== actor.clientId) return result(false, 'CROSS_CLIENT', 'El cliente solo accede a su propio expediente');
    if (table === 'clients' && action === 'select') return result(true, 'CLIENT_SELF', 'Ficha propia');
    if (CLIENT_VISIBLE_PUBLICATION_TABLES.has(table) && action === 'select') {
      return row.status === 'publicado'
        ? result(true, 'CLIENT_PUBLISHED', 'Contenido publicado para el cliente')
        : result(false, 'DRAFT_HIDDEN', 'Los borradores internos no son visibles');
    }
    if (table === 'reports' && action === 'select') {
      return row.status === 'publicado' && row.audience === 'cliente'
        ? result(true, 'CLIENT_REPORT', 'Informe publicado para Cliente')
        : result(false, 'REPORT_HIDDEN', 'Informe no publicado o de audiencia interna');
    }
    if (table === 'documents' && action === 'select') {
      return row.status === 'publicado' && row.audience === 'cliente'
        ? result(true, 'CLIENT_DOCUMENT', 'Documento publicado para Cliente')
        : result(false, 'DOCUMENT_HIDDEN', 'Documento interno o no publicado');
    }
    if (table === 'client_timeline_events' && action === 'select') {
      return row.visibility === 'cliente' && row.published === true
        ? result(true, 'CLIENT_TIMELINE', 'Evento publicado en expediente')
        : result(false, 'TIMELINE_HIDDEN', 'Evento interno');
    }
    if (table === 'session_events' && action === 'insert') {
      return CLIENT_SESSION_EVENT_TYPES.has(row.eventType || row.event_type)
        ? result(true, 'CLIENT_SESSION_EVENT', 'Evento de ejecución permitido')
        : result(false, 'EVENT_FORBIDDEN', 'Evento no permitido para Cliente');
    }
    if (table === 'session_events' && action === 'select') return result(true, 'CLIENT_SESSION_READ', 'Historial de ejecución propio');
    if (table === 'session_executions' && ['select', 'insert'].includes(action)) return result(true, 'CLIENT_EXECUTION', 'Ejecución propia');
    return result(false, 'CLIENT_FORBIDDEN', 'Recurso interno no accesible al Cliente');
  }

  if (actor.role === 'coach') {
    if (table === 'client_assignments' && action === 'select') return result(true, 'COACH_ASSIGNMENTS', 'Asignaciones propias');
    if (table === 'audit_events') return result(false, 'AUDIT_ADMIN_ONLY', 'La auditoría global es administrativa');
    if (!COACH_CLIENT_TABLES.has(table)) return result(false, 'COACH_TABLE_FORBIDDEN', 'Recurso fuera del ámbito Coach');
    if (!clientId) return result(false, 'CLIENT_REQUIRED', 'La operación Coach necesita clientId');
    return assigned(actor, clientId, assignments)
      ? result(true, 'COACH_ASSIGNED', 'Coach asignado al cliente')
      : result(false, 'COACH_NOT_ASSIGNED', 'Coach no asignado al cliente');
  }

  return result(false, 'ROLE_UNKNOWN', 'Rol no reconocido');
}

export function defaultSyntheticAssignments() {
  return [
    { coachUserId: 'USR-COACH-001', clientId: 'CLI-DEMO-001', active: true },
    { coachUserId: 'USR-COACH-001', clientId: 'CLI-DEMO-002', active: true },
  ];
}

export { CLIENT_SESSION_EVENT_TYPES };
