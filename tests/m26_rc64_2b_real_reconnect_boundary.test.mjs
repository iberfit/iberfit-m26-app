import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  observeConnectivity,
  createConnectivitySync,
} from '../src/m26/platform/pwa.js';
import {createTelemetryRemoteSync} from '../src/m26/telemetry/remote-sync.js';
import {createWearableController} from '../src/m26/wearables/controller.js';

const tick=()=>new Promise((resolve)=>setImmediate(resolve));
const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

async function withGlobalConnectivityBus(run){
  const bus=new EventTarget();
  const previousAdd=globalThis.addEventListener;
  const previousRemove=globalThis.removeEventListener;

  globalThis.addEventListener=bus.addEventListener.bind(bus);
  globalThis.removeEventListener=bus.removeEventListener.bind(bus);

  try{
    return await run(bus);
  }finally{
    if(previousAdd===undefined)delete globalThis.addEventListener;
    else globalThis.addEventListener=previousAdd;

    if(previousRemove===undefined)delete globalThis.removeEventListener;
    else globalThis.removeEventListener=previousRemove;
  }
}

function wearableHarness(role){
  const status={textContent:'unchanged',dataset:{}};
  const root=new EventTarget();

  root.querySelector=(selector)=>
    selector==='[data-wearable-status]'
      ?status
      :null;

  root.querySelectorAll=()=>[];

  const state={
    identity:{
      role,
      clientId:role==='client'
        ?'client-v5'
        :null,
    },
    selectedClientId:role==='coach'
      ?'client-selected-by-coach'
      :null,
    collections:{
      wearableConnections:[],
    },
  };

  const store={
    getState(){
      return state;
    },
  };

  return {root,status,store};
}

function telemetryHarness(){
  let pruneCalls=0;

  const outbox={
    async batches(){
      return [];
    },
    async pending(){
      return [];
    },
    async applyBatchAck(){},
    async markBatchFailure(){},
    async prune(){
      pruneCalls+=1;
    },
    async summary(){
      return {
        pendingCount:0,
        terminalCount:0,
      };
    },
  };

  return {
    outbox,
    pruneCalls:()=>pruneCalls,
  };
}

test('RC64.2B V5.3 direct observeConnectivity keeps explicit-event contract',async()=>{
  const target=new EventTarget();
  const navigatorLike={onLine:true};
  const calls=[];

  const stop=observeConnectivity(
    target,
    {
      navigatorLike,
      onOnline:()=>calls.push('online'),
      onOffline:()=>calls.push('offline'),
    },
  );

  target.dispatchEvent(new Event('online'));
  await tick();

  assert.deepEqual(calls,['online']);
  stop();
});

test('RC64.2B V5.3 createConnectivitySync silent start ignores redundant online but preserves real reconnect and explicit sync',async()=>{
  const target=new EventTarget();
  const navigatorLike={onLine:true};
  const events=[];
  let synchronizeCalls=0;

  target.addEventListener(
    'm26:connectivity',
    (event)=>events.push(event.detail.online),
  );

  const sync=createConnectivitySync({
    target,
    navigatorLike,
    coordinator:{
      async synchronize(){
        synchronizeCalls+=1;
        return {ok:true};
      },
    },
  });

  const stop=sync.start({emitInitial:false});
  await tick();

  target.dispatchEvent(new Event('online'));
  await tick();

  assert.equal(synchronizeCalls,0);
  assert.deepEqual(events,[]);

  navigatorLike.onLine=false;
  target.dispatchEvent(new Event('offline'));
  await tick();

  navigatorLike.onLine=true;
  target.dispatchEvent(new Event('online'));
  await tick();

  assert.equal(synchronizeCalls,1);
  assert.deepEqual(events,[false,true]);

  target.dispatchEvent(new Event('online'));
  await tick();

  assert.equal(synchronizeCalls,1);
  assert.deepEqual(events,[false,true]);

  await sync.sync();
  assert.equal(synchronizeCalls,2);

  stop();
});

test('RC64.2B V5.3 createConnectivitySync default initial synchronization remains intact',async()=>{
  const target=new EventTarget();
  const navigatorLike={onLine:true};
  let synchronizeCalls=0;

  const sync=createConnectivitySync({
    target,
    navigatorLike,
    coordinator:{
      async synchronize(){
        synchronizeCalls+=1;
        return {ok:true};
      },
    },
  });

  const stop=sync.start();
  await tick();

  assert.equal(synchronizeCalls,1);
  stop();
});

test('RC64.2B V5.3 telemetry silent start flushes only after real reconnect',async()=>{
  const target=new EventTarget();
  let online=true;
  const harness=telemetryHarness();

  const remote=createTelemetryRemoteSync({
    transport:{
      async importTelemetryBatch(){
        throw new Error('UNEXPECTED_TELEMETRY_UPLOAD');
      },
    },
    outbox:harness.outbox,
    getToken:async()=> 'token',
    isOnline:()=>online,
  });

  remote.start({
    target,
    flushInitial:false,
  });

  await tick();

  target.dispatchEvent(new Event('online'));
  await tick();

  assert.equal(harness.pruneCalls(),0);

  online=false;
  target.dispatchEvent(new Event('offline'));
  await tick();

  online=true;
  target.dispatchEvent(new Event('online'));
  await tick();
  await tick();

  assert.equal(harness.pruneCalls(),1);

  target.dispatchEvent(new Event('online'));
  await tick();

  assert.equal(harness.pruneCalls(),1);
  remote.stop();
});

