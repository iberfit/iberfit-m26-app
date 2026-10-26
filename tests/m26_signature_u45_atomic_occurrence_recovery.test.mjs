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
