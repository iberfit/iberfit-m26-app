import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createEncryptedOccurrenceJournal} from '../src/m26/workflows/occurrence-encrypted-journal.js';
import {buildOccurrenceScopedCommand} from '../src/m26/domain/occurrence-commands.js';
import {createAtomicOccurrenceIndexedDbStore} from '../src/m26/workflows/occurrence-indexeddb-store.js';
const OWNER='10000000-0000-4000-8000-000000000100';
const CLIENT='10000000-0000-4000-8000-000000000102';
const OCC='10000000-0000-4000-8000-000000000105';
const scope=OWNER+'|'+CLIENT+'|'+OCC;
const op1='10000000-0000-4000-8000-000000000107';
const op2='10000000-0000-4000-8000-000000000108';
const command=id=>buildOccurrenceScopedCommand({
  type:'OCURRENCIA_CONFIRMAR',clientId:CLIENT,occurrenceId:OCC,
  operationId:id,baseRevision:0,
});
const make=()=>{
  const data=new Map();
  const store={
    capability:'persistent-owner-isolated-atomic',
    get:async k=>data.get(k)??null,
    putIfAbsent:async(k,v)=>{
      if(data.has(k))return false;
      data.set(k,v);return true;
    },
    deleteIfEqual:async(k,v)=>{
      if(data.get(k)!==v)return false;
      data.delete(k);return true;
    },
  };
  return {store,data};
};
const journal=(store,key)=>createEncryptedOccurrenceJournal({
  ownerId:OWNER,store,keyProvider:async()=>key,cryptoImpl:webcrypto,
});
test('U45 refuses read-then-set or non-atomic adapters and invalid IDB primitives',async()=>{
 const key=await webcrypto.subtle.generateKey(
   {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 assert.throws(()=>journal({
   capability:'persistent-owner-isolated',
   get:async()=>null,set:async()=>{},delete:async()=>{},
 },key),/U42_DEPENDENCIES_REQUIRED/);
 assert.throws(()=>createAtomicOccurrenceIndexedDbStore({indexedDBImpl:null}),
   /U45_INDEXEDDB_UNAVAILABLE/);
 assert.throws(()=>createAtomicOccurrenceIndexedDbStore({
   indexedDBImpl:{open(){}},databaseName:'other-private-vault',
 }),/U45_DATABASE_NAME_INVALID/);
});
test('U45 two competing tabs cannot overwrite an unresolved ciphertext',async()=>{
 const key=await webcrypto.subtle.generateKey(
   {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const {store,data}=make();
 const first=journal(store,key),second=journal(store,key);
 const results=await Promise.allSettled([
   first.writePending(scope,command(op1)),
   second.writePending(scope,command(op2)),
 ]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.match(results.find(x=>x.status==='rejected').reason.message,
   /U42_PENDING_EXISTS/);
 const saved=await first.readPending(scope);
 assert.ok([op1,op2].includes(saved.operationId));
 assert.equal(data.size,1);
});
test('U45 CAS cleanup never destroys a newer encrypted journal',async()=>{
 const key=await webcrypto.subtle.generateKey(
   {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const {store,data}=make(),one=journal(store,key);
 await one.writePending(scope,command(op1));
 const [name,oldValue]=[...data][0];
 assert.equal(await store.deleteIfEqual(name,oldValue+'altered'),false);
 assert.deepEqual(await one.readPending(scope),command(op1));
 const intervening={...store,deleteIfEqual:async(k,v)=>{
   data.delete(k);
   data.set(k,'changed-after-read');
   return false;
 }};
 await assert.rejects(journal(intervening,key).clearPending(scope,op1),
   /U42_DELETION_CONFLICT/);
 assert.equal(data.get(name),'changed-after-read');
});
test('U45 failure to claim write blocks network preparation',async()=>{
 const key=await webcrypto.subtle.generateKey(
   {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const {store}=make();
 await assert.rejects(journal({
   ...store,putIfAbsent:async()=>{throw new Error('device_storage_denied');},
 },key).writePending(scope,command(op1)),/device_storage_denied/);
});


test('U45 reconnects after IDB version changes and unexpected closure',async()=>{
  const databases=[];
  let opens=0;
  const indexedDBImpl={
    open(){
      opens++;
      const db={
        closed:false,
        objectStoreNames:{contains:()=>true},
        createObjectStore(){},
        close(){this.closed=true;},
        transaction(){
          if(this.closed)throw Error('CLOSED_DATABASE');
          const tx={
            oncomplete:null,onabort:null,onerror:null,
            objectStore(){return {
              get(){
                const req={result:undefined,onsuccess:null};
                queueMicrotask(()=>{
                  req.onsuccess?.();
                  queueMicrotask(()=>tx.oncomplete?.());
                });
                return req;
              },
            };},
          };
          return tx;
        },
      };
      databases.push(db);
      const request={result:db,onsuccess:null};
      queueMicrotask(()=>request.onsuccess?.());
      return request;
    },
  };
  const store=createAtomicOccurrenceIndexedDbStore({
    indexedDBImpl,databaseName:'iberfit-occurrence-private-v1-qa-reconnect',
  });
  const key='m26:occurrence:v1:'+'a'.repeat(64);
  assert.equal(await store.get(key),null);
  assert.equal(opens,1);
  databases[0].onversionchange?.();
  assert.equal(databases[0].closed,true);
  assert.equal(await store.get(key),null);
  assert.equal(opens,2);
  databases[1].closed=true;databases[1].onclose?.();
  assert.equal(await store.get(key),null);
  assert.equal(opens,3);
  store.close();
});

test('U45 does not retain abandoned IDB connection after onblocked',async()=>{
  const db={
    closed:false,
    close(){this.closed=true;},
    objectStoreNames:{contains:()=>true},
    createObjectStore(){},
  };
  const indexedDBImpl={
    open(){
      const request={result:db,onblocked:null,onsuccess:null};
      queueMicrotask(()=>{
        request.onblocked?.();
        queueMicrotask(()=>request.onsuccess?.());
      });
      return request;
    },
  };
  const store=createAtomicOccurrenceIndexedDbStore({
    indexedDBImpl,databaseName:'iberfit-occurrence-private-v1-qa-blocked',
  });
  await assert.rejects(
    store.get('m26:occurrence:v1:'+'b'.repeat(64)),
    /U45_OPEN_BLOCKED/,
  );
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(db.closed,true);
  store.close();
});


test('U45 a delayed IDB open cannot resurrect a closed private vault',async()=>{
  const requests=[];
  const databases=[];
  const idb={open(){
    const db={
      closed:false,
      objectStoreNames:{contains:()=>true},
      createObjectStore(){},
      close(){this.closed=true;},
      transaction(){
        if(this.closed)throw Error('STALE_DATABASE');
        const tx={
          oncomplete:null,onerror:null,onabort:null,
          objectStore(){return {get(){
            const request={result:undefined,onsuccess:null};
            queueMicrotask(()=>{
              request.onsuccess?.();
              queueMicrotask(()=>tx.oncomplete?.());
            });
            return request;
          }};},
        };
        return tx;
      },
    };
    databases.push(db);
    const request={result:db,onsuccess:null,onerror:null,onblocked:null};
    requests.push(request);
    return request;
  }};
  const store=createAtomicOccurrenceIndexedDbStore({
    indexedDBImpl:idb,databaseName:'iberfit-occurrence-private-v1-qa-logout-fence',
  });
  const storageKey='m26:occurrence:v1:'+'c'.repeat(64);
  const stale=store.get(storageKey);
  assert.equal(requests.length,1);
  store.close();
  const fresh=store.get(storageKey);
  assert.equal(requests.length,2);

  requests[0].onsuccess?.();
  await assert.rejects(stale,/U45_OPEN_CANCELLED/);
  assert.equal(databases[0].closed,true,'the obsolete connection must be closed');

  const concurrent=store.get(storageKey);
  assert.equal(requests.length,2,'late rejection must not clear the new opening');
  requests[1].onsuccess?.();
  assert.equal(await fresh,null);
  assert.equal(await concurrent,null);
  assert.equal(databases[1].closed,false);
  store.close();
  assert.equal(databases[1].closed,true);
});

test('U45 recovers a closed connection even when no IDB onclose event fires',async()=>{
  let opens=0;
  const databases=[];
  const indexedDBImpl={open(){
    const first=++opens===1;
    const db={
      closed:false,
      objectStoreNames:{contains:()=>true},
      createObjectStore(){},
      close(){this.closed=true;},
      transaction(){
        if(first){
          const error=new Error('connection is closing');
          error.name='InvalidStateError';
          throw error;
        }
        if(this.closed)throw new Error('STALE_DATABASE');
        const tx={
          oncomplete:null,onerror:null,onabort:null,
          objectStore(){return {get(){
            const request={result:undefined,onsuccess:null};
            queueMicrotask(()=>{
              request.onsuccess?.();
              queueMicrotask(()=>tx.oncomplete?.());
            });
            return request;
          }};},
        };
        return tx;
      },
    };
    databases.push(db);
    const request={result:db,onsuccess:null};
    queueMicrotask(()=>request.onsuccess?.());
    return request;
  }};
  const store=createAtomicOccurrenceIndexedDbStore({
    indexedDBImpl,databaseName:'iberfit-occurrence-private-v1-qa-stale-transaction',
  });
  const storageKey='m26:occurrence:v1:'+'d'.repeat(64);
  await assert.rejects(store.get(storageKey),/U45_TRANSACTION_UNAVAILABLE/);
  assert.equal(databases[0].closed,true);
  assert.equal(await store.get(storageKey),null,
    'next operation must acquire a fresh connection, not the dead one');
  assert.equal(opens,2);
  store.close();
  assert.equal(databases[1].closed,true);
});
