export const REQUEST_TYPES = Object.freeze(['access', 'correction', 'export', 'restriction', 'deletion']);
export const REQUEST_STATUSES = Object.freeze(['received', 'identity_check', 'in_review', 'approved', 'rejected', 'completed']);

export function createPrivacyNotice(input = {}) {
  const purposes = Array.isArray(input.purposes) ? input.purposes.filter(Boolean) : [];
  const categories = Array.isArray(input.dataCategories) ? input.dataCategories.filter(Boolean) : [];
  if (!input.version || !input.title || purposes.length === 0 || categories.length === 0) throw new Error('Aviso de privacidad incompleto');
  return {
    version: String(input.version),
    title: String(input.title),
    locale: String(input.locale || 'es-CL'),
    purposes,
    dataCategories: categories,
    retentionSummary: String(input.retentionSummary || ''),
    contact: String(input.contact || ''),
    legalReview: input.legalReview === true,
    status: input.status === 'published' ? 'published' : 'draft',
    publishedAt: input.status === 'published' ? (input.publishedAt || new Date().toISOString()) : null,
  };
}

export function validateConsent(input = {}) {
  const scope = Array.isArray(input.scope) ? input.scope.filter(Boolean) : [];
  const blockers = [];
  if (!input.notice || input.notice.status !== 'published') blockers.push('notice-not-published');
  if (input.notice?.legalReview !== true) blockers.push('legal-review-pending');
  if (input.accepted !== true || !input.acceptedAt) blockers.push('consent-not-accepted');
  if (scope.length === 0) blockers.push('scope-empty');
  if (input.withdrawnAt) blockers.push('consent-withdrawn');
  return { valid: blockers.length === 0, blockers, scope, noticeVersion: input.notice?.version || null };
}

export function createDataSubjectRequest(input = {}) {
  if (!REQUEST_TYPES.includes(input.type)) throw new Error('Tipo de solicitud no válido');
  return {
    id: input.id || globalThis.crypto?.randomUUID?.() || `DSR-${Date.now()}`,
    userId: input.userId || null,
    clientId: input.clientId || null,
    type: input.type,
    status: 'received',
    identityVerified: false,
    notes: String(input.notes || ''),
    requestedAt: input.requestedAt || new Date().toISOString(),
    completedAt: null,
  };
}

export function transitionDataSubjectRequest(request, nextStatus, actorRole = 'client') {
  if (!REQUEST_STATUSES.includes(nextStatus)) throw new Error('Estado no válido');
  const currentIndex = REQUEST_STATUSES.indexOf(request.status);
  const nextIndex = REQUEST_STATUSES.indexOf(nextStatus);
  if (nextIndex < currentIndex && nextStatus !== 'rejected') throw new Error('No se puede retroceder la solicitud');
  if (['approved', 'rejected', 'completed'].includes(nextStatus) && actorRole !== 'admin') throw new Error('Solo administración puede resolver la solicitud');
  if (nextStatus === 'approved' && !request.identityVerified) throw new Error('Identidad no verificada');
  return { ...request, status: nextStatus, completedAt: nextStatus === 'completed' ? new Date().toISOString() : request.completedAt };
}

export function retentionDecision(input = {}) {
  const createdAt = new Date(input.createdAt || 0).getTime();
  const retentionDays = Math.max(1, Number(input.retentionDays || 365));
  const dueAt = createdAt + retentionDays * 86400_000;
  const due = Number.isFinite(dueAt) && dueAt <= Number(input.now || Date.now());
  const legalHold = input.legalHold === true;
  const pendingRequest = input.pendingRequest === true;
  return {
    due,
    eligible: due && !legalHold && !pendingRequest,
    action: due && !legalHold && !pendingRequest ? 'review-for-deletion' : 'retain',
    automaticDeletion: false,
    reason: legalHold ? 'legal-hold' : pendingRequest ? 'request-pending' : due ? 'retention-expired' : 'within-retention',
  };
}

export function accountLifecycleDecision(input = {}) {
  const outbox = Number(input.outboxCount || 0);
  const activeSession = input.activeSession === true;
  const openRequests = Number(input.openRequests || 0);
  if (input.action === 'delete' && (outbox > 0 || activeSession || openRequests > 0)) return { allowed: false, reason: 'Trabajo o solicitudes pendientes' };
  if (input.action === 'delete' && input.adminApproved !== true) return { allowed: false, reason: 'Aprobación administrativa requerida' };
  if (input.action === 'suspend') return { allowed: true, reversible: true, reason: 'Suspensión reversible' };
  if (input.action === 'delete') return { allowed: true, reversible: false, reason: 'Borrado sujeto a respaldo y retención' };
  return { allowed: false, reason: 'Acción no válida' };
}

export function incidentResponsePlan(input = {}) {
  const severity = ['low','medium','high','critical'].includes(input.severity) ? input.severity : 'low';
  const dueHours = { low: 72, medium: 24, high: 4, critical: 1 }[severity];
  return {
    severity,
    freezeWrites: severity === 'critical',
    notifyOwner: ['high','critical'].includes(severity),
    preserveEvidence: true,
    rotateCredentials: Boolean(input.credentialExposure),
    responseDueAt: new Date(Date.now() + dueHours * 3600_000).toISOString(),
    steps: ['Contener', 'Preservar evidencia', 'Evaluar alcance', 'Mitigar', 'Validar recuperación', 'Documentar cierre'],
  };
}
