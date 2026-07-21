function clone(value){ return value == null ? value : structuredClone(value); }
function key(scope, clientId, entityId='new'){ return `${scope}:${clientId}:${entityId}`; }
export function createDraftStore(storage = null) {
  const memory = new Map();
  const read = (k) => storage?.getItem ? storage.getItem(k) : memory.get(k);
  const write = (k,v) => storage?.setItem ? storage.setItem(k,v) : memory.set(k,v);
  const drop = (k) => storage?.removeItem ? storage.removeItem(k) : memory.delete(k);
  return Object.freeze({
    save(scope, clientId, entityId, value){ if(!scope||!clientId) throw new Error('M26_DRAFT_SCOPE_REQUIRED'); const k=key(scope,clientId,entityId); const record={scope,clientId,entityId:entityId||'new',value:clone(value),updatedAt:new Date().toISOString()}; write(k,JSON.stringify(record)); return clone(record); },
    load(scope, clientId, entityId){ const raw=read(key(scope,clientId,entityId)); return raw ? clone(JSON.parse(raw)) : null; },
    remove(scope, clientId, entityId){ drop(key(scope,clientId,entityId)); },
  });
}
