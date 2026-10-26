import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createEncryptedOccurrenceJournal} from '../src/m26/workflows/occurrence-encrypted-journal.js';
import {buildOccurrenceScopedCommand} from '../src/m26/domain/occurrence-commands.js';
const COACH='10000000-0000-4000-8000-000000000100';
const OTHER='10000000-0000-4000-8000-000000000101';
const CLIENT='10000000-0000-4000-8000-000000000102';
const OCC='10000000-0000-4000-8000-000000000105';
const OP='10000000-0000-4000-8000-000000000107';
const scope=COACH+'|'+CLIENT+'|'+OCC;
const command=()=>buildOccurrenceScopedCommand({
  type:'OCURRENCIA_CONFIRMAR',clientId:CLIENT,occurrenceId:OCC,
  operationId:OP,baseRevision:0,
});
const newKey=()=>webcrypto.subtle.generateKey(
  {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
const storage=()=>{
  const values=new Map();
  return {
    capability:'persistent-owner-isolated',
    values,
    get:async key=>values.get(key)??null,
    set:async(key,value)=>{values.set(key,value);},
    delete:async key=>{values.delete(key);},
  };
};
const create=(store,keyProvider,ownerId=COACH)=>
  createEncryptedOccurrenceJournal({
    ownerId,store,keyProvider,cryptoImpl:webcrypto,
  });
test('U42 persists authenticated ciphertext only; key is non-extractable',async()=>{
  const key=await newKey(),store=storage();
  const one=create(store,async()=>key);
  await one.writePending(scope,command());
  assert.equal(store.values.size,1);
  const [name,encrypted]=[...store.values.entries()][0];
  assert.equal(name.includes(CLIENT),false);
  assert.equal(encrypted.includes(CLIENT),false);
  assert.equal(encrypted.includes('OCURRENCIA_CONFIRMAR'),false);
  assert.deepEqual(await create(store,async()=>key).readPending(scope),command());
  await one.clearPending(scope,OP);
  assert.equal(store.values.size,0);
});
test('U42 wrong key, modified ciphertext and altered owner fail closed',async()=>{
  const key=await newKey(),store=storage();
  const one=create(store,async()=>key);
  await one.writePending(scope,command());
  const wrong=create(store,newKey);
  await assert.rejects(wrong.readPending(scope),/U42_AUTHENTICATION_TAG_INVALID/);
  const [name,raw]=[...store.values.entries()][0],value=JSON.parse(raw);
  value.ciphertext=value.ciphertext.slice(0,8)+'A'+value.ciphertext.slice(9);
  store.values.set(name,JSON.stringify(value));
  await assert.rejects(one.readPending(scope),/U42_AUTHENTICATION_TAG_INVALID/);
  const different=create(store,async()=>key,OTHER);
  await assert.rejects(different.readPending(scope),/U42_ACTOR_SCOPE_FORBIDDEN/);
});
test('U42 never overwrites pending command or clears a different ID',async()=>{
 const store=storage(),key=await newKey();
 const journal=create(store,async()=>key);
 await journal.writePending(scope,command());
 await assert.rejects(journal.writePending(scope,command()),/U42_PENDING_EXISTS/);
 await assert.rejects(journal.clearPending(scope,OTHER),/U42_OPERATION_MISMATCH/);
 assert.deepEqual(await journal.readPending(scope),command());
});
test('U42 unavailable private key and readback errors do not silently fall back',async()=>{
 const store=storage();
 const locked=create(store,async()=>null);
 await assert.rejects(locked.writePending(scope,command()),/U42_KEY_UNAVAILABLE/);
 assert.equal(store.values.size,0);
 const key=await newKey();
 const unavailable=create({
   ...store,set:async()=>{throw new Error('persistent_database_unavailable');},
 },async()=>key);
 await assert.rejects(unavailable.writePending(scope,command()),/persistent_database_unavailable/);
});
