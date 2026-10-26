import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createEncryptedOccurrenceWorkoutCheckpoint} from '../src/m26/workflows/occurrence-workout-checkpoint.js';
const OWNER='10000000-0000-4000-8000-000000000100';
const OTHER='10000000-0000-4000-8000-000000000101';
const CLIENT='10000000-0000-4000-8000-000000000102';
const OCC='10000000-0000-4000-8000-000000000105';
const SESSION='10000000-0000-4000-8000-000000000103';
const EXEC='10000000-0000-4000-8000-000000000107';
const scope={clientId:CLIENT,occurrenceId:OCC};
const makeStore=()=>{
 const data=new Map();
 return {data,capability:'persistent-owner-isolated-atomic',
   get:async k=>data.get(k)??null,
   putIfAbsent:async(k,v)=>{
     if(data.has(k))return false;
     data.set(k,v);return true;
   },
   replaceIfEqual:async(k,old,next)=>{
     if(data.get(k)!==old)return false;
     data.set(k,next);return true;
   },
   deleteIfEqual:async(k,old)=>{
     if(data.get(k)!==old)return false;
     data.delete(k);return true;
   },
 };
};
const key=()=>webcrypto.subtle.generateKey({
 name:'AES-GCM',length:256,
},false,['encrypt','decrypt']);
const build=(store,k,ownerId=OWNER)=>createEncryptedOccurrenceWorkoutCheckpoint({
 ownerId,store,keyProvider:async()=>k,cryptoImpl:webcrypto,
});
const snapshot=()=>({kind:'iberfit.occurrence-workout-draft.v1',
 clientId:CLIENT,occurrenceId:OCC,sessionId:SESSION,localDate:'2026-10-27',
 occurrenceRevision:2,executionRevision:1,phase:'active',
 execution:{id:EXEC,clientId:CLIENT,sessionId:SESSION,
   queue:[{blockId:'base',exerciseId:'squat',sets:1}],
   results:{'base:squat:1':{reps:8,load:20,rpe:7}},skippedSets:{}},
});
test('U51 only ciphertext is persisted, and offline read survives instance restart',async()=>{
 const store=makeStore(),k=await key(),one=build(store,k);
 const snap=snapshot();
 const tag=await one.writeCheckpoint(scope,snap);
 assert.ok(tag);
 const [[name,encrypted]]=[...store.data];
 assert.match(name,/^m26:occurrence:v1:[a-f0-9]{64}$/);
 assert.equal(name.includes(CLIENT),false);
 assert.equal(encrypted.includes(CLIENT),false);
 assert.equal(encrypted.includes('squat'),false);
 assert.deepEqual((await build(store,k).readCheckpoint(scope)).snapshot,snap);
 await build(store,k).clearCheckpoint(scope,tag);
 assert.equal(store.data.size,0);
});
test('U51 refuses cross-owner keys, ciphertext modification and wrong key',async()=>{
 const store=makeStore(),k=await key(),vault=build(store,k);
 await vault.writeCheckpoint(scope,snapshot());
 await assert.rejects(build(store,await key()).readCheckpoint(scope),
   /U51_AUTHENTICATION_TAG_INVALID/);
 assert.equal(await build(store,k,OTHER).readCheckpoint(scope),null);
 const [name,raw]=[...store.data][0],envelope=JSON.parse(raw);
 const data=envelope.data;envelope.data=data.slice(0,10)+
   (data[10]==='A'?'B':'A')+data.slice(11);
 store.data.set(name,JSON.stringify(envelope));
 await assert.rejects(vault.readCheckpoint(scope),
   /U51_AUTHENTICATION_TAG_INVALID/);
});
test('U51 concurrent tabs never lose a write or clear the newer record',async()=>{
 const store=makeStore(),k=await key(),a=build(store,k),b=build(store,k);
 const old=await a.writeCheckpoint(scope,snapshot());
 const v1={...snapshot(),sequence:1},v2={...snapshot(),sequence:2};
 const outcomes=await Promise.allSettled([
   a.writeCheckpoint(scope,v1,old),
   b.writeCheckpoint(scope,v2,old),
 ]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
 assert.match(outcomes.find(x=>x.status==='rejected').reason.message,
   /U51_CHECKPOINT_CAS_CONFLICT/);
 await assert.rejects(a.clearCheckpoint(scope,old),
   /U51_CHECKPOINT_CAS_CONFLICT/);
 assert.ok([1,2].includes((await a.readCheckpoint(scope)).snapshot.sequence));
});
test('U51 rejects nonatomic storage and missing owner-unlocked AES key',async()=>{
 const store=makeStore();
 assert.throws(()=>createEncryptedOccurrenceWorkoutCheckpoint({
   ownerId:OWNER,store:{...store,replaceIfEqual:null},
   keyProvider:async()=>null,cryptoImpl:webcrypto,
 }),/U51_DEPENDENCIES_REQUIRED/);
 const locked=build(store,null);
 await assert.rejects(locked.writeCheckpoint(scope,snapshot()),
   /U51_KEY_UNAVAILABLE/);
 assert.equal(store.data.size,0);
});
