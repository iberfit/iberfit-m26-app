import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {
  WEARABLE_FOREGROUND_MIN_INTERVAL_MS,
  assertWearableClientContinuity,
  createWearableForegroundSync,
  isCertifiedNativeAutoSyncSource,
} from '../src/m26/wearables/foreground-sync.js';

test('foreground: one in-flight read for repeated page focus and pageshow events',async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let calls=0;
  const sync=createWearableForegroundSync({
    now:()=>10_000,
    canRun:()=>true,
    run:async()=>{calls+=1;await gate;return ['synced'];},
  });
  const first=sync.trigger();
  const duplicate=sync.trigger();
  const online=sync.trigger({force:true});
  assert.strictEqual(first,duplicate);
  assert.strictEqual(first,online);
  await Promise.resolve();
  assert.equal(calls,1);
  release();
  assert.deepEqual(await first,['synced']);
  assert.deepEqual(await sync.trigger(),{skipped:'recently-checked'});
  assert.equal(calls,1);
});

test('foreground: do not use health bridge in hidden, logged out, offline or blocked state',async()=>{
  let eligible=false;
  let calls=0;
  const sync=createWearableForegroundSync({
    canRun:()=>eligible,
    run:async()=>{calls+=1;},
  });
  assert.deepEqual(await sync.trigger({force:true}),{skipped:'inactive'});
  assert.equal(calls,0);
  eligible=true;
  await sync.trigger();
  assert.equal(calls,1);
  eligible=false;
  assert.deepEqual(await sync.trigger({force:true}),{skipped:'inactive'});
  assert.equal(calls,1);
});

test('foreground: bounded cooldown, forced reconnect and no unbounded retry',async()=>{
  let time=0,calls=0;
  const sync=createWearableForegroundSync({
    now:()=>time,
    canRun:()=>true,
    minIntervalMs:WEARABLE_FOREGROUND_MIN_INTERVAL_MS,
    run:async()=>{calls+=1;return calls;},
  });
  assert.equal(await sync.trigger(),1);
  time=1000;
  assert.deepEqual(await sync.trigger(),{skipped:'recently-checked'});
  assert.equal(await sync.trigger({force:true}),2);
  time=WEARABLE_FOREGROUND_MIN_INTERVAL_MS+1000;
  assert.equal(await sync.trigger(),3);
});

test('foreground: cancelled preflight after logout never starts native read',async()=>{
  let calls=0;
  const sync=createWearableForegroundSync({
    canRun:()=>true,
    run:()=>{calls+=1;},
  });
  const pending=sync.trigger();
  sync.invalidate();
  assert.deepEqual(await pending,{skipped:'invalidated'});
  assert.equal(calls,0);
  await sync.trigger();
  assert.equal(calls,1);
});

test('foreground: failure is surfaced but does not freeze later reconciliation',async()=>{
  let time=0,calls=0;
  const sync=createWearableForegroundSync({
    now:()=>time,
    canRun:()=>true,
    run:async()=>{calls++;if(calls===1)throw Error('M26_NETWORK_UNAVAILABLE');return 'recovered';},
  });
  await assert.rejects(sync.trigger(),/M26_NETWORK_UNAVAILABLE/u);
  time=WEARABLE_FOREGROUND_MIN_INTERVAL_MS;
  assert.equal(await sync.trigger(),'recovered');
  assert.equal(calls,2);
});

test('foreground: same Client shared across two auth users cannot reuse old sensor response',()=>{
  const previous={role:'client',clientId:'same-shared-client',ownerId:'signed-in-A'};
  assert.equal(assertWearableClientContinuity(previous,{...previous}),true);
  assert.throws(()=>assertWearableClientContinuity(previous,{
    role:'client',clientId:'same-shared-client',ownerId:'signed-in-B',
  }),/M26_WEARABLE_ACCOUNT_CHANGED/u);
  assert.throws(()=>assertWearableClientContinuity(previous,{
    role:'client',clientId:'same-shared-client',
  }),/M26_WEARABLE_ACCOUNT_CHANGED/u);
  assert.throws(()=>assertWearableClientContinuity(previous,{
    role:'coach',clientId:'same-shared-client',ownerId:'signed-in-A',
  }),/M26_WEARABLE_ACCOUNT_CHANGED/u);
});

