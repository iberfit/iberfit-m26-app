import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebPushCoordinator} from '../src/m26/communication/web-push.js';

function deferred(){
  let resolve;
  const promise=new Promise((yes)=>{resolve=yes;});
  return {promise,resolve};
}
const endpoint='https://push.example.test/subscription-iberfit-client-device';
const registration={pushManager:{getSubscription:async()=>({endpoint})}};
function harness({gateSubscription=null,gateToken=null}={}){
  let identity='coach:account-A';
  const writes=[],unsubscribes=[];
  const coordinator=createWebPushCoordinator({
    transport:{
      async webPushUpsert(token,serialized){writes.push({type:'upsert',token,serialized});return {ok:true,active:true,subscriptionCount:1};},
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
