export const CHAOS_SCENARIOS = Object.freeze([
  'offline-start', 'transient-503', 'timeout', 'duplicate-ack', 'stale-revision', 'crash-after-save',
]);

function seeded(seed = 14) {
  let value = Number(seed) || 14;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

export function createChaosPlan(options = {}) {
  const random = seeded(options.seed || 14);
  const count = Math.max(1, Math.min(Number(options.count || 6), CHAOS_SCENARIOS.length));
  return CHAOS_SCENARIOS.slice().sort(() => random() - 0.5).slice(0, count).map((scenario, index) => ({
    id: `CHAOS-${String(index + 1).padStart(2, '0')}`,
    scenario,
    expected: scenario === 'duplicate-ack' ? 'idempotent' : scenario === 'stale-revision' ? 'conflict-visible' : 'recoverable',
  }));
}

export function evaluateChaosOutcome(plan, observations = {}) {
  const checks = plan.map((item) => {
    const observed = observations[item.scenario];
    let pass = false;
    if (item.scenario === 'offline-start') pass = observed?.queued === true && observed?.dataLost !== true;
    else if (item.scenario === 'transient-503' || item.scenario === 'timeout') pass = observed?.retried === true && observed?.dataLost !== true;
    else if (item.scenario === 'duplicate-ack') pass = observed?.effects === 1 && observed?.duplicate === true;
    else if (item.scenario === 'stale-revision') pass = observed?.conflictVisible === true && observed?.overwritten !== true;
    else if (item.scenario === 'crash-after-save') pass = observed?.recovered === true && observed?.dataLost !== true;
    return { ...item, pass, observed: observed || null };
  });
  return { pass: checks.every((item) => item.pass), checks };
}

export function simulateOutboxChaos(operations = [], options = {}) {
  const unique = new Map();
  for (const operation of operations) if (!unique.has(operation.operationId)) unique.set(operation.operationId, operation);
  const duplicateId = operations[0]?.operationId || null;
  return {
    queued: operations.length,
    uniqueEffects: unique.size,
    duplicateId,
    retryOrder: [...unique.values()].sort((a, b) => Number(a.localSequence || 0) - Number(b.localSequence || 0)).map((item) => item.operationId),
    latencyMs: Number(options.latencyMs || 850),
    dataLost: false,
  };
}
