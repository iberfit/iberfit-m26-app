import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebPushCoordinator,__webPushCoordinatorInternals} from '../src/m26/communication/web-push.js';

const baseState=Object.freeze({supported:true,secure:true,configured:true,permission:'granted',subscribed:false,active:false,reason:'not-subscribed'});
const serialized=Object.freeze({endpoint:'https://push.example.test/device-a',expirationTime:null,keys:Object.freeze({p256dh:'p256dh',auth:'auth'})});

function harness({state=baseState,online=true,subscribeCreated=true,upsertError=null,permissionResult={ok:true,permission:'granted',reason:null},existingSubscription=null,statusResponse={ok:true,active:false,subscriptionCount:0,updatedAt:null}}={}){
  const calls=[];
  const subscription=existingSubscription||{endpoint:serialized.endpoint,getKey:(name)=>new Uint8Array(name==='p256dh'?[1,2,3]:[4,5,6]).buffer};
  const registration={pushManager:{getSubscription:async()=>existingSubscription}};
  const transport={
    webPushStatus:async(token,endpoint)=>{calls.push(['status',token,endpoint??null]);return statusResponse;},
    webPushUpsert:async(token,payload)=>{calls.push(['upsert',token,payload]);if(upsertError)throw upsertError;return {ok:true,active:true,subscriptionCount:1,updatedAt:'2026-09-19T19:00:00Z'};},
    webPushRevoke:async(token,endpoint)=>{calls.push(['revoke',token,endpoint??null]);return {ok:true,active:false,deletedCount:endpoint?1:2};},
  };
  const coordinator=createWebPushCoordinator({
    transport,
    getToken:async()=>{calls.push(['token']);return 'jwt-user';},
    getRegistration:async()=>registration,
    vapidPublicKey:'public-key-present-for-injected-tests',
    isOnline:()=>online,
    inspect:async()=>state,
    requestPermission:async()=>{calls.push(['permission']);return permissionResult;},
    subscribe:async()=>{calls.push(['subscribe']);return {subscription,serialized,created:subscribeCreated};},
    unsubscribe:async()=>{calls.push(['unsubscribe']);return {ok:true,changed:true};},
  });
  return {coordinator,calls,registration,subscription};
}

test('status is passive and never requests browser permission',async()=>{
  const {coordinator,calls}=harness();
  const result=await coordinator.status();
  assert.equal(result.active,false);
  assert.equal(result.backendActive,false);
  assert.equal(result.reason,'not-subscribed');
  assert.equal(calls.some(([kind])=>kind==='permission'),false);
  assert.equal(calls.filter(([kind])=>kind==='status').length,1);
  assert.equal(calls.find(([kind])=>kind==='status')[2],null);
});

test('status asks backend about this exact browser endpoint so another device cannot create a false positive',async()=>{
  const existing={endpoint:serialized.endpoint};
  const {coordinator,calls}=harness({
    state:{...baseState,subscribed:true,active:true,reason:null},
    existingSubscription:existing,
    statusResponse:{ok:true,active:false,subscriptionCount:2,updatedAt:'2026-09-19T19:00:00Z'},
  });
  const result=await coordinator.status();
  assert.equal(result.active,false);
  assert.equal(result.backendActive,false);
  assert.equal(result.subscriptionCount,2);
  assert.equal(result.reason,'server-registration-required');
  assert.equal(calls.find(([kind])=>kind==='status')[2],serialized.endpoint);
});

test('offline status never contacts backend and does not claim a local subscription is fully active',async()=>{
  const existing={endpoint:serialized.endpoint};
  const {coordinator,calls}=harness({online:false,state:{...baseState,subscribed:true,active:true,reason:null},existingSubscription:existing});
  const result=await coordinator.status();
  assert.equal(result.active,false);
  assert.equal(result.reason,'server-status-unavailable');
  assert.equal(calls.some(([kind])=>kind==='status'),false);
});

test('enable requests permission only from the explicit enable action then persists server-side',async()=>{
  const {coordinator,calls}=harness({state:{...baseState,permission:'default',reason:'permission-required'}});
  const result=await coordinator.enable();
  assert.equal(result.ok,true);
  assert.equal(result.active,true);
  assert.equal(result.created,true);
  assert.deepEqual(calls.filter(([kind])=>['permission','subscribe','upsert'].includes(kind)).map(([kind])=>kind),['permission','subscribe','upsert']);
  assert.deepEqual(calls.find(([kind])=>kind==='upsert')[2],serialized);
});

