import test from 'node:test';
import assert from 'node:assert/strict';
import {createOccurrenceCoordinator} from '../src/m26/workflows/occurrence-coordinator.js';
import {buildOccurrenceScopedCommand} from '../src/m26/domain/occurrence-commands.js';
const COACH='10000000-0000-4000-8000-000000000100';
const CLIENT='10000000-0000-4000-8000-000000000102';
const OCC='10000000-0000-4000-8000-000000000105';
const OP='10000000-0000-4000-8000-000000000107';
const cmd=()=>buildOccurrenceScopedCommand({
  type:'OCURRENCIA_CONFIRMAR',clientId:CLIENT,occurrenceId:OCC,
  operationId:OP,baseRevision:0,
});
const getAuthContext=async()=>({userId:COACH,role:'coach',accessToken:'fresh-jwt'});
const data=new Map();
const journal=()=>({
  capability:'encrypted-owner-bound',
  readPending:async key=>structuredClone(data.get(key)||null),
  writePending:async(key,command)=>{data.set(key,structuredClone(command));},
  clearPending:async key=>{data.delete(key);},
});
const factory=(transport,recovery=journal())=>
  createOccurrenceCoordinator({enabled:true,transport,getAuthContext,journal:recovery});
const transport=(submit)=>({
  occurrenceCalendar:async()=>({kind:'calendar',clientId:CLIENT,
    count:0,hasMore:false,occurrences:[]}),
  occurrenceCommand:submit,
});
const ack=command=>({
  kind:'ack',operationId:command.operationId,entityId:command.entityId,
  remoteRevision:1,duplicate:true,
});
test('U41 missing or incorrect durable recovery refuses write before HTTP',async()=>{
 data.clear();let calls=0;
 const rpc=transport(async()=>{calls++;return ack(cmd());});
 const without=factory(rpc,null);
 await assert.rejects(without.send(cmd()),/U40_DURABLE_JOURNAL_REQUIRED/);
 assert.equal(calls,0);
 assert.throws(()=>factory(rpc,{
   capability:'plain-local-storage',readPending:async()=>null,
   writePending:async()=>{},clearPending:async()=>{},
 }),/U40_PRIVATE_JOURNAL_INVALID/);
 assert.equal(calls,0);
});
test('U41 reboot retains original idempotency operation and blocks new writes',async()=>{
 data.clear();let calls=0;
 const rpc=transport(async(_,command)=>{
   calls++;
   if(calls===1)throw new Error('network_timeout_after_server_commit_unknown');
   return ack(command);
 });
 const initial=factory(rpc);
 await assert.rejects(initial.send(cmd()),/network_timeout_after_server_commit_unknown/);
 const restarted=factory(rpc);
 assert.equal(await restarted.hasUncertain({clientId:CLIENT,occurrenceId:OCC}),true);
 const next=buildOccurrenceScopedCommand({
   type:'OCURRENCIA_CONFIRMAR',clientId:CLIENT,occurrenceId:OCC,
   operationId:'10000000-0000-4000-8000-000000000109',baseRevision:0,
 });
 await assert.rejects(restarted.send(next),/U40_UNCERTAIN_COMMAND_REQUIRES_RECONCILIATION/);
 assert.equal(calls,1,'no new remote command after reboot');
 const receipt=await restarted.retryUncertain({clientId:CLIENT,occurrenceId:OCC});
 assert.equal(receipt.kind,'ack');assert.equal(calls,2);
 assert.equal(await restarted.hasUncertain({clientId:CLIENT,occurrenceId:OCC}),false);
});
test('U41 failed durable write and journal read block transmission completely',async()=>{
 data.clear();let calls=0;
 const rpc=transport(async()=>{calls++;return ack(cmd());});
 await assert.rejects(factory(rpc,{
   ...journal(),writePending:async()=>{throw new Error('private_vault_locked');},
 }).send(cmd()),/private_vault_locked/);
 await assert.rejects(factory(rpc,{
   ...journal(),readPending:async()=>{throw new Error('private_vault_unavailable');},
 }).send(cmd()),/private_vault_unavailable/);
 assert.equal(calls,0);
});
test('U41 ACK is not relabelled as failed when local journal cleanup fails',async()=>{
 data.clear();let calls=0;
 const damaged={...journal(),clearPending:async()=>{
   throw new Error('device_vault_write_failed');
 }};
 const svc=factory(transport(async(_,command)=>{
   calls++;return ack(command);
 }),damaged);
 const response=await svc.send(cmd());
 assert.equal(response.kind,'ack');
 assert.equal(response.localRecoveryPending,true);
 assert.equal(calls,1);
 assert.equal(await svc.hasUncertain({clientId:CLIENT,occurrenceId:OCC}),true);
});
test('U41 corrupted scoped journal fails closed and never leaks across Client IDs',async()=>{
 data.clear();let calls=0;
 const key=COACH+'|'+CLIENT+'|'+OCC;
 const other='10000000-0000-4000-8000-000000000109';
 data.set(key,buildOccurrenceScopedCommand({
   type:'OCURRENCIA_CONFIRMAR',clientId:other,occurrenceId:OCC,
   operationId:OP,baseRevision:0,
 }));
 const svc=factory(transport(async()=>{calls++;return ack(cmd());}));
 await assert.rejects(svc.hasUncertain({clientId:CLIENT,occurrenceId:OCC}),
   /U40_JOURNAL_OWNER_MISMATCH/);
 await assert.rejects(svc.send(cmd()),/U40_JOURNAL_OWNER_MISMATCH/);
 assert.equal(calls,0);
});
