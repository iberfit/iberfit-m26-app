import { M26_COMMAND_REGISTRY, validateCommandAgainstRegistry } from './command-catalog.js';
const COMMAND_PATTERN = /^[A-ZÁÉÍÓÚÑ0-9_]+$/u;
const ENTITY_PATTERN = /^[a-z_]+$/;

function uuid() {
  return globalThis.crypto?.randomUUID?.() || `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
}

export function createCommand(input = {}, { registry=M26_COMMAND_REGISTRY, role=null } = {}) {
  const command = {
    operationId: input.operationId || uuid(),
    type: String(input.type || ''),
    entityType: String(input.entityType || ''),
    entityId: input.entityId || uuid(),
    clientId: input.clientId || null,
    baseRevision: Number(input.baseRevision || 0),
    conflictSensitive: input.conflictSensitive !== false,
    reason: input.reason || null,
    previewAccepted: input.previewAccepted === true,
    payload: input.payload && typeof input.payload === 'object' ? structuredClone(input.payload) : {},
  };
  validateCommand(command,{registry,role});
  return Object.freeze(command);
}

export function validateCommand(command,{registry=M26_COMMAND_REGISTRY,role=null}={}) {
  if (!command?.operationId) throw new Error('M26_OPERATION_ID_REQUIRED');
  if (!COMMAND_PATTERN.test(command.type)) throw new Error('M26_COMMAND_TYPE_INVALID');
  if (!ENTITY_PATTERN.test(command.entityType)) throw new Error('M26_ENTITY_TYPE_INVALID');
  if (!command.entityId || !command.clientId) throw new Error('M26_ENTITY_AND_CLIENT_REQUIRED');
  if (!Number.isInteger(command.baseRevision) || command.baseRevision < 0) throw new Error('M26_BASE_REVISION_INVALID');
  const registryCheck=validateCommandAgainstRegistry(command,role,registry);
  if(!registryCheck.ok) throw new Error(`M26_COMMAND_CONTRACT_INVALID:${registryCheck.errors.join(',')}`);
  return command;
}

export function sanitizeOperation(operation) {
  return {
    operationId: operation.operationId,
    type: operation.type,
    entityType: operation.entityType,
    entityId: operation.entityId,
    clientId: operation.clientId,
    baseRevision: operation.baseRevision,
    status: operation.status,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    errorCode: operation.errorCode || null,
    retryable: operation.retryable !== false,
  };
}

export function createCommandBus({ transport, repository, getToken, rehydrate, registry=M26_COMMAND_REGISTRY, getRole=()=>null }) {
  if (!transport?.preflight || !transport?.execute) throw new Error('M26_TRANSPORT_REQUIRED');
  if (!repository?.put || !repository?.remove || !repository?.list) throw new Error('M26_OPERATION_REPOSITORY_REQUIRED');
  if (typeof getToken !== 'function') throw new Error('M26_TOKEN_PROVIDER_REQUIRED');

  async function persist(command, status, extra = {}) {
    const now = new Date().toISOString();
    const record = {
      ...structuredClone(command),
      status,
      createdAt: extra.createdAt || now,
      updatedAt: now,
      ...extra,
    };
    await repository.put(record);
    return record;
  }

  async function preflight(commandInput) {
    const command = createCommand(commandInput,{registry,role:getRole?.()});
    const token = await getToken();
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    const response = await transport.preflight(token, command);
    return { command, response };
  }

  async function enqueue(commandInput) {
    const command = createCommand(commandInput,{registry,role:getRole?.()});
    const queued = await persist(command, 'pending', { retryable: true, queuedOffline: true });
    return { ok: false, queued: true, kind: 'queued', command: sanitizeOperation(queued), response: null };
  }

  async function execute(commandInput) {
    const command = createCommand(commandInput,{registry,role:getRole?.()});
    const token = await getToken();
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    const queued = await persist(command, 'pending');
    try {
      const response = await transport.execute(token, command);
      const kind = String(response?.kind || response?.status || '').toLowerCase();
      if (kind === 'ack' || kind === 'duplicate') {
        await repository.remove(command.operationId);
        if (typeof rehydrate === 'function') await rehydrate({ reason: kind, response });
        return { ok: true, kind, command: sanitizeOperation({ ...queued, status: 'ack' }), response };
      }
      if (kind === 'conflict') {
        const conflict = await persist(command, 'conflict', { response, errorCode: response?.reason || 'REVISION_CONFLICT', retryable: false });
        return { ok: false, kind: 'conflict', command: sanitizeOperation(conflict), response };
      }
      const rejected = await persist(command, 'rejected', { response, errorCode: response?.reason || 'REJECTED', retryable: false });
      return { ok: false, kind: 'rejected', command: sanitizeOperation(rejected), response };
    } catch (error) {
      const retryable = ![400, 401, 403, 409, 422].includes(Number(error?.status));
      const record = await persist(command, retryable ? 'pending' : 'rejected', {
        errorCode: error?.body?.code || error?.message || 'M26_COMMAND_ERROR',
        retryable,
      });
      error.operation = sanitizeOperation(record);
      throw error;
    }
  }

  async function pending() {
    return (await repository.list()).map(sanitizeOperation);
  }

  async function retry(operationId) {
    const records = await repository.list();
    const record = records.find((item) => item.operationId === operationId);
    if (!record) throw new Error('M26_OPERATION_NOT_FOUND');
    if (record.status === 'conflict' || record.retryable === false) throw new Error('M26_OPERATION_NOT_RETRYABLE');
    return execute(record);
  }

  async function flushPending({ limit = 20, stopOnConflict = true } = {}) {
    const records = (await repository.list()).filter((item) => item.status === 'pending' && item.retryable !== false).slice(0, Math.max(0, Number(limit || 0)));
    const results = [];
    for (const record of records) {
      try {
        const result = await execute(record);
        results.push(result);
        if (stopOnConflict && result?.kind === 'conflict') break;
      } catch (error) {
        results.push({ ok: false, kind: 'network_error', operationId: record.operationId, error: error.message });
        break;
      }
    }
    return { online: true, attempted: results.length, results };
  }

  return Object.freeze({ preflight, execute, enqueue, pending, retry, flushPending });
}

export function createMemoryOperationRepository() {
  const records = new Map();
  return {
    async put(record) { records.set(record.operationId, structuredClone(record)); },
    async get(operationId) { const value=records.get(operationId); return value?structuredClone(value):null; },
    async remove(operationId) { records.delete(operationId); },
    async list() { return [...records.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).map((record) => structuredClone(record)); },
  };
}