test('foreground: original Client identity must survive every permission, grant and sensor await',()=>{
  const expected={role:'client',clientId:'owner-client-a'};
  assert.equal(assertWearableClientContinuity(expected,{role:'client',clientId:'owner-client-a'}),true);
  for(const actual of [
    {role:'client',clientId:'owner-client-b'},
    {role:'coach',clientId:'owner-client-a'},
    {role:'admin',clientId:'owner-client-a'},
    {role:'client',clientId:null},
    null,
  ]){
    assert.throws(()=>assertWearableClientContinuity(expected,actual),/M26_WEARABLE_ACCOUNT_CHANGED/u);
  }
});

test('Connected360 foreground lifecycle is Client-only, reuses prior grant and does not request background Health permissions',()=>{
  const c=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const foreground=c.slice(c.indexOf('const foregroundSync=createWearableForegroundSync'),c.indexOf('async function connectHealthConnect'));
  const native=c.slice(c.indexOf('async function connectNativeProvider('),c.indexOf('async function autoSyncNativeProviders('));
  assert.match(foreground,/mounted&&role==='client'&&Boolean\(clientId\)&&Boolean\(isOnline\(\)\)/u);
  assert.match(foreground,/visibilityState!=='hidden'/u);
  assert.match(c,/root\.ownerDocument\?\.addEventListener\?\.\('visibilitychange',onForegroundVisibility\)/u);
  assert.match(c,/globalThis\.addEventListener\?\.\('pageshow',onPageShow\)/u);
  assert.match(c,/globalThis\.removeEventListener\?\.\('pageshow',onPageShow\)/u);
  assert.match(c,/root\.ownerDocument\?\.removeEventListener\?\.\('visibilitychange',onForegroundVisibility\)/u);
  assert.match(c,/requestForegroundSync\(\{force:true\}\)/u);
  assert.match(c,/foregroundSync\.invalidate\(\)/u);
  assert.match(native,/const requireSameClient=/u);
  assert.match(native,/ownerId:sessionOwner/u);
  assert.match(native,/String\(sessionOwner\)!==String\(ownerId\)/u);
  assert.ok((native.match(/requireSameClient\(\);/gu)||[]).length>=5);
  assert.match(native,/if\(!nativePolicy\?\.productionAllowed\)/u);
  assert.match(native,/interactive\s*\?await remoteSync\.reauthorize\(/u);
  assert.match(native,/:await remoteSync\.currentAuthorization\(/u);
  assert.doesNotMatch(foreground,/reauthorizeWearable|requestAuthorization|READ_HEALTH_DATA_IN_BACKGROUND/u);
});

test('Connected360 never silently reinterprets a manual import as a certified linked watch',()=>{
  const base={
    provider:'health_connect',status:'active',sync_enabled:true,
    scopes:['steps','sleepMinutes'],
    metadata:{mode:'certified_native',automatic:true},
  };
  assert.equal(isCertifiedNativeAutoSyncSource(base),true);
  assert.equal(isCertifiedNativeAutoSyncSource({...base,metadata:{mode:'confirmed_import',automatic:false}}),false);
  assert.equal(isCertifiedNativeAutoSyncSource({...base,metadata:{mode:'native_bridge',automatic:true}}),false);
  assert.equal(isCertifiedNativeAutoSyncSource({...base,sync_enabled:false}),false);
  assert.equal(isCertifiedNativeAutoSyncSource({...base,status:'revoked'}),false);
  assert.equal(isCertifiedNativeAutoSyncSource({...base,scopes:[]}),false);
  assert.equal(isCertifiedNativeAutoSyncSource({...base,metadata:{mode:'certified_native'}}),false);
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  assert.match(controller,/rows\.filter\(isCertifiedNativeAutoSyncSource\)/u);
  assert.match(controller,/wearableZeroCostPolicy\(provider\)\?\.productionAllowed&&bridge\.isAvailable\(provider\)/u);
});

test('foreground: logout aborts old read and new Client starts without waiting for old promise',async()=>{
  const resolves=[];
  const signals=[];
  const sync=createWearableForegroundSync({
    canRun:()=>true,
    now:()=>10_000,
    run:({signal})=>new Promise(resolve=>{
      signals.push(signal);
      resolves.push(resolve);
    }),
  });
  const old=sync.trigger();
  await Promise.resolve();
  assert.equal(signals.length,1);
  assert.equal(signals[0].aborted,false);
  sync.invalidate();
  assert.equal(signals[0].aborted,true);
  const next=sync.trigger();
  assert.notStrictEqual(next,old);
  await Promise.resolve();
  assert.equal(signals.length,2);
  assert.equal(signals[1].aborted,false);
  resolves[1]({client:'new'});
  assert.deepEqual(await next,{client:'new'});
  resolves[0]({client:'old'});
  assert.deepEqual(await old,{skipped:'invalidated'});
});

test('foreground: rejected old account callback is discarded and cannot block retry',async()=>{
  let rejectOld,resolveNew;
  let requests=0;
  const sync=createWearableForegroundSync({
    canRun:()=>true,
    run:({signal})=>{
      requests++;
      if(requests===1)return new Promise((_,reject)=>{rejectOld=reject;});
      assert.equal(signal.aborted,false);
      return new Promise(resolve=>{resolveNew=resolve;});
    },
  });
  const old=sync.trigger();
  await Promise.resolve();
  sync.invalidate();
  const next=sync.trigger();
  await Promise.resolve();
  rejectOld(new Error('M26_OLD_CLIENT_PRIVATE_ERROR'));
  assert.deepEqual(await old,{skipped:'invalidated'});
  resolveNew({ok:true});
  assert.deepEqual(await next,{ok:true});
  assert.equal(requests,2);
});

test('foreground: session teardown invalidates scheduled preflight and resets cooldown',async()=>{
  let eligible=true,started=0;
  const sync=createWearableForegroundSync({
    now:()=>1_000,
    canRun:()=>eligible,
    run:async({signal})=>{assert.equal(signal.aborted,false);started++;return {ok:true};},
  });
  const old=sync.trigger();
  eligible=false;
  sync.invalidate();
  assert.deepEqual(await old,{skipped:'invalidated'});
  assert.deepEqual(await sync.trigger(),{skipped:'inactive'});
  eligible=true;
  assert.deepEqual(await sync.trigger(),{ok:true});
  assert.equal(started,1);
});

test('foreground: one rotated account terminates provider cycle before another native source',()=>{
  const c=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const body=c.slice(c.indexOf('async function autoSyncNativeProviders('),
    c.indexOf('const foregroundSync=createWearableForegroundSync'));
  assert.match(body,/const session=context\(store\)/u);
  assert.match(body,/session\.ownerId/u);
  assert.match(body,/assertWearableClientContinuity\(session,context\(store\)\)/u);
  assert.match(body,/error\?\.message==='M26_WEARABLE_ACCOUNT_CHANGED'\)break/u);
  assert.match(body,/String\(session\.ownerId\)!==String\(ownerId\)/u);
});

test('Connected360 native foreground operations respect abort before a consent grant or write',()=>{
  const c=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const native=c.slice(c.indexOf('async function connectNativeProvider('),c.indexOf('const foregroundSync=createWearableForegroundSync'));
  assert.match(native,/signal=null/u);
  assert.match(native,/if\(signal\?\.aborted\)throw new Error\('M26_WEARABLE_SYNC_INVALIDATED'\)/u);
  assert.match(c,/run:autoSyncNativeProviders/u);
  assert.match(native,/connectNativeProvider\(provider,\{interactive:false,silent:true,signal\}\)/u);
  assert.match(native,/if\(signal\?\.aborted\)break/u);
  const indexGrant=native.indexOf('remoteSync.currentAuthorization');
  const indexWrite=native.indexOf('remoteSync.stage({');
  assert.ok(indexGrant>0&&indexWrite>indexGrant);
  assert.ok(native.slice(indexGrant,indexWrite).includes('requireSameClient();'));
});

test('Connected360 native foreground reads are cancelled on hidden, offline and pagehide, then resume only in foreground',()=>{
  const c=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const hidden=c.slice(c.indexOf('function onForegroundVisibility(){'),c.indexOf('function onPageShow(){'));
  assert.match(hidden,/visibilityState==='hidden'/u);
  assert.ok((hidden.match(/foregroundSync\.invalidate\(\)/gu)||[]).length>=2);
  const offline=c.slice(c.indexOf('function onOffline(){'),c.indexOf('return Object.freeze({\n    mount(',c.indexOf('function onOffline(){')));
  assert.match(offline,/foregroundSync\.invalidate\(\)/u);
  assert.match(c,/addEventListener\?\.\('pagehide',onPageHide\)/u);
  assert.match(c,/removeEventListener\?\.\('pagehide',onPageHide\)/u);
  assert.match(c,/addEventListener\?\.\('pageshow',onPageShow\)/u);
  assert.match(c,/removeEventListener\?\.\('pageshow',onPageShow\)/u);
  assert.match(c,/if\(doc\?\.visibilityState!=='hidden'\)requestForegroundSync\(\)/u);
});
