export const APPEND_ONLY_TYPES = new Set([
  'SERIE_COMPLETADA',
  'INCIDENCIA_REGISTRADA',
  'CHECKIN_REGISTRADO',
  'FEEDBACK_REGISTRADO',
  'SESION_INICIADA',
  'SESION_CERRADA',
  'EJERCICIO_OMITIDO',
  'EJERCICIO_REEMPLAZADO',
  'DESCANSO_EDITADO',
  'INTELIGENCIA_APROBADA',
  'INTELIGENCIA_DESCARTADA',
]);

export function createOperationEnvelope(operation, options = {}) {
  if (!operation?.type) throw new Error('La operación necesita tipo');
  const operationId = options.operationId || globalThis.crypto?.randomUUID?.() || `op-${Date.now()}-${Math.random()}`;
  return {
    operationId,
    type: operation.type,
    entityType: operation.entityType || 'unknown',
    entityId: operation.entityId || 'unknown',
    baseRevision: Number(operation.baseRevision ?? 0),
    localSequence: Number(options.localSequence ?? 0),
    conflictSensitive: operation.conflictSensitive ?? !APPEND_ONLY_TYPES.has(operation.type),
    clientId: operation.clientId || operation.payload?.clientId || null,
    payload: operation.payload ?? null,
    createdAt: options.createdAt || new Date().toISOString(),
    status: 'pendiente',
    attemptCount: Number(options.attemptCount || 0),
  };
}

export function applyReconcileResult(queue, result) {
  const ackIds = new Set((result.ack || []).map((item) => item.operationId));
  const conflictMap = new Map((result.conflicts || []).map((item) => [item.operationId, item]));
  const rejectedMap = new Map((result.rejected || []).map((item) => [item.operationId, item]));
  const remaining = [];

  for (const item of queue) {
    if (ackIds.has(item.operationId)) continue;
    const conflict = conflictMap.get(item.operationId);
    if (conflict) {
      remaining.push({ ...item, status: 'conflicto', conflict, attemptCount: Number(item.attemptCount || 0) + 1 });
      continue;
    }
    const rejected = rejectedMap.get(item.operationId);
    if (rejected) {
      remaining.push({ ...item, status: 'rechazada', rejection: rejected, attemptCount: Number(item.attemptCount || 0) + 1 });
      continue;
    }
    remaining.push({ ...item, attemptCount: Number(item.attemptCount || 0) + 1 });
  }

  return { remaining, ack: result.ack || [], conflicts: result.conflicts || [], rejected: result.rejected || [] };
}

/**
 * Reconciliación determinista local para pruebas puras.
 * El navegador usa /api/sync/reconcile, pero esta función preserva un modelo verificable.
 */
export function reconcileOperations(queue, remoteRevisions = {}, processedOperationIds = new Set()) {
  const revisions = { ...remoteRevisions };
  const synced = [];
  const conflicts = [];

  for (const operation of queue) {
    if (processedOperationIds.has(operation.operationId)) {
      synced.push({ ...operation, status: 'sincronizada', duplicate: true });
      continue;
    }
    const key = `${operation.entityType}:${operation.entityId}`;
    const remoteRevision = Number(revisions[key] ?? 0);
    const attempted = { ...operation, attemptCount: Number(operation.attemptCount || 0) + 1 };
    if (attempted.conflictSensitive && attempted.baseRevision !== remoteRevision) {
      conflicts.push({
        ...attempted,
        status: 'conflicto',
        conflict: { remoteRevision, localBaseRevision: attempted.baseRevision, reason: 'La entidad remota cambió desde la última lectura.' },
      });
      continue;
    }
    const nextRevision = attempted.conflictSensitive ? remoteRevision + 1 : remoteRevision;
    if (attempted.conflictSensitive) revisions[key] = nextRevision;
    synced.push({ ...attempted, status: 'sincronizada', remoteRevision: nextRevision, appendOnly: !attempted.conflictSensitive });
  }
  return { synced, conflicts, remoteRevisions: revisions };
}
