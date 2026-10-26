import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createOccurrenceCoordinator} from '../src/m26/workflows/occurrence-coordinator.js';
import {createEncryptedOccurrenceJournal} from '../src/m26/workflows/occurrence-encrypted-journal.js';
import {buildOccurrenceScopedCommand} from '../src/m26/domain/occurrence-commands.js';

const ACTOR='10000000-0000-4000-8000-000000000100';
const CLIENT='10000000-0000-4000-8000-000000000102';
const OCC='10000000-0000-4000-8000-000000000105';
const OP='10000000-0000-4000-8000-000000000107';
const command=()=>buildOccurrenceScopedCommand({
  type:'OCURRENCIA_CONFIRMAR',clientId:CLIENT,occurrenceId:OCC,
  operationId:OP,baseRevision:0,
});
const memory=()=>{
  const ciphertext=new Map();
  return {
    ciphertext,capability:'persistent-owner-isolated',
    get:async key=>ciphertext.get(key)||null,
    set:async(key,v)=>{ciphertext.set(key,v);},
    delete:async key=>{ciphertext.delete(key);},
  };
};
const journal=(store,key,actor=ACTOR)=>createEncryptedOccurrenceJournal({
  ownerId:actor,store,keyProvider:async()=>key,cryptoImpl:webcrypto,
});
const gateway=(store,key,getAuth,send)=>createOccurrenceCoordinator({
  enabled:true,journal:journal(store,key),
  transport:{
    occurrenceCommand:send,
    occurrenceCalendar:async()=>({kind:'calendar',clientId:CLIENT,
      count:0,hasMore:false,occurrences:[]}),
  },getAuthContext:getAuth,
});
const key=()=>webcrypto.subtle.generateKey({
  name:'AES-GCM',length:256,
},false,['encrypt','decrypt']);

test('U43 encrypted journal survives restart and exact same RPC receipt safely',async()=>{
 const encryptedKey=await key(),store=memory();
 let jwt='jwt-before-refresh',calls=0;
 const auth=async()=>({userId:ACTOR,role:'coach',accessToken:jwt});
 const rpc=async(token,body)=>{
   calls++;
   assert.equal(body.operationId,OP);
   assert.equal(token,jwt);
   assert.equal(store.ciphertext.size,1,'durable ciphertext exists BEFORE HTTP');
   if(calls===1)throw new Error('timeout_after_unknown_remote_commit');
   return {kind:'ack',entityId:OCC,operationId:OP,remoteRevision:1,duplicate:true};
 };
 const first=gateway(store,encryptedKey,auth,rpc);
 await assert.rejects(first.send(command()),/timeout_after_unknown_remote_commit/);
 const only=[...store.ciphertext.values()][0];
 assert.doesNotMatch(only,/OCURRENCIA_CONFIRMAR|baseRevision|operationId|clientId/);
 jwt='jwt-after-refresh';
 const reboot=gateway(store,encryptedKey,auth,rpc);
 assert.equal(await reboot.hasUncertain({clientId:CLIENT,occurrenceId:OCC}),true);
 const ack=await reboot.retryUncertain({clientId:CLIENT,occurrenceId:OCC});
 assert.equal(ack.kind,'ack');assert.equal(ack.duplicate,true);
 assert.equal(calls,2);
 assert.equal(store.ciphertext.size,0);
});
test('U43 wrong decryption key after reload blocks replay with no HTTP',async()=>{
 const before=await key(),after=await key(),store=memory();
 let calls=0;
 const auth=async()=>({userId:ACTOR,role:'coach',accessToken:'jwt'});
 const first=gateway(store,before,auth,async()=>{
   calls++;throw new Error('unknown_network_result');
 });
 await assert.rejects(first.send(command()),/unknown_network_result/);
 const withWrongKey=gateway(store,after,auth,async()=>{calls++;});
 await assert.rejects(withWrongKey.retryUncertain({
   clientId:CLIENT,occurrenceId:OCC,
 }),/U42_AUTHENTICATION_TAG_INVALID/);
 assert.equal(calls,1);
});
test('U43 locked encrypted store and another actor cannot replay prior owner',async()=>{
 const keyValue=await key(),store=memory();
 let count=0;
 const coach=async()=>({userId:ACTOR,role:'coach',accessToken:'jwt'});
 const gateway1=gateway(store,keyValue,coach,async()=>{
   count++;throw new Error('unknown_network_result');
 });
 await assert.rejects(gateway1.send(command()),/unknown_network_result/);
 const other='10000000-0000-4000-8000-000000000101';
 const outsider=gateway(store,keyValue,async()=>({
   userId:other,role:'coach',accessToken:'other-jwt',
 }),async()=>{count++;});
 await assert.rejects(outsider.retryUncertain({
   clientId:CLIENT,occurrenceId:OCC,
 }),/U42_ACTOR_SCOPE_FORBIDDEN/);
 assert.equal(count,1);
});
