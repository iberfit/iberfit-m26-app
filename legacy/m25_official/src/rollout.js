export const DEFAULT_ROLLOUT_WAVES = Object.freeze([
  { key: 'internal', percentage: 0, minimumHours: 24 },
  { key: 'canary', percentage: 5, minimumHours: 48 },
  { key: 'limited', percentage: 20, minimumHours: 72 },
  { key: 'expanded', percentage: 50, minimumHours: 120 },
  { key: 'general', percentage: 100, minimumHours: 168 },
]);

export function createRolloutPlan(input = {}) {
  const waves = (input.waves || DEFAULT_ROLLOUT_WAVES).map((wave, index) => ({
    order: index + 1,
    key: String(wave.key),
    percentage: Math.max(0, Math.min(100, Number(wave.percentage || 0))),
    minimumHours: Math.max(1, Number(wave.minimumHours || 24)),
    status: index === 0 ? 'ready' : 'blocked',
  }));
  return {
    id: input.id || globalThis.crypto?.randomUUID?.() || `ROLLOUT-${Date.now()}`,
    candidateVersion: String(input.candidateVersion || 'M18-LC1'),
    environment: 'SYNTHETIC_ONLY',
    productionActivation: false,
    waves,
    rollbackCheckpoint: String(input.rollbackCheckpoint || 'M17'),
    createdAt: new Date().toISOString(),
  };
}

export function rolloutHealth(input = {}) {
  const sessions = Math.max(0, Number(input.sessions || 0));
  const syncFailureRate = Math.max(0, Number(input.syncFailures || 0)) / Math.max(1, sessions);
  const crashRate = Math.max(0, Number(input.crashes || 0)) / Math.max(1, sessions);
  const dataLoss = Math.max(0, Number(input.dataLoss || 0));
  const criticalIncidents = Math.max(0, Number(input.criticalIncidents || 0));
  const p95Ms = Math.max(0, Number(input.p95InteractionMs || 0));
  const pass = dataLoss === 0 && criticalIncidents === 0 && syncFailureRate <= 0.02 && crashRate <= 0.01 && p95Ms <= 500;
  return { pass, sessions, syncFailureRate, crashRate, dataLoss, criticalIncidents, p95InteractionMs: p95Ms };
}

export function rolloutDecision(input = {}) {
  const health = rolloutHealth(input.metrics || {});
  if (input.productionApproved !== true) return { action: 'hold', reason: 'Producción no aprobada', health };
  if (!health.pass) return { action: 'rollback', reason: health.dataLoss ? 'Pérdida de datos' : health.criticalIncidents ? 'Incidente crítico' : 'Métricas fuera de umbral', health };
  if (Number(input.observedHours || 0) < Number(input.minimumHours || 24)) return { action: 'observe', reason: 'Ventana de observación incompleta', health };
  return { action: 'advance', reason: 'Umbrales y ventana aprobados', health };
}

export function featureFlagDecision(flag = {}, context = {}) {
  if (flag.enabled !== true) return { enabled: false, reason: 'Flag apagado' };
  if (flag.environment !== 'SYNTHETIC_ONLY' && context.productionApproved !== true) return { enabled: false, reason: 'Entorno no aprobado' };
  if (flag.roles?.length && !flag.roles.includes(context.role)) return { enabled: false, reason: 'Rol fuera de alcance' };
  if (flag.clientIds?.length && !flag.clientIds.includes(context.clientId)) return { enabled: false, reason: 'Cliente fuera de cohorte' };
  const percentage = Math.max(0, Math.min(100, Number(flag.percentage ?? 100)));
  const bucket = Number(context.bucket ?? 0);
  return { enabled: bucket < percentage, reason: bucket < percentage ? 'Dentro de cohorte' : 'Fuera de porcentaje' };
}

export function rollbackTrigger(input = {}) {
  const health = rolloutHealth(input);
  const reasons = [];
  if (health.dataLoss > 0) reasons.push('data-loss');
  if (health.criticalIncidents > 0) reasons.push('critical-incident');
  if (health.syncFailureRate > 0.02) reasons.push('sync-failure-rate');
  if (health.crashRate > 0.01) reasons.push('crash-rate');
  if (health.p95InteractionMs > 500) reasons.push('performance');
  return { triggered: reasons.length > 0, reasons, automaticExecution: false, requiresOwnerConfirmation: true };
}

export function simulateControlledRollout(plan, waveKey, metrics) {
  const wave = plan.waves.find((item) => item.key === waveKey);
  if (!wave) throw new Error('Ola inexistente');
  const decision = rolloutDecision({ productionApproved: false, metrics, observedHours: wave.minimumHours, minimumHours: wave.minimumHours });
  return { wave, decision, simulated: true, environment: 'SYNTHETIC_ONLY' };
}
