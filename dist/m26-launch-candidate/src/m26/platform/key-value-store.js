function clone(value){return value==null?value:structuredClone(value);}

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

export function createIndexedDbKeyValueStore({dbName='iberfit-m26',storeName='key_value',version=1,indexedDBImpl=globalThis.indexedDB}={}){
  if(!indexedDBImpl?.open)throw new Error('M26_INDEXED_DB_UNAVAILABLE');
  let databasePromise;
  function open(){
    if(databasePromise)return databasePromise;
    databasePromise=new Promise((resolve,reject)=>{
      const request=indexedDBImpl.open(dbName,version);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(storeName))db.createObjectStore(storeName);};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('M26_INDEXED_DB_OPEN_FAILED'));
      request.onblocked=()=>reject(new Error('M26_INDEXED_DB_BLOCKED'));
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

export function createBrowserKeyValueStore(options={}){
  const fallback=createMemoryKeyValueStore();let primary=null;
  try{primary=createIndexedDbKeyValueStore(options);}catch{return fallback;}
  return Object.freeze({
    async get(key){try{const value=await primary.get(key);return value===undefined?fallback.get(key):value;}catch{return fallback.get(key);}},
    async set(key,value){await fallback.set(key,value);try{await primary.set(key,value);}catch{}return clone(value);},
    async remove(key){await fallback.remove(key);try{await primary.remove(key);}catch{}},
    async keys(prefix=''){let primaryKeys=[];try{primaryKeys=await primary.keys(prefix);}catch{}const fallbackKeys=await fallback.keys(prefix);return [...new Set([...primaryKeys,...fallbackKeys])].sort();},
    async entries(prefix=''){const out=[];for(const key of await this.keys(prefix))out.push([key,await this.get(key)]);return out;},
    async clear(prefix=''){for(const key of await this.keys(prefix))await this.remove(key);},
  });
}
