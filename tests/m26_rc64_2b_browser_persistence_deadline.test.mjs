import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  M26_BROWSER_PRIMARY_STORAGE_DEADLINE_MS,
  createBrowserKeyValueStore,
} from '../src/m26/platform/key-value-store.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function fakeStorage(){
  const records=new Map();
  return {
    get length(){return records.size;},
    key(index){return [...records.keys()][index]??null;},
    getItem(key){return records.has(String(key))?records.get(String(key)):null;},
    setItem(key,value){records.set(String(key),String(value));},
    removeItem(key){records.delete(String(key));},
  };
}

function neverSettlingIndexedDb(){
  return {
    open(){
      return {
        result:null,error:null,
        onupgradeneeded:null,onsuccess:null,onerror:null,onblocked:null,
      };
    },
  };
}

function rejectAfter(ms,code){
  return new Promise((_,reject)=>setTimeout(()=>reject(new Error(code)),ms));
}

test('RC64.2B browser primary persistence has a bounded production deadline',()=>{
  assert.equal(M26_BROWSER_PRIMARY_STORAGE_DEADLINE_MS,2000);
  const source=read('src/m26/platform/key-value-store.js');
  assert.match(source,/M26_PRIMARY_STORAGE_TIMEOUT/u);
  assert.match(source,/primaryTimedOut=true/u);
  assert.match(source,/if\(!primary\|\|primaryTimedOut\)return fallbackValue;/u);
  assert.doesNotMatch(source,/RC64_2B_AUTH_TIMEOUT|AUTH_TIMEOUT/u);
});

test('RC64.2B hanging IndexedDB falls back instead of blocking operation listing',async()=>{
  const sessionStorageImpl=fakeStorage();
  const sessionPrefix='rc64:test:';
  const logicalKey='m26:operation:user-a:op-a';
  sessionStorageImpl.setItem(
    `${sessionPrefix}${logicalKey}`,
    JSON.stringify({operationId:'op-a',status:'pending',createdAt:'2026-08-20T00:00:00.000Z'})
  );

  const store=createBrowserKeyValueStore({
    sessionStorageImpl,
    sessionPrefix,
    indexedDBImpl:neverSettlingIndexedDb(),
    primaryDeadlineMs:40,
  });

  const keys=await Promise.race([
    store.keys('m26:operation:user-a:'),
    rejectAfter(500,'M26_TEST_BROWSER_STORE_DID_NOT_FALL_BACK'),
  ]);
  assert.deepEqual(keys,[logicalKey]);

  const entries=await Promise.race([
    store.entries('m26:operation:user-a:'),
    rejectAfter(500,'M26_TEST_BROWSER_STORE_BREAKER_NOT_OPEN'),
  ]);
  assert.equal(entries.length,1);
  assert.equal(entries[0][0],logicalKey);
  assert.equal(entries[0][1].operationId,'op-a');
});

test('RC64.2B timeout never prevents fallback writes and reads',async()=>{
  const sessionStorageImpl=fakeStorage();
  const store=createBrowserKeyValueStore({
    sessionStorageImpl,
    sessionPrefix:'rc64:write:',
    indexedDBImpl:neverSettlingIndexedDb(),
    primaryDeadlineMs:40,
  });

  const written=await Promise.race([
    store.set('draft:1',{value:7}),
    rejectAfter(500,'M26_TEST_BROWSER_STORE_WRITE_BLOCKED'),
  ]);
  assert.deepEqual(written,{value:7});

  const loaded=await Promise.race([
    store.get('draft:1'),
    rejectAfter(500,'M26_TEST_BROWSER_STORE_READ_BLOCKED_AFTER_BREAKER'),
  ]);
  assert.deepEqual(loaded,{value:7});
});
