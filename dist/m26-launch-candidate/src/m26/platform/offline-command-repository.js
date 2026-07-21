import { createBrowserKeyValueStore,createMemoryKeyValueStore } from './key-value-store.js';
function clone(value){return value==null?value:structuredClone(value);}
export function createKeyValueOperationRepository({storage=createBrowserKeyValueStore(),ownerId,prefix='m26:operation:'}={}){
  const owner=String(ownerId||'').trim();if(!owner)throw new Error('M26_OPERATION_OWNER_REQUIRED');
  const ownerPrefix=`${prefix}${owner}:`;const key=(operationId)=>`${ownerPrefix}${operationId}`;
  return Object.freeze({
    ownerId:owner,
    async put(record){if(!record?.operationId)throw new Error('M26_OPERATION_ID_REQUIRED');await storage.set(key(record.operationId),clone(record));},
    async get(operationId){return clone(await storage.get(key(operationId)));},
    async remove(operationId){await storage.remove(key(operationId));},
    async list(){return (await storage.entries(ownerPrefix)).map(([,value])=>clone(value)).filter(Boolean).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));},
    async clearOwner(){await storage.clear(ownerPrefix);},
  });
}
export function createMemoryPersistentOperationRepository(options={}){return createKeyValueOperationRepository({...options,storage:createMemoryKeyValueStore()});}
