const SEVERITIES = new Set(['info', 'warning', 'critical']);
const SENSITIVE = /token|password|secret|authorization|apikey|email/i;

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE.test(key)).map(([key, item]) => [key, sanitize(item)]));
}

export function createOperationalEvent(input = {}) {
  const severity = SEVERITIES.has(input.severity) ? input.severity : 'info';
  return {
    id: input.id || globalThis.crypto?.randomUUID?.() || `OP-EVENT-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    eventType: String(input.eventType || 'OPERACION_OBSERVADA'),
    severity,
    environment: 'SYNTHETIC_ONLY',
    clientId: input.clientId || null,
    sessionId: input.sessionId || null,
    operationId: input.operationId || null,
    details: sanitize(input.details || {}),
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export function operationalHealth(state = {}, runtime = {}) {
  const outbox = Number(runtime.outboxCount || 0);
  const conflicts = Number(runtime.conflictCount || 0);
  const rejected = (runtime.outbox || []).filter((item) => item.status === 'rechazada').length;
  const pendingClose = state.activeSession?.status === 'cerrada_local_pendiente_sync';
  const recovery = Boolean(state.recovery?.detected && !state.recovery?.acknowledged);
  const alerts = [];
  if (conflicts) alerts.push({ severity: 'critical', code: 'SYNC_CONFLICT', detail: `${conflicts} conflicto(s)` });
  if (rejected) alerts.push({ severity: 'critical', code: 'SYNC_REJECTED', detail: `${rejected} operación(es) rechazada(s)` });
  if (pendingClose) alerts.push({ severity: 'warning', code: 'CLOSE_PENDING', detail: 'Cierre local pendiente de ACK' });
  if (outbox) alerts.push({ severity: 'warning', code: 'OUTBOX_PENDING', detail: `${outbox} operación(es) pendientes` });
  if (recovery) alerts.push({ severity: 'warning', code: 'RECOVERY_PENDING', detail: 'Sesión recuperada sin confirmar' });
  const status = alerts.some((item) => item.severity === 'critical') ? 'intervención' : alerts.length ? 'atención' : 'estable';
  return {
    status,
    alerts,
    outbox,
    conflicts,
    rejected,
    pendingClose,
    repository: state.sync?.repositoryKind || 'desconocido',
    lastSync: state.sync?.lastResult?.at || null,
  };
}

export function appendOperationalEvent(state, event, limit = 200) {
  const next = [createOperationalEvent(event), ...(state.operationalEvents || [])].slice(0, limit);
  return { ...state, operationalEvents: next };
}

export function buildTelemetryBatch(events = [], limit = 50) {
  return events.slice(0, limit).map((event) => ({
    id: event.id,
    event_type: event.eventType,
    severity: event.severity,
    environment: event.environment,
    client_id: event.clientId,
    session_id: event.sessionId,
    operation_id: event.operationId,
    details: sanitize(event.details),
    created_at: event.createdAt,
  }));
}
