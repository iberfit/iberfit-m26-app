export const HANDOVER_AREAS = Object.freeze(['producto','soporte','seguridad','respaldo','incidentes','privacidad','operación']);

export function buildOperationalHandover(input = {}) {
  const owners = input.owners || {};
  const areas = HANDOVER_AREAS.map((area) => ({ area, owner: owners[area] || null, trained: input.training?.[area] === true, runbook: input.runbooks?.[area] || null }));
  const blockers = areas.filter((item) => !item.owner || !item.trained || !item.runbook).map((item) => item.area);
  return { ready: blockers.length === 0, areas, blockers, generatedAt: new Date().toISOString() };
}

export function supportCoverage(input = {}) {
  const hours = Math.max(0, Number(input.coverageHoursPerDay || 0));
  const responseMinutes = Math.max(0, Number(input.criticalResponseMinutes || 0));
  const backupContact = Boolean(input.backupContact);
  const ready = hours >= 8 && responseMinutes > 0 && responseMinutes <= 60 && backupContact;
  return { ready, coverageHoursPerDay: hours, criticalResponseMinutes: responseMinutes, backupContact };
}

export function launchDecisionRecord(input = {}) {
  return {
    format: 'IBERFIT_LAUNCH_DECISION',
    schemaVersion: 18,
    candidateVersion: String(input.candidateVersion || 'M18-LC1'),
    decision: ['go','hold','no-go'].includes(input.decision) ? input.decision : 'hold',
    environment: 'SYNTHETIC_ONLY',
    productionActivated: false,
    evidence: input.evidence || {},
    approvers: input.approvers || {},
    createdAt: new Date().toISOString(),
  };
}

export function controlledActivationGuard(input = {}) {
  if (input.decision !== 'go') return { allowed: false, reason: 'Decisión Go-Live no aprobada' };
  if (input.productionCandidateReady !== true) return { allowed: false, reason: 'Production Candidate incompleto' };
  if (input.handoverReady !== true || input.supportReady !== true) return { allowed: false, reason: 'Operación o soporte incompleto' };
  if (input.ownerConfirmed !== true) return { allowed: false, reason: 'Confirmación final del propietario pendiente' };
  if (input.runtimeProductionEnabled !== true) return { allowed: false, reason: 'Runtime productivo deshabilitado' };
  return { allowed: true, reason: 'Activación controlada autorizada' };
}
