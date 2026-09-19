import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunicationService} from '../src/m26/communication/service.js';

const ENDPOINT='https://push.example.test/device-a';
const SERIALIZED=Object.freeze({endpoint:ENDPOINT,expirationTime:null,keys:Object.freeze({p256dh:'p256dh-key',auth:'auth-key'})});

function harness({
  browser={supported:true,configured:true,permission:'granted',subscribed:true,active:true,reason:null},
  account={ok:true,active:true,subscriptionCount:1,updatedAt:null},
  device={ok:true,deviceActive:true,subscriptionCount:1},
  online=true,
  localSubscription={endpoint:ENDPOINT},
  subscribeCreated=false,
  upsertError=null,
  unsubscribeOk=true,
}={}){
  const events=[];
  const registration={
    pushManager:{
      async getSubscription(){events.push('local:get');return localSubscription;},
    },
  };
  const navigatorLike={serviceWorker:{async getRegistration(){events.push('sw:get');return registration;}}};
  const pushApi={
    async inspectWebPushState(){events.push('browser:inspect');return browser;},
    async registerM26ServiceWorker(){events.push('sw:register');return {supported:true,registration};},
    async requestWebPushPermission(){events.push('permission:request');return {ok:true,permission:'granted',reason:null};},
    serializePushSubscription(){events.push('subscription:serialize');return SERIALIZED;},
    async subscribeWebPush(){events.push('subscription:subscribe');return {subscription:localSubscription,serialized:SERIALIZED,created:subscribeCreated};},
    async unsubscribeWebPush(){events.push('subscription:unsubscribe');return {ok:unsubscribeOk,changed:unsubscribeOk};},
  };
  const transport={
    async webPushStatus(){events.push('server:account-status');return account;},
    async webPushDeviceStatus(_token,endpoint){events.push(`server:device-status:${endpoint}`);return device;},
    async webPushUpsert(_token,payload){events.push(`server:upsert:${payload.endpoint}`);if(upsertError)throw upsertError;return {ok:true,active:true,updatedAt:null};},
    async webPushRevoke(_token,endpoint){events.push(`server:revoke:${endpoint}`);return {ok:true,active:false,deletedCount:1};},
  };
  const service=createCommunicationService({
    transport,
    getToken:async()=>{events.push('auth:token');return 'jwt-user';},
    getState:()=>({}),
    getRole:()=> 'client',
    isOnline:()=>online,
    refreshState:async()=>{},
    pushApi,
    target:{Notification:{permission:'granted'}},
    navigatorLike,
    getVapidPublicKey:()=> 'vapid-public-key',
  });
  return {service,events,registration,pushApi,transport};
}

test('account subscription on another device never marks the current device active',async()=>{
  const {service}=harness({
    account:{ok:true,active:true,subscriptionCount:2,updatedAt:null},
    device:{ok:true,deviceActive:false,subscriptionCount:2},
  });
  const state=await service.webPushState();
  assert.equal(state.accountActive,true);
  assert.equal(state.subscriptionCount,2);
  assert.equal(state.deviceActive,false);
  assert.equal(state.active,false);
  assert.equal(state.recoveryRequired,true);
  assert.equal(state.reason,'server-reconciliation-required');
});

test('state without a local subscription can report other account devices without leaking endpoint data',async()=>{
  const {service,events}=harness({
    browser:{supported:true,configured:true,permission:'granted',subscribed:false,active:false,reason:'not-subscribed'},
    account:{ok:true,active:true,subscriptionCount:3,updatedAt:null},
    localSubscription:null,
  });
  const state=await service.webPushState();
  assert.equal(state.active,false);
  assert.equal(state.deviceActive,false);
  assert.equal(state.accountActive,true);
  assert.equal(state.subscriptionCount,3);
  assert.equal(state.reason,'not-subscribed');
  assert.equal(events.some((item)=>item.startsWith('server:device-status:')),false);
  assert.equal('endpoint' in state,false);
});

test('activation only requests permission when explicitly invoked and persists the exact browser subscription',async()=>{
  const {service,events}=harness({subscribeCreated:true});
  assert.equal(events.includes('permission:request'),false);
  await service.webPushState();
  assert.equal(events.includes('permission:request'),false);
  events.length=0;
  await service.activateWebPush();
  assert.equal(events.filter((item)=>item==='permission:request').length,1);
  assert.ok(events.includes(`server:upsert:${ENDPOINT}`));
});

test('new local subscription is rolled back if authenticated persistence fails',async()=>{
  const persistenceError=new Error('M26_PUSH_UPSERT_NOT_CONFIRMED');
  const {service,events}=harness({subscribeCreated:true,upsertError:persistenceError});
  await assert.rejects(()=>service.activateWebPush(),/M26_PUSH_UPSERT_NOT_CONFIRMED/);
  const upsertIndex=events.indexOf(`server:upsert:${ENDPOINT}`);
  const unsubscribeIndex=events.indexOf('subscription:unsubscribe');
  assert.ok(upsertIndex>=0);
  assert.ok(unsubscribeIndex>upsertIndex);
});

test('deactivation revokes the exact server endpoint before local unsubscribe',async()=>{
  const {service,events}=harness();
  await service.deactivateWebPush();
  const revokeIndex=events.indexOf(`server:revoke:${ENDPOINT}`);
  const unsubscribeIndex=events.indexOf('subscription:unsubscribe');
  assert.ok(revokeIndex>=0);
  assert.ok(unsubscribeIndex>revokeIndex);
});

test('failed local unsubscribe never restores a server endpoint and exposes a recoverable error',async()=>{
  const {service,events}=harness({unsubscribeOk:false});
  await assert.rejects(()=>service.deactivateWebPush(),/M26_PUSH_LOCAL_UNSUBSCRIBE_FAILED/);
  assert.ok(events.includes(`server:revoke:${ENDPOINT}`));
  assert.ok(events.includes('subscription:unsubscribe'));
});

test('push mutation fails closed while offline without requesting browser permission',async()=>{
  const {service,events}=harness({online:false});
  await assert.rejects(()=>service.activateWebPush(),/M26_COMMUNICATION_ONLINE_REQUIRED/);
  assert.equal(events.includes('permission:request'),false);
});
