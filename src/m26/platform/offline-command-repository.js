import { createBrowserKeyValueStore,createMemoryKeyValueStore } from './key-value-store.js';
const SAFE_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SCHEMA_VERSION=2;
function clone(value){return value==null?value:structuredClone(value);}
function qaStage(stage){
  try{
    const hook=globalThis.__IBERFIT_M26_QA_STAGE__;
    if(typeof hook==='function')void hook(stage);
  }catch{}
}
function safeId(value,code){const id=String(value||'').trim();if(!SAFE_ID_PATTERN.test(id))throw new Error(code);return id;}
export function createKeyValueOperationRepository({storage=createBrowserKeyValueStore(),ownerId,prefix='m26:operation:'}={}){
  const owner=safeId(ownerId,'M26_OPERATION_OWNER_REQUIRED');
  const ownerPrefix=`${prefix}${owner}:`;const key=(operationId)=>`${ownerPrefix}${safeId(operationId,'M26_OPERATION_ID_REQUIRED')}`;
  function normalize(value){if(!value||typeof value!=='object'||Array.isArray(value))return null;let operationId;try{operationId=safeId(value.operationId,'M26_OPERATION_ID_REQUIRED');}catch{return null;}if(value.ownerId&&String(value.ownerId)!==owner)return null;return {...clone(value),operationId,ownerId:owner,schemaVersion:SCHEMA_VERSION};}
  return Object.freeze({
    ownerId:owner,
    schemaVersion:SCHEMA_VERSION,
    async put(record){const normalized=normalize(record);if(!normalized)throw new Error('M26_OPERATION_RECORD_INVALID');await storage.set(key(normalized.operationId),normalized);},
    async get(operationId){const expected=key(operationId),value=normalize(await storage.get(expected));if(!value||String(value.operationId)!==String(operationId)){await storage.remove(expected);return null;}return value;},
    async remove(operationId){await storage.remove(key(operationId));},
    async list(){
      qaStage('rc64-operation-repository-list-start');
      qaStage('rc64-operation-storage-entries-start');
      const storedEntries=await storage.entries(ownerPrefix);
      qaStage('rc64-operation-storage-entries-ready');
      const out=[];
      for(const [storageKey,raw] of storedEntries){
        const value=normalize(raw);
        try{
          if(!value||storageKey!==key(value.operationId)){
            await storage.remove(storageKey);
            continue;
          }
          if(value.schemaVersion!==raw?.schemaVersion||value.ownerId!==raw?.ownerId){
            await storage.set(storageKey,value);
          }
          out.push(clone(value));
        }catch{
          await storage.remove(storageKey);
        }
      }
      qaStage('rc64-operation-repository-normalize-ready');
      return out.sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
    },
    async clearOwner(){await storage.clear(ownerPrefix);},
  });
}
export function createMemoryPersistentOperationRepository(options={}){return createKeyValueOperationRepository({...options,storage:createMemoryKeyValueStore()});}
