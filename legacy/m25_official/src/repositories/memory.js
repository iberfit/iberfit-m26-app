function createBacking(seed = {}) {
  return {
    state: seed.state ? structuredClone(seed.state) : null,
    auth: seed.auth ? structuredClone(seed.auth) : null,
    outbox: new Map(), audit: new Map(), documents: new Map(),
  };
}

export function createMemoryRepository(seed = {}) {
  const backing = globalThis.__IBERFIT_TEST_MEMORY__ === true
    ? (globalThis.__IBERFIT_MEMORY_BACKING__ ||= createBacking(seed))
    : createBacking(seed);
  return {
    kind: 'memory-visual-test',
    getState: async () => structuredClone(backing.state),
    setState: async (value) => (backing.state = structuredClone(value)),
    getAuth: async () => structuredClone(backing.auth),
    setAuth: async (value) => (backing.auth = structuredClone(value)),
    clearAuth: async () => { backing.auth = null; },
    listOutbox: async () => [...backing.outbox.values()].map((value) => structuredClone(value)),
    putOutbox: async (value) => { backing.outbox.set(value.operationId, structuredClone(value)); return value; },
    removeOutbox: async (id) => { backing.outbox.delete(id); },
    clearOutbox: async () => { backing.outbox.clear(); },
    listAudit: async () => [...backing.audit.values()].map((value) => structuredClone(value)),
    putAudit: async (value) => { backing.audit.set(value.id, structuredClone(value)); return value; },
    clearAudit: async () => { backing.audit.clear(); },
    putDocument: async (value) => { backing.documents.set(value.id, structuredClone({ ...value, blob: undefined })); return value; },
    listDocuments: async () => [...backing.documents.values()].map((value) => structuredClone(value)),
    clearDocuments: async () => { backing.documents.clear(); },
  };
}
