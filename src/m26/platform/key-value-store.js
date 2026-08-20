function clone(value){return value==null?value:structuredClone(value);}
function qaStage(stage){
  try{
    const hook=globalThis.__IBERFIT_M26_QA_STAGE__;
    if(typeof hook==='function')void hook(stage);
  }catch{}
}

export function createMemoryKeyValueStore(initial={}){
  const records=new Map(Object.entries(initial).map(([key,value])=>[key,clone(value)]));
  return Object.freeze({
    async get(key){return clone(records.get(String(key)));},
    async set(key,value){records.set(String(key),clone(value));return clone(value);},
    async remove(key){records.delete(String(key));},
    async keys(prefix=''){return [...records.keys()].filter((key)=>key.startsWith(String(prefix))).sort();},
    async entries(prefix=''){const keys=await this.keys(prefix);return keys.map((key)=>[key,clone(records.get(key))]);},
    async clear(prefix=''){for(const key of await this.keys(prefix))records.delete(key);},
  });
}


export function createWebStorageKeyValueStore({storage=globalThis.sessionStorage,prefix='iberfit:m26:kv:'}={}){
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof storage.removeItem!=='function'||typeof storage.key!=='function')throw new Error('M26_WEB_STORAGE_UNAVAILABLE');
  const namespace=String(prefix||'iberfit:m26:kv:');
  const fullKey=(key)=>`${namespace}${String(key)}`;
  function logicalKeys(filter=''){
    const wanted=String(filter);const out=[];
    for(let index=0;index<Number(storage.length||0);index++){
      const key=storage.key(index);if(typeof key!=='string'||!key.startsWith(namespace))continue;
      const logical=key.slice(namespace.length);if(logical.startsWith(wanted))out.push(logical);
    }
    return [...new Set(out)].sort();
  }
  return Object.freeze({
    async get(key){const logical=String(key),raw=storage.getItem(fullKey(logical));if(raw==null)return undefined;try{return clone(JSON.parse(raw));}catch{try{storage.removeItem(fullKey(logical));}catch{}return undefined;}},
    async set(key,value){const payload=JSON.stringify(clone(value));if(payload===undefined)throw new Error('M26_WEB_STORAGE_VALUE_INVALID');storage.setItem(fullKey(key),payload);return clone(value);},
    async remove(key){storage.removeItem(fullKey(key));},
    async keys(prefixValue=''){return logicalKeys(prefixValue);},
    async entries(prefixValue=''){const out=[];for(const key of logicalKeys(prefixValue))out.push([key,await this.get(key)]);return out;},
    async clear(prefixValue=''){for(const key of logicalKeys(prefixValue))storage.removeItem(fullKey(key));},
  });
}

export function createIndexedDbKeyValueStore({dbName='iberfit-m26',storeName='key_value',version=1,indexedDBImpl=globalThis.indexedDB}={}){
  if(!indexedDBImpl?.open)throw new Error('M26_INDEXED_DB_UNAVAILABLE');
  let databasePromise;
  function open(){
    if(databasePromise)return databasePromise;
    databasePromise=new Promise((resolve,reject)=>{
      const request=indexedDBImpl.open(dbName,version);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(storeName))db.createObjectStore(storeName);};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
      request.onerror=()=>{databasePromise=null;reject(request.error||new Error('M26_INDEXED_DB_OPEN_FAILED'));};
      request.onblocked=()=>{databasePromise=null;reject(new Error('M26_INDEXED_DB_BLOCKED'));};
    });
    return databasePromise;
  }
  async function transaction(mode,operation){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(storeName,mode);const store=tx.objectStore(storeName);let result;
      try{result=operation(store,resolve,reject);}catch(error){reject(error);return;}
      tx.onerror=()=>reject(tx.error||new Error('M26_INDEXED_DB_TRANSACTION_FAILED'));
      tx.onabort=()=>reject(tx.error||new Error('M26_INDEXED_DB_TRANSACTION_ABORTED'));
      tx.oncomplete=()=>resolve(result);
    });
  }
  function requestResult(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(clone(request.result));request.onerror=()=>reject(request.error||new Error('M26_INDEXED_DB_REQUEST_FAILED'));});}
  return Object.freeze({
    async get(key){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readonly');requestResult(tx.objectStore(storeName).get(String(key))).then(resolve,reject);});},
    async set(key,value){const payload=clone(value);await transaction('readwrite',(store,resolve,reject)=>{const request=store.put(payload,String(key));request.onerror=()=>reject(request.error);request.onsuccess=()=>{};});return clone(value);},
    async remove(key){await transaction('readwrite',(store,resolve,reject)=>{const request=store.delete(String(key));request.onerror=()=>reject(request.error);request.onsuccess=()=>{};});},
    async keys(prefix=''){
      const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readonly');const store=tx.objectStore(storeName);const out=[];const request=store.openKeyCursor();request.onerror=()=>reject(request.error);request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(out.filter((key)=>key.startsWith(String(prefix))).sort());return;}out.push(String(cursor.key));cursor.continue();};});
    },
    async entries(prefix=''){const out=[];for(const key of await this.keys(prefix))out.push([key,await this.get(key)]);return out;},
    async clear(prefix=''){for(const key of await this.keys(prefix))await this.remove(key);},
  });
}

