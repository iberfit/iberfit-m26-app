export const PRODUCTION_REQUIRED_GATES = Object.freeze([
  'release-candidate-clean',
  'beta-evidence',
  'security-advisor-clean',
  'rls-auth-storage',
  'backup-restore-drill',
  'rollback-drill',
  'observability-alerting',
  'incident-response',
  'privacy-legal-review',
  'consent-approved',
  'retention-approved',
  'account-recovery',
  'physical-ios',
  'physical-android',
  'physical-tablet',
  'two-device-real-conflict',
  'long-session-network',
  'support-trained',
  'domain-tls-email',
  'migration-dry-run',
]);

export function evaluateProductionCandidate(input = {}) {
  const checks = PRODUCTION_REQUIRED_GATES.map((key) => ({ key, pass: input.gates?.[key] === true }));
  const blockers = checks.filter((item) => !item.pass).map((item) => item.key);
  if (input.realDataApproved !== true) blockers.unshift('real-data-not-approved');
  if (input.productionEnabled !== true) blockers.unshift('production-runtime-disabled');
  return {
    ready: blockers.length === 0,
    status: blockers.length === 0 ? 'production_candidate_ready' : 'blocked',
    environment: input.productionEnabled === true ? 'PRODUCTION_REQUESTED' : 'SYNTHETIC_ONLY',
    passed: checks.filter((item) => item.pass).length,
    total: checks.length,
    blockers: [...new Set(blockers)],
    checks,
  };
}

export function productionRuntimeGuard(config = {}, approvals = {}) {
  if (config.productionEnabled !== true) return { allowed: false, reason: 'Producción deshabilitada por configuración' };
  if (config.syntheticOnly === true) return { allowed: false, reason: 'Gate SYNTHETIC_ONLY activo' };
  if (config.allowRealData !== true) return { allowed: false, reason: 'Datos reales no autorizados' };
  if (approvals.owner !== true || approvals.technical !== true || approvals.privacy !== true) return { allowed: false, reason: 'Aprobaciones incompletas' };
  if (approvals.candidateReady !== true) return { allowed: false, reason: 'Production Candidate no aprobado' };
  return { allowed: true, reason: 'Activación productiva explícitamente aprobada' };
}

export function buildGoLivePacket(input = {}) {
  const evaluation = evaluateProductionCandidate(input);
  return {
    format: 'IBERFIT_GO_LIVE_PACKET',
    schemaVersion: 17,
    candidateVersion: String(input.candidateVersion || 'M17-PC1'),
    generatedAt: new Date().toISOString(),
    evaluation,
    rollbackCheckpoint: String(input.rollbackCheckpoint || 'M16'),
    owners: input.owners || {},
    approvals: input.approvals || {},
    productionActivationIncluded: false,
    notes: ['Este paquete prepara la decisión; no activa producción.', ...(input.notes || [])],
  };
}

export function migrationDryRunResult(input = {}) {
  const destructive = Boolean(input.sql && /\b(drop|truncate)\s+(table|schema)|delete\s+from/i.test(input.sql));
  const hasRollback = Array.isArray(input.rollbackSteps) && input.rollbackSteps.length > 0;
  const backupVerified = input.backupVerified === true;
  return { pass: !destructive && hasRollback && backupVerified, destructive, hasRollback, backupVerified };
}
