import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminCommandService} from '../src/m26/admin/service.js';
// Real command policy is tested in existing Admin suites. This test uses
// valid application permission state, no actual network or Auth credentials.
const state={available:true,organization:{id:'00000000-0000-4000-8000-000000000140'},permissions:{scopeType:'organization',capabilities:['client.lifecycle.manage']}};
const command={type:'ADMIN_CLIENTE_REENVIAR_INVITACION',operationId:'00000000-0000-4000-8000-000000000001',entityId:'00000000-0000-4000-8000-000000000002',payload:{clientId:'00000000-0000-4000-8000-000000000002'}};
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function setup({getToken,execute,refreshState,initialLease={}}={}){let lease=initialLease,requests=0,refreshes=0;const service=createAdminCommandService({transport:{execute:async(...args)=>{requests++;return execute?execute(...args):{ok:true,kind:'ack'};}},getToken:getToken||(()=>Promise.resolve('token')),getAdminState:()=>state,getSessionLease:()=>lease,refreshState:async(...args)=>{refreshes++;return refreshState?.(...args);},refreshWaitMs:0});return {service,change:()=>{lease={};},counts:()=>({requests,refreshes})};}
test('GX331 does not dispatch command after new login during token refresh',async()=>{const d=deferred(),h=setup({getToken:()=>d.promise});const promise=h.service.execute(command);h.change();d.resolve('new-token');await assert.rejects(promise,/M26_ADMIN_SESSION_CHANGED/);assert.deepEqual(h.counts(),{requests:0,refreshes:0})});
test('GX331 valid token rotation in same lease permits exactly one dispatch',async()=>{const d=deferred(),h=setup({getToken:()=>d.promise});const promise=h.service.execute(command);d.resolve('rotated-token');const r=await promise;assert.equal(r.ok,true);assert.deepEqual(h.counts(),{requests:1,refreshes:1})});
test('GX331 stale ACK must not refresh the new session',async()=>{const sent=deferred(),ack=deferred(),h=setup({execute:()=>{sent.resolve();return ack.promise;}});const promise=h.service.execute(command);await sent.promise;h.change();ack.resolve({ok:true,kind:'ack'});await assert.rejects(promise,/M26_ADMIN_SESSION_CHANGED/);assert.deepEqual(h.counts(),{requests:1,refreshes:0})});
test('GX331 duplicate operation across different login never joins old pending promise',async()=>{const d=deferred(),h=setup({getToken:()=>d.promise});const promise=h.service.execute(command);h.change();await assert.rejects(h.service.execute(command),/M26_ADMIN_OPERATION_ID_COLLISION/);d.resolve('new-token');await assert.rejects(promise,/M26_ADMIN_SESSION_CHANGED/);assert.deepEqual(h.counts(),{requests:0,refreshes:0})});

const createInput={type:'ADMIN_CLIENTE_CREAR',entityId:state.organization.id,payload:{name:'Persona sintética',accessMode:'internal'}};
const createReceipt=(c,overrides={})=>({ok:true,kind:'ack',operationId:c.operationId,commandType:c.type,entityId:command.entityId,clientId:command.entityId,invitation:{reason:'internal_record'},...overrides});
test('GX350 explicit identical creation retry reuses lost-response ID; confirmed receipt releases it',async()=>{
  const calls=[];const h=setup({execute:async(_token,c)=>{calls.push(c);if(calls.length===1)throw Error('M26_TIMEOUT');return createReceipt(c,{kind:calls.length===2?'duplicate':'ack'});}});
  await assert.rejects(h.service.execute(createInput),/M26_TIMEOUT/);
  assert.equal(calls.length,1);
  await h.service.execute({...createInput,payload:{accessMode:'internal',name:'Persona sintética'}});
  assert.equal(calls[0].operationId,calls[1].operationId);
  await h.service.execute(createInput);
  assert.notEqual(calls[1].operationId,calls[2].operationId);
});
test('GX350 wrong receipt cannot release creation attempt',async()=>{
  const calls=[];const h=setup({execute:async(_token,c)=>{calls.push(c);return createReceipt(c,calls.length===1?{operationId:'wrong'}:{});}});
  await assert.rejects(h.service.execute(createInput),/SCOPE_INVALID/);
  await h.service.execute(createInput);assert.equal(calls[0].operationId,calls[1].operationId);
});
test('GX350 pending creation cannot follow a new login or different request',async()=>{
  const calls=[];const h=setup({execute:async(_token,c)=>{calls.push(c);throw Error('M26_TIMEOUT');}});
  await assert.rejects(h.service.execute(createInput),/M26_TIMEOUT/);
  await assert.rejects(h.service.execute({...createInput,payload:{...createInput.payload,name:'Otra persona sintética'}}),/M26_TIMEOUT/);
  h.change();await assert.rejects(h.service.execute(createInput),/M26_TIMEOUT/);
  assert.equal(new Set(calls.map(c=>c.operationId)).size,3);
});
test('GX350 concurrent identical creations join a single pending dispatch',async()=>{
  const d=deferred(),h=setup({execute:async(_token,c)=>{await d.promise;return createReceipt(c);}});
  const a=h.service.execute(createInput),b=h.service.execute(createInput);assert.equal(a,b);
  d.resolve();await Promise.all([a,b]);assert.deepEqual(h.counts(),{requests:1,refreshes:1});
});
