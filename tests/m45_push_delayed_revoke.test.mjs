import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebPushCoordinator} from '../src/m26/communication/web-push.js';

function deferred(){
  let resolve;
  const promise=new Promise((done)=>{resolve=done;});
  return {promise,resolve};
}

function harness({unsubscribeOk=true,revokeOk=true,revokeDeletedCount=null}={}){
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
        return {ok:revokeOk,deletedCount:revokeDeletedCount===null?(revokeOk?1:0):revokeDeletedCount};
      },
    },
    getToken:async()=> 'jwt-A',
    getIdentityScope:()=>actor,
    getRegistration:async()=>registration,
    isOnline:()=>true,
    unsubscribe:async()=>{
      recorded.push({action:'unsubscribe',endpoint:current});
      current=null;
      return {ok:unsubscribeOk,changed:unsubscribeOk};
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
  await assert.rejects(()=>pending,/M45_PUSH_SUBSCRIPTION_CHANGED/);
  assert.deepEqual(h.recorded,[{action:'revoke',token:'jwt-A',endpoint:h.initial}]);
});

test('M45: a second tab may remove the original push subscription before revoke confirms',async()=>{
  const h=harness();
  const pending=h.coordinator.disableCurrent();
  await h.started.promise;
  h.setCurrent(null);
  h.finish.resolve();
  await assert.rejects(()=>pending,/M45_PUSH_SUBSCRIPTION_CHANGED/);
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

test('M45 explains replacement subscription and avoids a false disabled confirmation',async()=>{
  const {__communicationControllerInternals}=await import('../src/m26/communication/controller.js');
  const copy=__communicationControllerInternals.pushErrorMessage(new Error('M45_PUSH_SUBSCRIPTION_CHANGED'));
  assert.match(copy,/otra pestaña/);
  assert.match(copy,/Revisa su estado/);
  assert.doesNotMatch(copy,/desactivados en este dispositivo/);
});

test('M45 low-level unsubscribe targets captured subscription instead of a new one',async()=>{
  const {unsubscribeWebPush}=await import('../src/m26/platform/pwa.js');
  const calls=[];
  const old={endpoint:'https://push.example.test/old',
    async unsubscribe(){calls.push('old');return true;}};
  const replacement={endpoint:'https://push.example.test/new',
    async unsubscribe(){calls.push('replacement');return true;}};
  const registration={pushManager:{
    async getSubscription(){calls.push('get-current');return replacement;},
  }};
  const result=await unsubscribeWebPush({registration,subscription:old});
  assert.deepEqual(result,{ok:true,changed:true});
  assert.deepEqual(calls,['old'],'never reacquire another tab\'s endpoint');
});

test('M45 original no-target PWA unsubscribe API remains backward compatible',async()=>{
  const {unsubscribeWebPush}=await import('../src/m26/platform/pwa.js');
  let unsubscribed=0;
  const registration={pushManager:{
    async getSubscription(){return {async unsubscribe(){unsubscribed+=1;return true;}};},
  }};
  const result=await unsubscribeWebPush({registration});
  assert.equal(result.ok,true);
  assert.equal(unsubscribed,1);
});


test('M45 unsuccessful local unsubscribe never confirms device push deactivation',async()=>{
  const h=harness({unsubscribeOk:false});
  const pending=h.coordinator.disableCurrent();
  await h.started.promise;
  h.finish.resolve();
  await assert.rejects(()=>pending,/M26_PUSH_UNSUBSCRIBE_NOT_CONFIRMED/);
  assert.equal(h.recorded.filter(x=>x.action==='revoke').length,1);
  assert.equal(h.recorded.filter(x=>x.action==='unsubscribe').length,1);
});

test('M45 disable-current refuses unconfirmed server revoke without unsubscribing browser',async()=>{
  const h=harness({revokeOk:false});
  const pending=h.coordinator.disableCurrent();
  await h.started.promise;
  h.finish.resolve();
  await assert.rejects(()=>pending,/M26_PUSH_REVOKE_NOT_CONFIRMED/);
  assert.equal(h.recorded.filter(x=>x.action==='revoke').length,1);
  assert.equal(h.recorded.filter(x=>x.action==='unsubscribe').length,0);
});

test('M45: device revoke with zero owned rows must never unsubscribe a foreign endpoint',async()=>{
  const h=harness({revokeDeletedCount:0});
  const pending=h.coordinator.disableCurrent();
  await h.started.promise;
  h.finish.resolve();
  await assert.rejects(()=>pending,/M45_PUSH_OWNERSHIP_NOT_CONFIRMED/);
  assert.equal(h.recorded.filter(x=>x.action==='revoke').length,1);
  assert.equal(h.recorded.filter(x=>x.action==='unsubscribe').length,0);
});

test('M45: malformed revoke row count cannot authorize browser unsubscribe',async()=>{
  const h=harness({revokeDeletedCount:'invalid'});
  const pending=h.coordinator.disableCurrent();
  await h.started.promise;
  h.finish.resolve();
  await assert.rejects(()=>pending,/M45_PUSH_OWNERSHIP_NOT_CONFIRMED/);
  assert.equal(h.recorded.filter(x=>x.action==='unsubscribe').length,0);
});

test('M45 explains foreign endpoint without offering a false push deactivation receipt',async()=>{
  const {__communicationControllerInternals}=await import('../src/m26/communication/controller.js');
  const copy=__communicationControllerInternals.pushErrorMessage(new Error('M45_PUSH_OWNERSHIP_NOT_CONFIRMED'));
  assert.match(copy,/no corresponde a tu cuenta activa/);
  assert.match(copy,/No se ha eliminado/);
  assert.doesNotMatch(copy,/Avisos desactivados/);
});
