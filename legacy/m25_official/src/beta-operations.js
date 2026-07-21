const INCIDENT_LEVELS = Object.freeze({
  low: { responseHours: 48, stop: false },
  medium: { responseHours: 24, stop: false },
  high: { responseHours: 4, stop: true },
  critical: { responseHours: 1, stop: true },
});

const SENSITIVE = /password|token|secret|authorization|api.?key|refresh/i;

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE.test(key)).map(([key, item]) => [key, sanitize(item)]));
}

export function betaEnrollmentGate(input = {}) {
  const checks = {
    syntheticOnly: input.syntheticOnly === true && input.allowRealData !== true,
    releaseCandidate: input.releaseCandidateReady === true,
    privacyNotice: Boolean(input.privacyNoticeVersion),
    consent: input.consent?.accepted === true && Boolean(input.consent?.acceptedAt),
    supportOwner: Boolean(input.supportOwner),
    backup: input.backupReady === true,
    rollback: input.rollbackReady === true,
    device: Boolean(input.device?.platform && input.device?.browser),
  };
  const blockers = Object.entries(checks).filter(([, pass]) => !pass).map(([key]) => key);
  return { allowed: blockers.length === 0, blockers, checks };
}

export function createBetaParticipant(input = {}) {
  const gate = betaEnrollmentGate(input);
  if (!gate.allowed) throw new Error(`Inscripción beta bloqueada: ${gate.blockers.join(', ')}`);
  return {
    id: input.id || globalThis.crypto?.randomUUID?.() || `BETA-${Date.now()}`,
    userId: input.userId || null,
    clientId: input.clientId || null,
    role: input.role === 'coach' ? 'coach' : 'client',
    cohort: String(input.cohort || 'pilot-1'),
    environment: 'SYNTHETIC_ONLY',
    status: 'active',
    enrolledAt: input.enrolledAt || new Date().toISOString(),
    device: sanitize(input.device),
    consentVersion: String(input.privacyNoticeVersion),
    supportOwner: String(input.supportOwner),
  };
}

export function recordBetaIncident(input = {}) {
  const severity = INCIDENT_LEVELS[input.severity] ? input.severity : 'low';
  const policy = INCIDENT_LEVELS[severity];
  return {
    id: input.id || globalThis.crypto?.randomUUID?.() || `INC-${Date.now()}`,
    participantId: input.participantId || null,
    clientId: input.clientId || null,
    category: String(input.category || 'operational'),
    severity,
    summary: String(input.summary || 'Incidencia beta'),
    details: sanitize(input.details || {}),
    status: 'open',
    stopBeta: policy.stop,
    responseDueAt: new Date(Date.now() + policy.responseHours * 3600_000).toISOString(),
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export function createSessionObservation(input = {}) {
  const durationMinutes = Math.max(0, Number(input.durationMinutes || 0));
  const networkInterruptions = Math.max(0, Number(input.networkInterruptions || 0));
  const recovered = input.recovered !== false;
  const dataLoss = input.dataLoss === true;
  const closeConfirmed = input.closeConfirmed === true;
  return {
    id: input.id || globalThis.crypto?.randomUUID?.() || `OBS-${Date.now()}`,
    participantId: input.participantId || null,
    sessionId: input.sessionId || null,
    durationMinutes,
    networkInterruptions,
    recovered,
    dataLoss,
    closeConfirmed,
    pass: durationMinutes >= 20 && recovered && !dataLoss && closeConfirmed,
    notes: String(input.notes || ''),
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export function evaluateBetaCohort(input = {}) {
  const participants = input.participants || [];
  const observations = input.observations || [];
  const incidents = input.incidents || [];
  const active = participants.filter((item) => item.status === 'active').length;
  const passedSessions = observations.filter((item) => item.pass).length;
  const critical = incidents.filter((item) => item.severity === 'critical' && item.status !== 'closed').length;
  const high = incidents.filter((item) => item.severity === 'high' && item.status !== 'closed').length;
  const dataLoss = observations.filter((item) => item.dataLoss).length;
  const requiredSessions = Math.max(5, Number(input.requiredSessions || 20));
  const blockers = [];
  if (active < 3) blockers.push('cohorte-insuficiente');
  if (passedSessions < requiredSessions) blockers.push('sesiones-insuficientes');
  if (critical > 0) blockers.push('incidente-critico');
  if (high > 0) blockers.push('incidente-alto-abierto');
  if (dataLoss > 0) blockers.push('perdida-datos');
  return {
    readyForProductionCandidate: blockers.length === 0,
    activeParticipants: active,
    passedSessions,
    requiredSessions,
    critical,
    high,
    dataLoss,
    blockers,
  };
}

export function betaStopDecision(input = {}) {
  const incident = recordBetaIncident(input);
  if (incident.stopBeta) return { stop: true, reason: `${incident.severity}: ${incident.summary}`, incident };
  if (input.repeatedFailures >= 3) return { stop: true, reason: 'Tres fallas repetidas en el mismo flujo', incident };
  return { stop: false, reason: 'Continuar con observación', incident };
}

export function createSupportBundle(input = {}) {
  return {
    format: 'IBERFIT_BETA_SUPPORT_BUNDLE',
    schemaVersion: 16,
    environment: 'SYNTHETIC_ONLY',
    participantId: input.participantId || null,
    appVersion: String(input.appVersion || '0.16.0'),
    device: sanitize(input.device || {}),
    events: sanitize((input.events || []).slice(-50)),
    outboxSummary: sanitize(input.outboxSummary || {}),
    createdAt: new Date().toISOString(),
  };
}
