const DB_NAME = 'iberfit-v12-local-m3';
const DB_VERSION = 1;
const STORES = Object.freeze(['kv', 'outbox', 'audit', 'documents']);

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

export async function openIberfitDb() {
  if (!('indexedDB' in globalThis)) throw new Error('IndexedDB no disponible');
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    for (const store of STORES) {
      if (!db.objectStoreNames.contains(store)) {
        if (store === 'outbox') db.createObjectStore(store, { keyPath: 'operationId' });
        else if (store === 'audit') db.createObjectStore(store, { keyPath: 'id' });
        else if (store === 'documents') db.createObjectStore(store, { keyPath: 'id' });
        else db.createObjectStore(store);
      }
    }
  };
  return requestToPromise(request);
}

export function createIndexedDbRepository() {
  let dbPromise;
  const db = () => (dbPromise ||= openIberfitDb());

  async function get(storeName, key) {
    const database = await db();
    const tx = database.transaction(storeName, 'readonly');
    return requestToPromise(tx.objectStore(storeName).get(key));
  }

  async function set(storeName, key, value) {
    const database = await db();
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    if (store.keyPath) store.put(value);
    else store.put(value, key);
    await transactionDone(tx);
    return value;
  }

  async function remove(storeName, key) {
    const database = await db();
    const tx = database.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    await transactionDone(tx);
  }

  async function all(storeName) {
    const database = await db();
    const tx = database.transaction(storeName, 'readonly');
    return requestToPromise(tx.objectStore(storeName).getAll());
  }

  async function clear(storeName) {
    const database = await db();
    const tx = database.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    await transactionDone(tx);
  }

  return {
    kind: 'indexeddb',
    getState: () => get('kv', 'state'),
    setState: (value) => set('kv', 'state', value),
    getAuth: () => get('kv', 'auth'),
    setAuth: (value) => set('kv', 'auth', value),
    clearAuth: () => remove('kv', 'auth'),
    listOutbox: () => all('outbox'),
    putOutbox: (value) => set('outbox', value.operationId, value),
    removeOutbox: (id) => remove('outbox', id),
    clearOutbox: () => clear('outbox'),
    listAudit: () => all('audit'),
    putAudit: (value) => set('audit', value.id, value),
    clearAudit: () => clear('audit'),
    putDocument: (value) => set('documents', value.id, value),
    listDocuments: () => all('documents'),
    clearDocuments: () => clear('documents'),
  };
}
