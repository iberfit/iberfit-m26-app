import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  __webPushInternals,
  inspectWebPushState,
  requestWebPushPermission,
  serializePushSubscription,
} from '../src/m26/communication/push-service.js';

function validVapidPublicKey(){
  return Buffer.from(Uint8Array.from({length:65},(_,index)=>index===0?4:index)).toString('base64url');
}

function keyBuffer(value){
  return Uint8Array.from(Buffer.from(value)).buffer;
}

test('web push remains fail-closed when browser support is missing',async()=>{
  const state=await inspectWebPushState({
    target:{isSecureContext:true,location:{protocol:'https:',hostname:'app.iberfit.cl'}},
    navigatorLike:{},
    vapidPublicKey:validVapidPublicKey(),
  });
  assert.equal(state.supported,false);
  assert.equal(state.active,false);
  assert.equal(state.reason,'unsupported');
});

test('web push distinguishes configuration from user permission',async()=>{
  const target={
    isSecureContext:true,
    location:{protocol:'https:',hostname:'app.iberfit.cl'},
    PushManager:function PushManager(){},
    Notification:{permission:'default'},
  };
  const navigatorLike={
    serviceWorker:{
      async getRegistration(){return null;},
    },
  };
  const state=await inspectWebPushState({target,navigatorLike,vapidPublicKey:validVapidPublicKey()});
  assert.equal(state.supported,true);
  assert.equal(state.configured,true);
  assert.equal(state.permission,'default');
  assert.equal(state.active,false);
  assert.equal(state.reason,'permission-required');
});

test('permission request is explicit and never treats dismissal as consent',async()=>{
  let calls=0;
  const target={
    isSecureContext:true,
    location:{protocol:'https:',hostname:'app.iberfit.cl'},
    PushManager:function PushManager(){},
    navigator:{serviceWorker:{}},
    Notification:{
      permission:'default',
      async requestPermission(){calls+=1;return 'default';},
    },
  };
  const result=await requestWebPushPermission({target});
  assert.equal(calls,1);
  assert.equal(result.ok,false);
  assert.equal(result.permission,'default');
  assert.equal(result.reason,'permission-dismissed');
});

test('subscription serialization requires https endpoint and both browser keys',()=>{
  const subscription={
    endpoint:'https://push.example.test/subscription/123',
    expirationTime:null,
    getKey(name){
      if(name==='p256dh')return keyBuffer('public-key');
      if(name==='auth')return keyBuffer('auth-key');
      return null;
    },
  };
  const serialized=serializePushSubscription(subscription);
  assert.equal(serialized.endpoint,subscription.endpoint);
  assert.equal(serialized.expirationTime,null);
  assert.ok(serialized.keys.p256dh);
  assert.ok(serialized.keys.auth);
  assert.throws(
    ()=>serializePushSubscription({...subscription,endpoint:'http://push.example.test/subscription/123'}),
    /M26_PUSH_ENDPOINT_INVALID/
  );
});

test('service worker push preview is privacy-safe and navigation is same-origin constrained',()=>{
  const source=readFileSync(new URL('../public/m26/iberfit-sw.js',import.meta.url),'utf8');
  assert.match(source,/addEventListener\('push'/);
  assert.match(source,/addEventListener\('notificationclick'/);
  assert.match(source,/Actualización IBERFIT/);
  assert.match(source,/Abre IBERFIT para revisar el detalle de forma segura\./);
  assert.match(source,/safePushPath/);
  assert.match(source,/url\.origin!==self\.location\.origin/);
  assert.doesNotMatch(source,/body\s*:\s*payload\.body/);
  assert.doesNotMatch(source,/title\s*:\s*payload\.title/);
});

test('VAPID public key validation rejects missing and malformed values',()=>{
  assert.equal(__webPushInternals.normalizePublicKey(''),null);
  assert.equal(__webPushInternals.normalizePublicKey('not-a-key'),null);
  assert.equal(__webPushInternals.normalizePublicKey(validVapidPublicKey())?.length,65);
});
