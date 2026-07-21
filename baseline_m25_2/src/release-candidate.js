export const RC_REQUIRED_GATES = Object.freeze([
  'synthetic-only',
  'private-preview',
  'auth-rls-e2e',
  'storage-private',
  'backup-restore',
  'chaos-offline',
  'two-device-conflict',
  'pwa-safe-update',
  'rollback-drill',
  'observability',
  'accessibility-smoke',
  'performance-budget',
]);

function bool(value) { return value === true; }

export function privatePreviewGate(input = {}) {
  if (input.syntheticOnly !== true || input.allowRealData === true) return { allowed: false, reason: 'Gate 0 bloqueó el preview' };
  if (input.preview !== true) return { allowed: false, reason: 'Preview no solicitado' };
  if (input.audience !== 'interno') return { allowed: false, reason: 'Audiencia no autorizada' };
  if (!input.authenticated) return { allowed: false, reason: 'Autenticación requerida' };
  if (!input.grant || input.grant.active !== true) return { allowed: false, reason: 'Acceso privado no concedido' };
  if (input.grant.expiresAt && new Date(input.grant.expiresAt).getTime() <= Date.now()) return { allowed: false, reason: 'Acceso privado expirado' };
  return { allowed: true, reason: 'Preview privado sintético autorizado' };
}

export function evaluateReleaseCandidate(gates = {}) {
  const checks = RC_REQUIRED_GATES.map((key) => ({ key, pass: bool(gates[key]), detail: bool(gates[key]) ? 'Aprobado' : 'Pendiente' }));
  const blockers = checks.filter((item) => !item.pass).map((item) => item.key);
  return {
    ready: blockers.length === 0,
    passed: checks.length - blockers.length,
    total: checks.length,
    blockers,
    checks,
    environment: 'SYNTHETIC_ONLY',
  };
}

export function buildReleaseCandidate(input = {}) {
  const evaluation = evaluateReleaseCandidate(input.gates || {});
  return {
    id: input.id || globalThis.crypto?.randomUUID?.() || `RC-${Date.now()}`,
    version: String(input.version || 'M15-RC1'),
    environment: 'SYNTHETIC_ONLY',
    status: evaluation.ready ? 'candidate_ready' : 'blocked',
    createdAt: input.createdAt || new Date().toISOString(),
    sourceMilestone: Number(input.sourceMilestone || 15),
    evaluation,
    notes: Array.isArray(input.notes) ? input.notes : [],
  };
}

export function simulateTwoDeviceConflict(input = {}) {
  const baseRevision = Number(input.baseRevision || 0);
  const deviceA = { deviceId: input.deviceA?.deviceId || 'device-a', value: input.deviceA?.value, baseRevision };
  const deviceB = { deviceId: input.deviceB?.deviceId || 'device-b', value: input.deviceB?.value, baseRevision };
  const remoteAfterA = baseRevision + 1;
  return {
    winner: deviceA.deviceId,
    remoteRevision: remoteAfterA,
    accepted: [{ ...deviceA, appliedRevision: remoteAfterA }],
    conflicts: [{
      ...deviceB,
      remoteRevision: remoteAfterA,
      reason: 'La entidad remota cambió desde la lectura del segundo dispositivo.',
      remoteSnapshot: { value: deviceA.value },
      localSnapshot: { value: deviceB.value },
    }],
    silentOverwrite: false,
  };
}

export function pwaUpdateDecision(input = {}) {
  if (!input.waitingWorker) return { action: 'none', safe: true, reason: 'No hay actualización pendiente' };
  if (input.activeSession === true) return { action: 'defer', safe: false, reason: 'Sesión activa protegida' };
  if (Number(input.outboxCount || 0) > 0) return { action: 'defer', safe: false, reason: 'Outbox pendiente' };
  if (input.localClosePending === true) return { action: 'defer', safe: false, reason: 'Cierre local pendiente de ACK' };
  return { action: 'activate', safe: true, reason: 'Actualización segura' };
}

export function buildRollbackPlan(input = {}) {
  const checkpoint = String(input.checkpoint || '').trim();
  if (!checkpoint) throw new Error('Se requiere checkpoint de rollback');
  return {
    checkpoint,
    environment: 'SYNTHETIC_ONLY',
    steps: [
      'Congelar nuevas escrituras no esenciales',
      'Exportar respaldo local y manifiesto remoto',
      'Revertir artefacto de aplicación al checkpoint',
      'No revertir eventos append-only',
      'Verificar RLS, Auth, Storage y Outbox',
      'Reabrir el acceso solo después del smoke test',
    ],
    preserves: ['session_events', 'sync_events', 'audit_events', 'outbox_receipts'],
    destructive: false,
  };
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createReleaseManifest(candidate, artifacts = []) {
  const normalized = {
    format: 'IBERFIT_RELEASE_MANIFEST',
    schemaVersion: 15,
    environment: 'SYNTHETIC_ONLY',
    candidateId: candidate.id,
    version: candidate.version,
    status: candidate.status,
    artifacts: artifacts.map((item) => ({ name: String(item.name), sha256: String(item.sha256), bytes: Number(item.bytes || 0) })),
    createdAt: new Date().toISOString(),
  };
  const checksum = await sha256Hex(JSON.stringify(normalized));
  return { ...normalized, checksum };
}
