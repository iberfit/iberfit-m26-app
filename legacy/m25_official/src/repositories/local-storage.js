const PREFIX = 'iberfit-v12-m3';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(`${PREFIX}:${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(value));
  return value;
}

export function createLocalStorageRepository() {
  return {
    kind: 'localStorage-fallback',
    async getState() { return read('state', null); },
    async setState(value) { return write('state', value); },
    async getAuth() { return read('auth', null); },
    async setAuth(value) { return write('auth', value); },
    async clearAuth() { localStorage.removeItem(`${PREFIX}:auth`); },
    async listOutbox() { return read('outbox', []); },
    async putOutbox(value) {
      const items = read('outbox', []).filter((item) => item.operationId !== value.operationId);
      items.push(value);
      write('outbox', items);
      return value;
    },
    async removeOutbox(id) { write('outbox', read('outbox', []).filter((item) => item.operationId !== id)); },
    async clearOutbox() { write('outbox', []); },
    async listAudit() { return read('audit', []); },
    async putAudit(value) {
      const items = read('audit', []).filter((item) => item.id !== value.id);
      items.push(value);
      write('audit', items.slice(-500));
      return value;
    },
    async clearAudit() { write('audit', []); },
    async putDocument(value) {
      const items = read('documents', []).filter((item) => item.id !== value.id);
      items.push(value);
      write('documents', items);
      return value;
    },
    async listDocuments() { return read('documents', []); },
    async clearDocuments() { write('documents', []); },
  };
}
