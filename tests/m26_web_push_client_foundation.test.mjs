import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getIberfitPushSubscription,
  serializeIberfitPushSubscription,
  subscribeIberfitWebPush,
  unsubscribeIberfitWebPush,
  urlBase64ToUint8Array,
  webPushCapability,
} from '../src/m26/platform/pwa.js';

test('web push capability fails closed outside a secure complete environment',()=>{
  assert.equal(webPushCapability({secureContext:false}).supported,false);
  assert.equal(webPushCapability({
    secureContext:true,
    navigatorObject:{serviceWorker:{}},
    notificationApi:{permission:'default'},
    pushManagerApi:function PushManager(){},
  }).supported,true);
});

test('VAPID public key conversion accepts base64url and rejects malformed input',()=>{
  assert.deepEqual([...urlBase64ToUint8Array('AQIDBA')],[1,2,3,4]);
  assert.throws(()=>urlBase64ToUint8Array('not valid !!!'),/M26_PUSH_PUBLIC_KEY_INVALID/);
});

test('subscription serialization only accepts HTTPS endpoints and complete keys',()=>{
  const subscription={
    endpoint:'https://push.example.test/subscription/abc',
    expirationTime:null,
    toJSON(){
      return {keys:{p256dh:'AQIDBA',auth:'BQYHCA'}};
    },
  };

  assert.deepEqual(serializeIberfitPushSubscription(subscription),{
    endpoint:'https://push.example.test/subscription/abc',
    expirationTime:null,
    keys:{p256dh:'AQIDBA',auth:'BQYHCA'},
  });

  assert.throws(()=>serializeIberfitPushSubscription({...subscription,endpoint:'http://push.example.test/x'}),/M26_PUSH_ENDPOINT_INSECURE/);
  assert.throws(()=>serializeIberfitPushSubscription({...subscription,toJSON(){return {keys:{p256dh:'AQIDBA'}};}}),/M26_PUSH_KEYS_REQUIRED/);
});

test('permission is requested only by the explicit subscribe operation and denial fails closed',async()=>{
  let permissionRequests=0;
  let subscribeCalls=0;
  const notificationApi={
    permission:'default',
    async requestPermission(){
      permissionRequests+=1;
      return 'denied';
    },
  };
  const registration={
    pushManager:{
      async getSubscription(){return null;},
      async subscribe(){subscribeCalls+=1;return null;},
    },
  };

  await assert.rejects(
    subscribeIberfitWebPush({registration,applicationServerKey:'AQIDBA',notificationApi}),
    /M26_PUSH_PERMISSION_NOT_GRANTED/,
  );
  assert.equal(permissionRequests,1);
  assert.equal(subscribeCalls,0);
});

test('explicit subscribe reuses an existing subscription without creating duplicates',async()=>{
  const existing={
    endpoint:'https://push.example.test/subscription/existing',
    expirationTime:null,
    toJSON(){return {keys:{p256dh:'AQIDBA',auth:'BQYHCA'}};},
  };
  let subscribeCalls=0;
  const registration={
    pushManager:{
      async getSubscription(){return existing;},
      async subscribe(){subscribeCalls+=1;return existing;},
    },
  };
  const result=await subscribeIberfitWebPush({
    registration,
    applicationServerKey:'AQIDBA',
    notificationApi:{permission:'granted',requestPermission:async()=>{throw new Error('must not request');}},
  });

  assert.equal(result.endpoint,existing.endpoint);
  assert.equal(subscribeCalls,0);
});

test('unsubscribe is idempotent and returns endpoint only to the caller for server revocation',async()=>{
  assert.equal(await getIberfitPushSubscription({pushManager:{getSubscription:async()=>null}}),null);
  assert.deepEqual(
    await unsubscribeIberfitWebPush({pushManager:{getSubscription:async()=>null}}),
    {unsubscribed:true,hadSubscription:false},
  );

  const existing={
    endpoint:'https://push.example.test/subscription/existing',
    expirationTime:null,
    toJSON(){return {keys:{p256dh:'AQIDBA',auth:'BQYHCA'}};},
    async unsubscribe(){return true;},
  };
  assert.deepEqual(
    await unsubscribeIberfitWebPush({pushManager:{getSubscription:async()=>existing}}),
    {unsubscribed:true,hadSubscription:true,endpoint:existing.endpoint},
  );
});
