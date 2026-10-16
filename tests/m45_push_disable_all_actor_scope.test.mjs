import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebPushCoordinator} from '../src/m26/communication/web-push.js';

function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
const originalEndpoint='https://push.example.test/coach-A-device';
const replacementEndpoint='https://push.example.test/client-B-device';

function harness({belongs=true,localPresent=true,unsubscribeOk=true,revokeOk=true,gateStatus=false,gateRevoke=false}={}){
  const statusEntered=deferred();
  const statusFinish=deferred();
  const revokeEntered=deferred();
  const revokeFinish=deferred();
  let identity='coach:account-A';
  let current=localPresent?originalEndpoint:null;
  const calls=[];
  const original={endpoint:originalEndpoint,unsubscribe:async()=>true};
  const replacement={endpoint:replacementEndpoint,unsubscribe:async()=>true};
  const registration={pushManager:{
    async getSubscription(){
      calls.push(['get-current',current]);
      return current===originalEndpoint?original:current===replacementEndpoint?replacement:null;
    },
  }};
  const coordinator=createWebPushCoordinator({
    transport:{
      async webPushStatus(bearer,endpoint){
        calls.push(['status',bearer,endpoint]);
        statusEntered.resolve();
        if(gateStatus)await statusFinish.promise;
        return {ok:true,active:belongs,subscriptionCount:belongs?1:0};
      },
      async webPushRevoke(bearer,endpoint){
        calls.push(['revoke',bearer,endpoint]);
        revokeEntered.resolve();
        if(gateRevoke)await revokeFinish.promise;
        return {ok:revokeOk,deletedCount:revokeOk?(belongs?1:2):0};
      },
    },
    getToken:async()=> 'jwt-A',
    getIdentityScope:()=>identity,
    getRegistration:async()=>registration,
    isOnline:()=>true,
    unsubscribe:async({subscription})=>{
      calls.push(['unsubscribe',subscription?.endpoint]);
      if(unsubscribeOk&&current===subscription?.endpoint)current=null;
      return {ok:unsubscribeOk,changed:unsubscribeOk};
    },
  });
  return {
    coordinator,calls,statusEntered,statusFinish,revokeEntered,revokeFinish,
    setActor(next){identity=next;},
    setEndpoint(next){current=next;},
  };
}

test('M45 disable-all unsubscribes only its server-confirmed browser endpoint',async()=>{
  const h=harness();
  const result=await h.coordinator.disableAll();
  assert.equal(result.ok,true);
  assert.equal(result.active,false);
  assert.equal(result.deletedCount,1);
  assert.deepEqual(h.calls.filter(c=>c[0]==='status').map(c=>c[2]),[originalEndpoint]);
  assert.deepEqual(h.calls.filter(c=>c[0]==='unsubscribe').map(c=>c[1]),[originalEndpoint]);
});

test('M45 disable-all never unlinks a local endpoint belonging to another account',async()=>{
  const h=harness({belongs:false});
  const result=await h.coordinator.disableAll();
  assert.equal(result.ok,true);
  assert.equal(result.deletedCount,2,'revokes the current actors remote devices');
  assert.deepEqual(h.calls.filter(c=>c[0]==='status').map(c=>c[2]),[originalEndpoint]);
  assert.equal(h.calls.filter(c=>c[0]==='unsubscribe').length,0);
});

test('M45 disable-all preserves a new subscription installed during remote revoke',async()=>{
  const h=harness({gateRevoke:true});
  const pending=h.coordinator.disableAll();
  await h.revokeEntered.promise;
  h.setEndpoint(replacementEndpoint);
  h.revokeFinish.resolve();
  await assert.rejects(()=>pending,/M45_PUSH_SUBSCRIPTION_CHANGED/);
  assert.equal(h.calls.filter(c=>c[0]==='unsubscribe').length,0);
});

test('M45 disable-all without local subscription still revokes all server-side devices',async()=>{
  const h=harness({localPresent:false});
  const result=await h.coordinator.disableAll();
  assert.equal(result.ok,true);
  assert.equal(h.calls.some(c=>c[0]==='status'),false);
  assert.equal(h.calls.filter(c=>c[0]==='revoke').length,1);
  assert.equal(h.calls.filter(c=>c[0]==='unsubscribe').length,0);
});

test('M45 disable-all refuses an account switch during ownership verification',async()=>{
  const h=harness({gateStatus:true});
  const pending=h.coordinator.disableAll();
  await h.statusEntered.promise;
  h.setActor('client:account-B');
  h.statusFinish.resolve();
  await assert.rejects(()=>pending,/M45_PUSH_ACTOR_CHANGED/);
  assert.equal(h.calls.filter(c=>c[0]==='revoke').length,0);
});

test('M45 disable-all rejects stale remote revoke ACK after an account switch',async()=>{
  const h=harness({gateRevoke:true});
  const pending=h.coordinator.disableAll();
  await h.revokeEntered.promise;
  h.setActor('client:account-B');
  h.revokeFinish.resolve();
  await assert.rejects(()=>pending,/M45_PUSH_ACTOR_CHANGED/);
  assert.equal(h.calls.filter(c=>c[0]==='unsubscribe').length,0);
});

test('M45 disable-all rejects a failed browser unsubscribe instead of reporting success',async()=>{
  const h=harness({unsubscribeOk:false});
  await assert.rejects(()=>h.coordinator.disableAll(),/M26_PUSH_UNSUBSCRIBE_NOT_CONFIRMED/);
  assert.deepEqual(h.calls.filter(c=>c[0]==='unsubscribe').map(c=>c[1]),[originalEndpoint]);
});

test('M45 disable-all negative remote revoke ACK leaves browser subscription untouched',async()=>{
  const h=harness({revokeOk:false});
  await assert.rejects(()=>h.coordinator.disableAll(),/M26_PUSH_REVOKE_NOT_CONFIRMED/);
  assert.deepEqual(h.calls.filter(c=>c[0]==='unsubscribe'),[]);
  assert.equal(h.calls.filter(c=>c[0]==='revoke').length,1);
});