export const M26_BROWSER_PRIMARY_STORAGE_DEADLINE_MS=2000;

function browserPrimaryDeadline(value){
  const number=Number(value);
  if(!Number.isFinite(number))return M26_BROWSER_PRIMARY_STORAGE_DEADLINE_MS;
  return Math.min(10_000,Math.max(25,Math.trunc(number)));
}

function withBrowserPrimaryDeadline(operation,deadlineMs){
  let timer=null;
  const timeout=new Promise((_,reject)=>{
    timer=globalThis.setTimeout(
      ()=>reject(new Error('M26_PRIMARY_STORAGE_TIMEOUT')),
      deadlineMs
    );
  });
  return Promise.race([
    Promise.resolve().then(operation),
    timeout,
  ]).finally(()=>{
    if(timer!==null)globalThis.clearTimeout(timer);
  });
}

export function createBrowserKeyValueStore(options={}){
  const memory=createMemoryKeyValueStore();
  let session=null,primary=null;
  let primaryTimedOut=false;
  const primaryDeadlineMs=browserPrimaryDeadline(options.primaryDeadlineMs);

  try{
    session=createWebStorageKeyValueStore({
      storage:options.sessionStorageImpl??globalThis.sessionStorage,
      prefix:options.sessionPrefix||'iberfit:m26:session-kv:',
    });
  }catch{}

  try{primary=createIndexedDbKeyValueStore(options);}catch{}
  if(!session&&!primary)return memory;

  async function primaryCall(operation,fallbackValue){
    if(!primary||primaryTimedOut)return fallbackValue;
    try{
      return await withBrowserPrimaryDeadline(operation,primaryDeadlineMs);
    }catch(error){
      if(String(error?.message||'')==='M26_PRIMARY_STORAGE_TIMEOUT'){
        primaryTimedOut=true;
      }
      return fallbackValue;
    }
  }

  return Object.freeze({
    async get(key){
      if(session){
        try{
          const value=await session.get(key);
          if(value!==undefined)return value;
        }catch{}
      }
      const primaryValue=await primaryCall(()=>primary.get(key),undefined);
      if(primaryValue!==undefined)return primaryValue;
      return memory.get(key);
    },
    async set(key,value){
      if(session){try{await session.set(key,value);}catch{}}
      await memory.set(key,value);
      await primaryCall(()=>primary.set(key,value),undefined);
      return clone(value);
    },
    async remove(key){
      if(session){try{await session.remove(key);}catch{}}
      await memory.remove(key);
      await primaryCall(()=>primary.remove(key),undefined);
    },
    async keys(prefix=''){
      qaStage('rc64-browser-storage-keys-start');
      let sessionKeys=[];
      if(session){try{sessionKeys=await session.keys(prefix);}catch{}}
      qaStage('rc64-browser-storage-session-keys-ready');
      qaStage('rc64-browser-storage-primary-keys-start');
      const primaryKeys=await primaryCall(()=>primary.keys(prefix),[]);
      qaStage('rc64-browser-storage-primary-keys-ready');
      const memoryKeys=await memory.keys(prefix);
      qaStage('rc64-browser-storage-memory-keys-ready');
      const keys=[...new Set([...sessionKeys,...primaryKeys,...memoryKeys])].sort();
      qaStage('rc64-browser-storage-keys-ready');
      return keys;
    },
    async entries(prefix=''){
      qaStage('rc64-browser-storage-entries-start');
      const keys=await this.keys(prefix);
      qaStage('rc64-browser-storage-entry-keys-ready');
      const out=[];
      for(const key of keys)out.push([key,await this.get(key)]);
      qaStage('rc64-browser-storage-entries-ready');
      return out;
    },
    async clear(prefix=''){for(const key of await this.keys(prefix))await this.remove(key);},
  });
}
