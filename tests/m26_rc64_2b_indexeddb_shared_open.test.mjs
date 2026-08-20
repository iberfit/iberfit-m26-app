import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  M26_BROWSER_INDEXED_DB_SCHEMA_VERSION,
  createIndexedDbKeyValueStore,
} from '../src/m26/platform/key-value-store.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function timeoutAfter(ms,code){
  return new Promise((_,reject)=>setTimeout(()=>reject(new Error(code)),ms));
}

function raceSensitiveIndexedDb(){
  const stores=new Set();
  let openCalls=0;

  const db={
    objectStoreNames:{
      contains(name){return stores.has(String(name));},
    },
    createObjectStore(name){
      stores.add(String(name));
      return {};
    },
    close(){},
    onversionchange:null,
    onclose:null,
    transaction(storeName){
      if(!stores.has(String(storeName))){
        throw new Error(`MISSING_FAKE_STORE:${storeName}`);
      }
      return {
        objectStore(){
          return {
            openKeyCursor(){
              const request={
                result:null,
                error:null,
                onsuccess:null,
                onerror:null,
              };
              queueMicrotask(()=>request.onsuccess?.());
              return request;
            },
          };
        },
      };
    },
  };

  return {
    get openCalls(){return openCalls;},
    stores,
    api:{
      open(){
        openCalls+=1;
        const request={
          result:db,
          error:null,
          onupgradeneeded:null,
          onsuccess:null,
          onerror:null,
          onblocked:null,
        };

        // The first open behaves normally. A second concurrent open intentionally
        // never settles, reproducing the class of browser stall observed in RC64.2B.
        if(openCalls===1){
          queueMicrotask(()=>{
            request.onupgradeneeded?.();
            request.onsuccess?.();
          });
        }
        return request;
      },
    },
  };
}

function normalIndexedDb(){
  let openCalls=0;
  return {
    get openCalls(){return openCalls;},
    api:{
      open(){
        openCalls+=1;
        const stores=new Set();
        const db={
          objectStoreNames:{
            contains(name){return stores.has(String(name));},
          },
          createObjectStore(name){stores.add(String(name));return {};},
          close(){},
          onversionchange:null,
          transaction(storeName){
            if(!stores.has(String(storeName)))throw new Error('MISSING_CUSTOM_STORE');
            return {
              objectStore(){
                return {
                  openKeyCursor(){
                    const request={result:null,error:null,onsuccess:null,onerror:null};
                    queueMicrotask(()=>request.onsuccess?.());
                    return request;
                  },
                };
              },
            };
          },
        };
        const request={
          result:db,error:null,
          onupgradeneeded:null,onsuccess:null,onerror:null,onblocked:null,
        };
        queueMicrotask(()=>{
          request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    },
  };
}

test('RC64.2B canonical key_value and wearable stores share one concurrent IndexedDB open',async()=>{
  const fake=raceSensitiveIndexedDb();

  const core=createIndexedDbKeyValueStore({
    indexedDBImpl:fake.api,
    storeName:'key_value',
  });
  const wearable=createIndexedDbKeyValueStore({
    indexedDBImpl:fake.api,
    storeName:'wearable_sync_v44',
    version:M26_BROWSER_INDEXED_DB_SCHEMA_VERSION,
  });

  const [coreKeys,wearableKeys]=await Promise.race([
    Promise.all([
      core.keys('m26:operation:'),
      wearable.keys('m26:wearable-sync:v44:'),
    ]),
    timeoutAfter(500,'M26_TEST_CANONICAL_INDEXEDDB_OPEN_RACE_NOT_RESOLVED'),
  ]);

  assert.deepEqual(coreKeys,[]);
  assert.deepEqual(wearableKeys,[]);
  assert.equal(fake.openCalls,1);
  assert.equal(fake.stores.has('key_value'),true);
  assert.equal(fake.stores.has('wearable_sync_v44'),true);
});

test('RC64.2B repeated canonical instances reuse the same resolved connection',async()=>{
  const fake=raceSensitiveIndexedDb();
  const first=createIndexedDbKeyValueStore({
    indexedDBImpl:fake.api,
    storeName:'key_value',
  });
  const second=createIndexedDbKeyValueStore({
    indexedDBImpl:fake.api,
    storeName:'wearable_sync_v44',
  });

  await first.keys('');
  await second.keys('');

  assert.equal(fake.openCalls,1);
});

test('RC64.2B custom databases retain instance-local open behavior',async()=>{
  const fake=normalIndexedDb();

  const first=createIndexedDbKeyValueStore({
    indexedDBImpl:fake.api,
    dbName:'iberfit-custom-a',
    storeName:'custom_store',
  });
  const second=createIndexedDbKeyValueStore({
    indexedDBImpl:fake.api,
    dbName:'iberfit-custom-b',
    storeName:'custom_store',
  });

  await first.keys('');
  await second.keys('');

  assert.equal(fake.openCalls,2);
});

test('RC64.2B shared-open implementation remains canonical-only and preserves v3 schema',()=>{
  const source=read('src/m26/platform/key-value-store.js');

  assert.match(source,/canonicalIndexedDbOpenRegistries=new WeakMap\(\)/u);
  assert.match(source,/function openCanonicalIndexedDb/u);
  assert.match(source,/dbName===M26_BROWSER_INDEXED_DB_NAME/u);
  assert.match(source,/resolvedVersion===M26_BROWSER_INDEXED_DB_SCHEMA_VERSION/u);
  assert.match(source,/M26_BROWSER_INDEXED_DB_SCHEMA_VERSION=3/u);
  assert.match(source,/'key_value'/u);
  assert.match(source,/'wearable_sync_v44'/u);
  assert.match(source,/M26_BROWSER_PRIMARY_STORAGE_DEADLINE_MS=2000/u);
  assert.match(source,/M26_PRIMARY_STORAGE_TIMEOUT/u);
});