test('RC64.2B V5.3 telemetry default initial flush remains intact and redundant online is deduplicated',async()=>{
  const target=new EventTarget();
  let online=true;
  const harness=telemetryHarness();

  const remote=createTelemetryRemoteSync({
    transport:{
      async importTelemetryBatch(){
        throw new Error('UNEXPECTED_TELEMETRY_UPLOAD');
      },
    },
    outbox:harness.outbox,
    getToken:async()=> 'token',
    isOnline:()=>online,
  });

  remote.start({target});
  await tick();
  await tick();

  assert.equal(harness.pruneCalls(),1);

  target.dispatchEvent(new Event('online'));
  await tick();

  assert.equal(harness.pruneCalls(),1);
  remote.stop();
});

test('RC64.2B V5.3 wearable silent mount ignores redundant online and syncs client after real reconnect',async()=>{
  await withGlobalConnectivityBus(async(bus)=>{
    let online=true;
    const {root,status,store}=wearableHarness('client');

    const controller=createWearableController({
      root,
      store,
      transport:{},
      getToken:async()=> 'client-token',
      isOnline:()=>online,
    });

    controller.mount({syncInitial:false});

    bus.dispatchEvent(new Event('online'));
    await tick();
    await tick();

    assert.equal(status.textContent,'unchanged');

    online=false;
    bus.dispatchEvent(new Event('offline'));
    await tick();

    online=true;
    bus.dispatchEvent(new Event('online'));
    await tick();
    await tick();

    assert.equal(
      status.textContent,
      'Sincronizaci\u00f3n completada.',
    );
    assert.equal(status.dataset.status,'success');

    controller.destroy();
  });
});

test('RC64.2B V5.3 wearable automatic reconnect remains blocked for coach',async()=>{
  await withGlobalConnectivityBus(async(bus)=>{
    let online=true;
    const {root,status,store}=wearableHarness('coach');

    const controller=createWearableController({
      root,
      store,
      transport:{},
      getToken:async()=> 'coach-token-must-not-be-used',
      isOnline:()=>online,
    });

    controller.mount({syncInitial:false});

    online=false;
    bus.dispatchEvent(new Event('offline'));
    await tick();

    online=true;
    bus.dispatchEvent(new Event('online'));
    await tick();
    await tick();

    assert.equal(status.textContent,'unchanged');
    controller.destroy();
  });
});

test('RC64.2B V5.3 wearable default initial sync contract remains client-only without inventing UI side effects',()=>{
  const wearable=read('src/m26/wearables/controller.js');

  assert.match(
    wearable,
    /if\(syncInitial\)\{\s*void autoSyncNativeProviders\(\);\s*const \{role,clientId\}=context\(store\);\s*if\(role==='client'&&clientId&&lastOnline\)\{\s*void remoteSync\.flush\(\)\.catch\(/u,
  );

  assert.doesNotMatch(
    wearable,
    /if\(syncInitial\)\{\s*void autoSyncNativeProviders\(\);\s*if\(isOnline\(\)\)\{\s*void remoteSync\.flush\(\)/u,
  );
});

test('RC64.2B V5.3 application keeps zero-initial-IO wiring and all reconnect state machines are present',()=>{
  const app=read('src/m26/app/application.js');
  const pwa=read('src/m26/platform/pwa.js');
  const telemetry=read('src/m26/telemetry/remote-sync.js');
  const wearable=read('src/m26/wearables/controller.js');

  const start=app.indexOf('async function setupAuthenticated()');
  const end=app.indexOf('\n  function guardSessionNavigation',start);

  assert.ok(start>=0&&end>start);

  const setup=app.slice(start,end);

  assert.match(
    setup,
    /wearables\.mount\(\{syncInitial:false\}\)/u,
  );
  assert.match(
    setup,
    /connectivityStop=sync\.start\(\{emitInitial:false\}\)/u,
  );
  assert.match(
    setup,
    /telemetrySyncStop=telemetryRemoteSync\.start\(\{flushInitial:false\}\)/u,
  );

  assert.match(
    pwa,
    /baselineCurrentState:!initial/u,
  );

  assert.match(
    telemetry,
    /const reconnected=lastOnline===false;\s*lastOnline=true;\s*if\(!reconnected\)return;/u,
  );

  assert.match(
    wearable,
    /const reconnected=lastOnline===false;\s*lastOnline=true;\s*if\(!reconnected\)return;/u,
  );

  assert.match(
    wearable,
    /if\(role!=='client'\|\|!clientId\)return;/u,
  );
});
