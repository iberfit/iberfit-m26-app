import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  M26_BROWSER_INDEXED_DB_NAME,
  M26_BROWSER_INDEXED_DB_SCHEMA_VERSION,
  M26_BROWSER_INDEXED_DB_STORES,
  createIndexedDbKeyValueStore,
} from '../src/m26/platform/key-value-store.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function fakeIndexedDb({existingStores=[]}={}){
  const stores=new Set(existingStores);
  const opens=[];

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
    stores,
    opens,
    api:{
      open(name,version){
        opens.push({name,version});
        const request={
          result:db,
          error:null,
          onupgradeneeded:null,
          onsuccess:null,
          onerror:null,
          onblocked:null,
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

test('RC64.2B canonical browser IndexedDB converges core and wearable stores on v3',async()=>{
  assert.equal(M26_BROWSER_INDEXED_DB_NAME,'iberfit-m26');
  assert.equal(M26_BROWSER_INDEXED_DB_SCHEMA_VERSION,3);
  assert.deepEqual(
    [...M26_BROWSER_INDEXED_DB_STORES],
    ['key_value','wearable_sync_v44'],
  );

  const fake=fakeIndexedDb({existingStores:['key_value']});
  const store=createIndexedDbKeyValueStore({
    indexedDBImpl:fake.api,
  });

  assert.deepEqual(await store.keys('m26:'),[]);
  assert.deepEqual(fake.opens,[
    {name:'iberfit-m26',version:3},
  ]);
  assert.equal(fake.stores.has('key_value'),true);
  assert.equal(fake.stores.has('wearable_sync_v44'),true);
});

test('RC64.2B v2 wearable-first legacy shape is repaired without deleting its store',async()=>{
  const fake=fakeIndexedDb({existingStores:['wearable_sync_v44']});
  const store=createIndexedDbKeyValueStore({
    indexedDBImpl:fake.api,
  });

  assert.deepEqual(await store.keys('m26:operation:'),[]);
  assert.equal(fake.stores.has('wearable_sync_v44'),true);
  assert.equal(fake.stores.has('key_value'),true);
  assert.equal(fake.opens[0]?.version,3);
});

test('RC64.2B custom IndexedDB remains isolated and defaults to version 1',async()=>{
  const fake=fakeIndexedDb();
  const store=createIndexedDbKeyValueStore({
    dbName:'iberfit-custom-test',
    storeName:'custom_store',
    indexedDBImpl:fake.api,
  });

  assert.deepEqual(await store.keys(''),[]);
  assert.deepEqual(fake.opens,[
    {name:'iberfit-custom-test',version:1},
  ]);
  assert.deepEqual([...fake.stores],['custom_store']);
});

test('RC64.2B wearable queue uses canonical main schema version instead of v2',()=>{
  const source=read('src/m26/wearables/remote-sync.js');
  assert.match(source,/M26_BROWSER_INDEXED_DB_SCHEMA_VERSION/u);
  assert.match(source,/dbName:'iberfit-m26'/u);
  assert.match(source,/storeName:'wearable_sync_v44'/u);
  assert.match(source,/version:M26_BROWSER_INDEXED_DB_SCHEMA_VERSION/u);
  assert.doesNotMatch(source,/version:2/u);
});

test('RC64.2B persistence convergence does not weaken timeout or fallback policy',()=>{
  const source=read('src/m26/platform/key-value-store.js');
  assert.match(source,/M26_BROWSER_PRIMARY_STORAGE_DEADLINE_MS=2000/u);
  assert.match(source,/M26_PRIMARY_STORAGE_TIMEOUT/u);
  assert.match(source,/primaryTimedOut=true/u);
  assert.match(source,/M26_INDEXED_DB_BLOCKED/u);
  assert.match(source,/M26_INDEXED_DB_STORE_MISSING/u);
});
