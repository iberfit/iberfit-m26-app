// IBERFIT V12 M6 · Expediente cronológico del cliente
// Unifica señales relevantes sin mezclar borradores internos con contenido visible al cliente.

export const EXPEDIENTE_VISIBILITY = Object.freeze({
  coach: ['coach', 'cliente'],
  cliente: ['cliente'],
  admin: ['coach', 'cliente', 'sistema'],
});

function dateValue(item) {
  return new Date(item.at || item.createdAt || item.publishedAt || item.measuredAt || item.date || 0).getTime();
}

export function createTimelineEvent({ id, clientId, type, title, summary, at, visibility = 'coach', sourceId, status = 'registrado', priority = 'normal', payload = {} }) {
  if (!clientId) throw new Error('Expediente requiere clientId');
  if (!type || !title) throw new Error('Expediente requiere tipo y título');
  return {
    id: id || `TL-${type}-${sourceId || Date.now()}`,
    clientId,
    type,
    title,
    summary: summary || '',
    at: at || new Date().toISOString(),
    visibility,
    sourceId: sourceId || null,
    status,
    priority,
    payload,
  };
}

export function buildClientTimeline({ client, sessions = [], reports = [], documents = [], iriAssessments = [], audit = [] }) {
  const clientId = client?.id;
  const events = [];
  if (!clientId) return events;
  events.push(createTimelineEvent({ clientId, type: 'cliente', title: 'Cliente creado en IBERFIT', summary: `${client.name} · modalidad ${client.modalidad}`, at: client.createdAt || '2026-07-01T10:00:00.000Z', visibility: 'coach', sourceId: clientId }));

  for (const session of sessions.filter((s) => !s.clientId || s.clientId === clientId)) {
    events.push(createTimelineEvent({ clientId, type: 'sesion', title: session.title || 'Sesión registrada', summary: `${session.type || session.execution_type || 'sesión'} · ${session.status || 'registrada'}`, at: session.closedAt || session.publishedAt || session.createdAt || new Date().toISOString(), visibility: session.status === 'publicado' || session.status === 'cerrada' ? 'cliente' : 'coach', sourceId: session.id, status: session.status || 'registrado' }));
  }

  for (const report of reports.filter((r) => !r.clientId || r.clientId === clientId)) {
    const visible = report.status === 'publicado' && (report.audience || 'cliente') === 'cliente' ? 'cliente' : 'coach';
    events.push(createTimelineEvent({ clientId, type: 'informe', title: report.title, summary: report.summary, at: report.publishedAt || report.createdAt || new Date().toISOString(), visibility: visible, sourceId: report.id, status: report.status || 'borrador' }));
  }

  for (const document of documents.filter((d) => !d.clientId || d.clientId === clientId)) {
    const visible = document.status === 'publicado' && document.audience === 'cliente' ? 'cliente' : 'coach';
    events.push(createTimelineEvent({ clientId, type: 'documento', title: document.title, summary: `${document.type || 'documento'} · versión ${document.version || 1}`, at: document.measuredAt || document.createdAt || new Date().toISOString(), visibility: visible, sourceId: document.id, status: document.status || 'interno' }));
  }

  for (const iri of iriAssessments.filter((i) => !i.clientId || i.clientId === clientId)) {
    events.push(createTimelineEvent({ clientId, type: 'iri', title: 'Diagnóstico IRI', summary: iri.status === 'aprobado' ? 'Evaluación aprobada y lista para informe' : 'Evaluación en construcción', at: iri.approvedAt || iri.updatedAt || new Date().toISOString(), visibility: iri.status === 'aprobado' ? 'cliente' : 'coach', sourceId: iri.id, status: iri.status || 'borrador', priority: iri.status === 'aprobado' ? 'alta' : 'normal' }));
  }

  for (const item of audit.filter((a) => !a.clientId || a.clientId === clientId).slice(0, 20)) {
    events.push(createTimelineEvent({ clientId, type: 'auditoria', title: item.type || 'Evento de auditoría', summary: item.reason || item.entityKey || '', at: item.at || new Date().toISOString(), visibility: 'sistema', sourceId: item.id || item.operationId, status: 'auditado' }));
  }

  return events.sort((a, b) => dateValue(b) - dateValue(a));
}

export function filterTimelineForRole(events, role) {
  const allowed = EXPEDIENTE_VISIBILITY[role] || [];
  return events.filter((event) => allowed.includes(event.visibility));
}

export function timelineSummary(events) {
  return events.reduce((acc, item) => {
    acc.total += 1;
    acc.byType[item.type] = (acc.byType[item.type] || 0) + 1;
    if (item.priority === 'alta') acc.highPriority += 1;
    return acc;
  }, { total: 0, highPriority: 0, byType: {} });
}
