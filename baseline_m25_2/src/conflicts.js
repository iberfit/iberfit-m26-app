function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function diffPayload(localValue, remoteValue, prefix = '') {
  if (Object.is(localValue, remoteValue)) return [];
  if (!isPlainObject(localValue) || !isPlainObject(remoteValue)) {
    return [{ path: prefix || '$', local: localValue, remote: remoteValue }];
  }
  const keys = new Set([...Object.keys(localValue), ...Object.keys(remoteValue)]);
  return [...keys].flatMap((key) => diffPayload(localValue[key], remoteValue[key], prefix ? `${prefix}.${key}` : key));
}

export function mergeCompatiblePayload(localValue, remoteValue) {
  if (!isPlainObject(localValue) || !isPlainObject(remoteValue)) {
    return localValue === '' || localValue == null ? remoteValue : localValue;
  }
  const result = { ...remoteValue };
  for (const [key, localItem] of Object.entries(localValue)) {
    const remoteItem = remoteValue[key];
    result[key] = isPlainObject(localItem) && isPlainObject(remoteItem)
      ? mergeCompatiblePayload(localItem, remoteItem)
      : (localItem === '' || localItem == null ? remoteItem : localItem);
  }
  return result;
}

export function prepareConflictResolution(operation, strategy) {
  if (!operation?.conflict) throw new Error('La operación no contiene un conflicto');
  const remoteRevision = Number(operation.conflict.remoteRevision || 0);
  if (strategy === 'aceptar_remoto') return { action: 'discard', operationId: operation.operationId };
  if (!['conservar_local', 'fusionar'].includes(strategy)) throw new Error('Estrategia de conflicto inválida');
  const remoteSnapshot = operation.conflict.remoteSnapshot || {};
  const payload = strategy === 'fusionar'
    ? mergeCompatiblePayload(operation.payload || {}, remoteSnapshot)
    : operation.payload;
  return {
    action: 'retry',
    discardOperationId: operation.operationId,
    operation: {
      ...operation,
      operationId: undefined,
      baseRevision: remoteRevision,
      status: 'pendiente',
      attemptCount: 0,
      payload,
      conflict: undefined,
      resolution: { strategy, resolvedAt: new Date().toISOString(), previousOperationId: operation.operationId },
    },
    differences: diffPayload(operation.payload || {}, remoteSnapshot),
  };
}
