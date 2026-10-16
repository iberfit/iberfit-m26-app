import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebPushCoordinator} from '../src/m26/communication/web-push.js';

function deferred(){
  let resolve;
  const promise=new Promise((done)=>{resolve=done;});
  return {promise,resolve};
}

function harness(){
  const started=deferred(),finish=deferred();
  const initial='https://push.example.test/original-device';
  let current=initial;
  let actor='coach:account-A';
  const recorded=[];
  const registration={
    pushManager:{getSubscription:async()=>current?{endpoint:current}:null},
  };
  const coordinator=createWebPushCoordinator({
    transport:{
      async webPushRevoke(token,endpoint){
        recorded.push({action:'revoke',token,endpoint});
        started.resolve();
        await finish.promise;
        return {ok:true,deletedCount:1};
      },
    },
    getToken:async()=> 'jwt-A',
    getIdentityScope:()=>actor,
    getRegistration:async()=>registration,
    isOnline:()=>true,
    unsubscribe:async()=>{
      recorded.push({action:'unsubscribe',endpoint:current});
      current=null;
      return {ok:true,changed:true};
    },
  });
  return {coordinator,recorded,started,finish,initial,
    setCurrent(value){current=value;},
    setActor(value){actor=value;},
  };
}

test('M45: revoke of old endpoint cannot unsubscribe a replacement browser subscription',async()=>{
  const h=harness();
  const pending=h.coordinator.disableCurrent();
  await h.started.promise;
  const replacement='https://push.example.test/replacement-device';
  h.setCurrent(replacement);
  h.finish.resolve();
  const result=await pending;
  assert.equal(result.ok,true);
  assert.equal(result.active,true);
  assert.equal(result.subscriptionChanged,true);
  assert.equal(result.changed,true);
  assert.deepEqual(h.recorded,[{action:'revoke',token:'jwt-A',endpoint:h.initial}]);
});

test('M45: a second tab may remove the original push subscription before revoke confirms',async()=>{
  const h=harness();
  const pending=h.coordinator.disableCurrent();
  await h.started.promise;
  h.setCurrent(null);
  h.finish.resolve();
  const result=await pending;
  assert.equal(result.ok,true);
  assert.equal(result.active,false);
  assert.equal(result.subscriptionChanged,true);
  assert.equal(h.recorded.some(x=>x.action==='unsubscribe'),false);
});

test('M45: ordinary disable still unsubscribes the unchanged endpoint',async()=>{
  const h=harness();
  const pending=h.coordinator.disableCurrent();
  await h.started.promise;
  h.finish.resolve();
  const result=await pending;
  assert.equal(result.ok,true);
  assert.equal(result.active,false);
  assert.equal(result.changed,true);
  assert.equal(result.subscriptionChanged,undefined);
  assert.equal(h.recorded.filter(x=>x.action==='unsubscribe').length,1);
});

test('M45: an account switch during revoke does not unsubscribe another account',async()=>{
  const h=harness();
  const pending=h.coordinator.disableCurrent();
  await h.started.promise;
  h.setActor('client:account-B');
  h.setCurrent('https://push.example.test/client-B');
  h.finish.resolve();
  await assert.rejects(()=>pending,/M45_PUSH_ACTOR_CHANGED/);
  assert.equal(h.recorded.some(x=>x.action==='unsubscribe'),false);
});
