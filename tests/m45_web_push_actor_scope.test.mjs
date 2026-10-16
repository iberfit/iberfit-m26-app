import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebPushCoordinator} from '../src/m26/communication/web-push.js';

function deferred(){
  let resolve;
  const promise=new Promise((yes)=>{resolve=yes;});
  return {promise,resolve};
}
const endpoint='https://push.example.test/subscription-iberfit-client-device';
function harness({gateSubscription=null,gateToken=null,gateUpsert=null}={}){
  let identity='coach:account-A';
  let currentEndpoint=endpoint;
  const registration={pushManager:{getSubscription:async()=>({endpoint:currentEndpoint})}};
  const writes=[],unsubscribes=[];
  const coordinator=createWebPushCoordinator({
    transport:{
      async webPushStatus(){return {ok:true,active:true,subscriptionCount:1};},
      async webPushUpsert(token,serialized){
        writes.push({type:'upsert',token,serialized});
        if(gateUpsert)await gateUpsert.promise;
        return {ok:true,active:true,subscriptionCount:1};
      },
      async webPushRevoke(token,target){writes.push({type:'revoke',token,target});return {ok:true,deletedCount:1};},
    },
    getToken:()=>gateToken?.promise||Promise.resolve('jwt-A'),
    getIdentityScope:()=>identity,
    getRegistration:async()=>registration,
    vapidPublicKey:'A'.repeat(43),
    inspect:async()=>({supported:true,configured:true,permission:'granted',active:true,subscribed:true}),
    subscribe:async()=>{
      if(gateSubscription)await gateSubscription.promise;
      return {created:true,serialized:{endpoint}};
    },
    unsubscribe:async()=>{unsubscribes.push(endpoint);return {ok:true,changed:true};},
    isOnline:()=>true,
  });
  return {
    coordinator,writes,unsubscribes,
    changeIdentity(value){identity=value;},
    replaceCurrentSubscription(value){currentEndpoint=value;},
  };
}

test('M45 push registration cannot be linked to the next account after a permission/subscription delay',async()=>{
  const waiting=deferred(),h=harness({gateSubscription:waiting});
  const result=h.coordinator.enable();
  await new Promise((resolve)=>setImmediate(resolve));
  h.changeIdentity('coach:account-B');
  waiting.resolve();
  await assert.rejects(()=>result,/M45_PUSH_ACTOR_CHANGED/);
  assert.equal(h.writes.length,0,'wrong account must never receive the subscription');
  assert.equal(h.unsubscribes.length,1,'new locally created subscription gets cleaned up');
});

test('M45 token refresh race cannot upsert an old account subscription under a new bearer token',async()=>{
  const waiting=deferred(),h=harness({gateToken:waiting});
  const result=h.coordinator.enable();
  await new Promise((resolve)=>setImmediate(resolve));
  h.changeIdentity('client:account-B');
  waiting.resolve('jwt-B');
  await assert.rejects(()=>result,/M45_PUSH_ACTOR_CHANGED/);
  assert.deepEqual(h.writes,[]);
});

test('M45 push disableCurrent does not revoke or unsubscribe after an account switch',async()=>{
  const waiting=deferred(),h=harness({gateToken:waiting});
  const result=h.coordinator.disableCurrent();
  await new Promise((resolve)=>setImmediate(resolve));
  h.changeIdentity('coach:account-B');
  waiting.resolve('jwt-B');
  await assert.rejects(()=>result,/M45_PUSH_ACTOR_CHANGED/);
  assert.equal(h.writes.length,0);
  assert.equal(h.unsubscribes.length,0);
});

test('M45 push disableAll stops before revoke if bearer token belongs to another account',async()=>{
  const waiting=deferred(),h=harness({gateToken:waiting});
  const result=h.coordinator.disableAll();
  await new Promise((resolve)=>setImmediate(resolve));
  h.changeIdentity('coach:account-B');
  waiting.resolve('jwt-B');
  await assert.rejects(()=>result,/M45_PUSH_ACTOR_CHANGED/);
  assert.deepEqual(h.writes,[]);
});

test('M45 unchanged authenticated account can still enable, disable and revoke its own push',async()=>{
  const h=harness();
  const enabled=await h.coordinator.enable();
  assert.equal(enabled.ok,true);
  assert.equal(h.writes[0].type,'upsert');
  assert.equal(h.writes[0].token,'jwt-A');
  const revoked=await h.coordinator.disableCurrent();
  assert.equal(revoked.ok,true);
  assert.equal(h.writes[1].type,'revoke');
  assert.equal(h.writes[1].target,endpoint);
  const all=await h.coordinator.disableAll();
  assert.equal(all.ok,true);
  assert.equal(h.writes[2].target,undefined);
});


