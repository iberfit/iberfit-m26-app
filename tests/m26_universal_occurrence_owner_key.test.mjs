import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createOccurrenceOwnerKeyVault} from '../src/m26/workflows/occurrence-owner-key.js';

const owner='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const project='gjztkdwfmunnzhtvxrsu';
const phrase='Privada de recuperacion para entrenamientos 2026 #1';
function vault(ownerId=owner){return createOccurrenceOwnerKeyVault({
  ownerId,projectRef:project,cryptoImpl:webcrypto,
});}
test('UNIVERSAL U60 owner recovery phrase yields stable non-extractable AES-GCM after reload',async()=>{
  const a=vault(),b=vault();
  assert.equal(a.isUnlocked(),false);
  await assert.rejects(()=>a.getKey(),/U60_OWNER_KEY_LOCKED/);
  await a.unlock(phrase);await b.unlock(phrase);
  const k1=await a.getKey(),k2=await b.getKey();
  assert.equal(k1.extractable,false);
  assert.deepEqual(k1.usages,['encrypt','decrypt']);
  const iv=webcrypto.getRandomValues(new Uint8Array(12));
  const plain=new TextEncoder().encode('scope:remote-ack-durable');
  const ciphertext=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},k1,plain);
  const clear=await webcrypto.subtle.decrypt({name:'AES-GCM',iv},k2,ciphertext);
  assert.equal(new TextDecoder().decode(clear),'scope:remote-ack-durable');
  a.destroy();b.destroy();
});
test('UNIVERSAL U60 never unlocks another owner with the same phrase',async()=>{
  const a=vault(),b=vault(other);
  await a.unlock(phrase);await b.unlock(phrase);
  const iv=webcrypto.getRandomValues(new Uint8Array(12));
  const cipher=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},
    await a.getKey(),new Uint8Array([1,2,3]));
  await assert.rejects(()=>webcrypto.subtle.decrypt({name:'AES-GCM',iv},
    await b.getKey(),cipher));
  a.destroy();b.destroy();
});
test('UNIVERSAL U60 recovery unlock fails closed on bad phrases, destroyed vault or scope',async()=>{
  assert.throws(()=>vault('bad-owner'),/DEPENDENCIES_REQUIRED/);
  const a=vault();
  for(const value of ['',null,'too-short'])
    await assert.rejects(()=>a.unlock(value),/RECOVERY_PHRASE_REQUIRED/);
  await a.unlock(phrase);
  a.lock();await assert.rejects(()=>a.getKey(),/LOCKED/);
  a.destroy();await assert.rejects(()=>a.unlock(phrase),/DESTROYED/);
});
test('UNIVERSAL U60 concurrent unlocks cannot restore a cleared or superseded key',async()=>{
  const a=vault();
  const operation=a.unlock(phrase);
  a.destroy();
  await assert.rejects(operation,/UNLOCK_SUPERSEDED/);
  assert.equal(a.isUnlocked(),false);
});
