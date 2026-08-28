import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMemoryKeyValueStore,
} from '../src/m26/platform/key-value-store.js';
import {
  createWearableRemoteSync,
} from '../src/m26/wearables/remote-sync.js';

function record(clientId,date='2026-08-27'){
  return {
    id:`normalized_file:${clientId}:${date}`,
    clientId,
    provider:'normalized_file',
    date,
    metrics:{
      steps:7000,
      activeMinutes:40,
      sleepMinutes:null,
      restingHeartRate:58,
      hrvMs:null,
      activeEnergyKcal:null,
      workoutMinutes:30,
    },
    vfcMethod:null,
    quality:'media',
    sourceUpdatedAt:`${date}T12:00:00.000Z`,
    sourceRecordCount:1,
  };
}

function transportSpy(){
  const calls=[];
  return {
    calls,
    async importWearableSummaries(_token,payload){
      calls.push(['import',structuredClone(payload)]);
      return {
        accepted:payload.records.length,
        rejected:0,
        stale:0,
      };
    },
    async upsertWearableConnection(_token,payload){
      calls.push(['connection',structuredClone(payload)]);
      return {ok:true};
    },
    async revokeWearableConnection(){
      calls.push(['revoke']);
      return {ok:true};
    },
    async deleteWearableData(){
      calls.push(['delete-all']);
      return {ok:true};
    },
  };
}

test('RC65-A sella la cola wearable por usuario en navegador compartido',async()=>{
  const queueStore=createMemoryKeyValueStore();
  const transport=transportSpy();

  const ownerA=createWearableRemoteSync({
    ownerId:'user-a',
    queueStore,
    transport,
    getToken:async()=>'token-a',
    isOnline:()=>false,
  });

  const ownerB=createWearableRemoteSync({
    ownerId:'user-b',
    queueStore,
    transport,
    getToken:async()=>'token-b',
    isOnline:()=>true,
  });

  await ownerA.stage({
    clientId:'client-a',
    provider:'normalized_file',
    records:[record('client-a')],
  });

  assert.equal(await ownerA.pendingCount(),1);
  assert.equal(await ownerB.pendingCount(),0);

  const bFlush=await ownerB.flush();
  assert.equal(bFlush.imported,0);
  assert.equal(transport.calls.length,0);
  assert.equal(await ownerA.pendingCount(),1);
});

test('RC65-A no adopta ni destruye una entrada legacy sin owner demostrable',async()=>{
  const queueStore=createMemoryKeyValueStore({
    'm26:wearable-sync:v44:client-legacy:normalized_file:2026-08-26':{
      clientId:'client-legacy',
      provider:'normalized_file',
      record:record('client-legacy','2026-08-26'),
      queuedAt:'2026-08-26T12:00:00.000Z',
      attempts:0,
    },
  });
  const transport=transportSpy();

  const sync=createWearableRemoteSync({
    ownerId:'client-legacy',
    queueStore,
    transport,
    getToken:async()=>'token-current',
    isOnline:()=>true,
  });

  assert.equal(await sync.pendingCount(),0);
  await sync.flush();
  assert.equal(transport.calls.length,0);

  await sync.clearOwner();

  const legacy=await queueStore.entries(
    'm26:wearable-sync:v44:client-legacy:',
  );
  assert.equal(legacy.length,1);
});

test('RC65-A clearOwner borra solo la cola del usuario actual',async()=>{
  const queueStore=createMemoryKeyValueStore();
  const transport=transportSpy();

  const ownerA=createWearableRemoteSync({
    ownerId:'user-a',
    queueStore,
    transport,
    getToken:async()=>'token-a',
    isOnline:()=>false,
  });

  const ownerB=createWearableRemoteSync({
    ownerId:'user-b',
    queueStore,
    transport,
    getToken:async()=>'token-b',
    isOnline:()=>false,
  });

  await ownerA.stage({
    clientId:'client-a',
    provider:'normalized_file',
    records:[record('client-a')],
  });

  await ownerB.stage({
    clientId:'client-b',
    provider:'normalized_file',
    records:[record('client-b')],
  });

  await ownerA.clearOwner();

  assert.equal(await ownerA.pendingCount(),0);
  assert.equal(await ownerB.pendingCount(),1);
});

test('RC65-A deleteAll limpia solo el owner actual y preserva otros owners',async()=>{
  const queueStore=createMemoryKeyValueStore();
  const transport=transportSpy();

  const ownerA=createWearableRemoteSync({
    ownerId:'user-a',
    queueStore,
    transport,
    getToken:async()=>'token-a',
    isOnline:()=>false,
  });

  const ownerB=createWearableRemoteSync({
    ownerId:'user-b',
    queueStore,
    transport,
    getToken:async()=>'token-b',
    isOnline:()=>false,
  });

  await ownerA.stage({
    clientId:'client-a',
    provider:'normalized_file',
    records:[record('client-a')],
  });

  await ownerB.stage({
    clientId:'client-b',
    provider:'normalized_file',
    records:[record('client-b')],
  });

  await ownerA.deleteAll();

  assert.equal(await ownerA.pendingCount(),0);
  assert.equal(await ownerB.pendingCount(),1);
  assert.equal(
    transport.calls.filter(([type])=>type==='delete-all').length,
    1,
  );
});

test('RC65-A una nueva instancia del mismo owner puede sincronizar su cola',async()=>{
  const queueStore=createMemoryKeyValueStore();
  const transport=transportSpy();

  const offline=createWearableRemoteSync({
    ownerId:'user-b',
    queueStore,
    transport,
    getToken:async()=>'token-b',
    isOnline:()=>false,
  });

  await offline.stage({
    clientId:'client-b',
    provider:'normalized_file',
    records:[record('client-b')],
  });

  const online=createWearableRemoteSync({
    ownerId:'user-b',
    queueStore,
    transport,
    getToken:async()=>'token-b',
    isOnline:()=>true,
  });

  const result=await online.flush();

  assert.equal(result.imported,1);
  assert.equal(await online.pendingCount(),0);
  assert.equal(
    transport.calls.filter(([type])=>type==='import').length,
    1,
  );
  assert.equal(
    transport.calls.filter(([type])=>type==='connection').length,
    1,
  );
});

test('RC65-A exige ownerId y no permite volver a una cola global',()=>{
  const transport=transportSpy();

  assert.throws(
    ()=>createWearableRemoteSync({
      transport,
      getToken:async()=>'token',
      queueStore:createMemoryKeyValueStore(),
    }),
    /M26_WEARABLE_OWNER_REQUIRED/,
  );
});