test('M45 an upsert ACK arriving after account change compensates with old-account revoke',async()=>{
  const pending=deferred(),h=harness({gateUpsert:pending});
  const enabling=h.coordinator.enable();
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(h.writes.length,1,'old account request was already sent');
  h.changeIdentity('coach:account-B');
  pending.resolve();
  await assert.rejects(()=>enabling,/M45_PUSH_ACTOR_CHANGED/);
  assert.deepEqual(h.writes.map(x=>x.type),['upsert','revoke']);
  assert.equal(h.writes[1].token,'jwt-A');
  assert.equal(h.writes[1].target,endpoint);
  assert.equal(h.unsubscribes.length,1);
});


test('M45 late old-account push failure cannot unsubscribe the replacement user endpoint',async()=>{
  const gate=deferred(),h=harness({gateUpsert:gate});
  const enable=h.coordinator.enable();
  await new Promise((resolve)=>setImmediate(resolve));
  const replacement='https://push.example.test/replacement-for-account-B';
  h.changeIdentity('client:account-B');
  h.replaceCurrentSubscription(replacement);
  gate.resolve();
  await assert.rejects(()=>enable,/M45_PUSH_ACTOR_CHANGED/);
  assert.deepEqual(h.writes.map(x=>x.type),['upsert','revoke']);
  assert.equal(h.writes[1].target,endpoint,'old account endpoint is revoked with old token');
  assert.equal(h.unsubscribes.length,0,'new account browser subscription is preserved');
});

function statusHarness({gateInspect=null,gateToken=null,gateStatus=null}={}){
  let identity='coach:account-A';
  const statusCalls=[];
  const coordinator=createWebPushCoordinator({
    transport:{
      async webPushStatus(bearer,endpoint){
        statusCalls.push({bearer,endpoint});
        if(gateStatus)await gateStatus.promise;
        return {ok:true,active:true,subscriptionCount:1};
      },
    },
    getToken:()=>gateToken?.promise||Promise.resolve('jwt-A'),
    getIdentityScope:()=>identity,
    getRegistration:async()=>({pushManager:{
      getSubscription:async()=>({endpoint}),
    }}),
    vapidPublicKey:'A'.repeat(43),
    inspect:async()=>{
      if(gateInspect)await gateInspect.promise;
      return {supported:true,secure:true,configured:true,permission:'granted',
        subscribed:true,active:true,reason:null};
    },
    isOnline:()=>true,
  });
  return {coordinator,statusCalls,changeIdentity(value){identity=value;}};
}

test('M45 push status refuses a stale browser inspection after a same-role account switch',async()=>{
  const waiting=deferred(),h=statusHarness({gateInspect:waiting});
  const result=h.coordinator.status();
  await new Promise((resolve)=>setImmediate(resolve));
  h.changeIdentity('coach:account-B');
  waiting.resolve();
  await assert.rejects(()=>result,/M45_PUSH_ACTOR_CHANGED/);
  assert.deepEqual(h.statusCalls,[],'a stale endpoint must never reach the next account RPC');
});

test('M45 push status never sends a refreshed bearer for account B with account A endpoint',async()=>{
  const waiting=deferred(),h=statusHarness({gateToken:waiting});
  const result=h.coordinator.status();
  await new Promise((resolve)=>setImmediate(resolve));
  h.changeIdentity('client:account-B');
  waiting.resolve('jwt-B');
  await assert.rejects(()=>result,/M45_PUSH_ACTOR_CHANGED/);
  assert.deepEqual(h.statusCalls,[],'no remote query under the new identity');
});

test('M45 push status discards a remote status reply after logout or identity change',async()=>{
  const waiting=deferred(),h=statusHarness({gateStatus:waiting});
  const result=h.coordinator.status();
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(h.statusCalls.length,1,'request started with the original account');
  assert.equal(h.statusCalls[0].bearer,'jwt-A');
  h.changeIdentity('coach:account-B');
  waiting.resolve();
  await assert.rejects(()=>result,/M45_PUSH_ACTOR_CHANGED/);
});

test('M45 push status for the same stable account preserves a valid active result',async()=>{
  const h=statusHarness();
  const result=await h.coordinator.status();
  assert.equal(result.active,true);
  assert.equal(result.backendActive,true);
  assert.equal(h.statusCalls.length,1);
  assert.equal(h.statusCalls[0].endpoint,endpoint);
});