test('enable rolls back a newly-created browser subscription if backend persistence fails',async()=>{
  const {coordinator,calls}=harness({subscribeCreated:true,upsertError:new Error('push_endpoint_conflict')});
  await assert.rejects(()=>coordinator.enable(),/push_endpoint_conflict/);
  assert.equal(calls.filter(([kind])=>kind==='unsubscribe').length,1);
});

test('enable preserves a pre-existing browser subscription if backend persistence fails',async()=>{
  const existing={endpoint:serialized.endpoint,getKey:()=>new Uint8Array([1,2,3]).buffer};
  const {coordinator,calls}=harness({subscribeCreated:false,upsertError:new Error('temporary_backend_failure'),existingSubscription:existing});
  await assert.rejects(()=>coordinator.enable(),/temporary_backend_failure/);
  assert.equal(calls.some(([kind])=>kind==='unsubscribe'),false);
});

test('disable current device revokes by endpoint before local unsubscribe and does not require push keys',async()=>{
  const existing={endpoint:serialized.endpoint,getKey:()=>{throw new Error('keys must not be read while revoking');}};
  const {coordinator,calls}=harness({existingSubscription:existing});
  const result=await coordinator.disableCurrent();
  assert.equal(result.ok,true);
  const revokeIndex=calls.findIndex(([kind])=>kind==='revoke');
  const unsubscribeIndex=calls.findIndex(([kind])=>kind==='unsubscribe');
  assert.ok(revokeIndex>=0&&unsubscribeIndex>revokeIndex);
  assert.equal(calls[revokeIndex][2],serialized.endpoint);
});

test('invalid endpoint fails closed before a revoke request',async()=>{
  const existing={endpoint:'http://push.example.test/device-a'};
  const {coordinator,calls}=harness({existingSubscription:existing});
  await assert.rejects(()=>coordinator.disableCurrent(),/M26_PUSH_ENDPOINT_INVALID/);
  assert.equal(calls.some(([kind])=>kind==='revoke'),false);
});

test('disable all devices revokes server registrations and also removes this browser subscription when present',async()=>{
  const existing={endpoint:serialized.endpoint};
  const {coordinator,calls}=harness({existingSubscription:existing});
  const result=await coordinator.disableAll();
  assert.equal(result.ok,true);
  assert.equal(result.deletedCount,2);
  assert.deepEqual(calls.find(([kind])=>kind==='revoke').slice(1),['jwt-user',null]);
  assert.equal(calls.some(([kind])=>kind==='unsubscribe'),true);
});

test('enable fails closed when unsupported, unconfigured, denied, or offline',async()=>{
  const unsupported=harness({state:{...baseState,supported:false,reason:'unsupported'}});
  await assert.rejects(()=>unsupported.coordinator.enable(),/M26_PUSH_UNSUPPORTED/);
  assert.equal(unsupported.calls.some(([kind])=>kind==='permission'),false);

  const unconfigured=harness({state:{...baseState,configured:false,reason:'not-configured'}});
  await assert.rejects(()=>unconfigured.coordinator.enable(),/M26_PUSH_VAPID_PUBLIC_KEY_INVALID/);

  const denied=harness({state:{...baseState,permission:'denied',reason:'permission-denied'}});
  await assert.rejects(()=>denied.coordinator.enable(),/M26_PUSH_PERMISSION_DENIED/);
  assert.equal(denied.calls.some(([kind])=>kind==='permission'),false);

  const offline=harness({online:false});
  await assert.rejects(()=>offline.coordinator.enable(),/M26_PUSH_ONLINE_REQUIRED/);
});

test('push endpoint normalization accepts only bounded HTTPS endpoints',()=>{
  assert.equal(__webPushCoordinatorInternals.pushEndpoint(' https://push.example.test/a '),'https://push.example.test/a');
  assert.throws(()=>__webPushCoordinatorInternals.pushEndpoint('javascript:alert(1)'),/M26_PUSH_ENDPOINT_INVALID/);
});
