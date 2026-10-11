import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryKeyValueStore} from '../src/m26/platform/key-value-store.js';
import {createWearableRemoteSync} from '../src/m26/wearables/remote-sync.js';

const GRANT='11111111-1111-4111-8111-111111111111';
const CLIENT='client-a';
const SOURCE='health_connect';

function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
function record(){
  return {
    id:'health_connect:client-a:2026-10-10',
    clientId:CLIENT,provider:SOURCE,date:'2026-10-10',
    metrics:{steps:5500,activeMinutes:null,sleepMinutes:null,
      restingHeartRate:null,hrvMs:null,activeEnergyKcal:null,workoutMinutes:null},
    quality:'media',vfcMethod:null,sourceRecordCount:1,
    sourceUpdatedAt:'2026-10-10T12:00:00.000Z',
  };
}
function setup({pause='status'}={}){
  const entered=deferred(),release=deferred();
  const events=[];
  const queueStore=createMemoryKeyValueStore();
  const transport={
    async wearableAuthorizationStatus(){
      if(pause==='status'){entered.resolve();await release.promise;}
      return {authorized:false,revocationCursor:0,grantId:null,scopes:[]};
    },
    async reauthorizeWearable(){
      if(pause==='grant'){entered.resolve();await release.promise;}
      events.push('grant');
      return {grantId:GRANT,scopes:['steps'],authorized:true};
    },
    async revokeWearableConnection(){events.push('revoke');return {ok:true};},
    async deleteWearableData(){events.push('delete-all');return {ok:true};},
    async importWearableAuthorized(){events.push('import');return {accepted:1,rejected:0,stale:0};},
  };
  const sync=createWearableRemoteSync({
    ownerId:'user-a',queueStore,transport,getToken:async()=>'mock-token',
    refreshState:async({reason})=>events.push(reason),isOnline:()=>true,
  });
  return {entered,release,events,sync,transport,queueStore};
}

test('revocation wins over in-flight authorization-status response and never restores the revoked source',async()=>{
  const f=setup();
  const pending=f.sync.reauthorize({provider:SOURCE,scopes:['steps']});
  await f.entered.promise;
  const revocation=f.sync.revoke({provider:SOURCE});
  f.release.resolve();
  await assert.rejects(pending,/M26_WEARABLE_AUTHORIZATION_SUPERSEDED/u);
  await revocation;
  await assert.rejects(f.sync.stage({clientId:CLIENT,provider:SOURCE,
    records:[record()],authorizationGrant:GRANT}),/M26_WEARABLE_SOURCE_REVOKED/u);
  assert.deepEqual(f.events,['revoke','wearable-revoked']);
  assert.equal(await f.sync.pendingCount(),0);
});

test('revocation during remote grant exchange does not reactivate local grant',async()=>{
  const f=setup({pause:'grant'});
  const pending=f.sync.reauthorize({provider:SOURCE,scopes:['steps']});
  await f.entered.promise;
  const revocation=f.sync.revoke({provider:SOURCE});
  f.release.resolve();
  await assert.rejects(pending,/M26_WEARABLE_AUTHORIZATION_SUPERSEDED/u);
  await revocation;
  await assert.rejects(f.sync.stage({clientId:CLIENT,provider:SOURCE,
    records:[record()],authorizationGrant:GRANT}),/M26_WEARABLE_SOURCE_REVOKED/u);
  assert.deepEqual(f.events,['grant','revoke','wearable-revoked']);
});

test('delete-all intent supersedes unfinished reauthorization without stale refresh',async()=>{
  const f=setup();
  const pending=f.sync.reauthorize({provider:SOURCE,scopes:['steps']});
  await f.entered.promise;
  const deletion=f.sync.deleteAll();
  f.release.resolve();
  await assert.rejects(pending,/M26_WEARABLE_AUTHORIZATION_SUPERSEDED/u);
  await deletion;
  assert.deepEqual(f.events,['delete-all','wearables-deleted']);
  await assert.rejects(f.sync.stage({clientId:CLIENT,provider:SOURCE,
    records:[record()],authorizationGrant:GRANT}),/M26_WEARABLE_SOURCE_REVOKED/u);
});

test('logout during unfinished reauthorization permanently retires old owner',async()=>{
  const f=setup();
  const pending=f.sync.reauthorize({provider:SOURCE,scopes:['steps']});
  await f.entered.promise;
  const logout=f.sync.clearOwner();
  f.release.resolve();
  await assert.rejects(pending,/M26_WEARABLE_OWNER_DISPOSED/u);
  await logout;
  await assert.rejects(f.sync.reauthorize({provider:SOURCE,scopes:['steps']}),/M26_WEARABLE_OWNER_DISPOSED/u);
  assert.deepEqual(f.events,[]);
});

test('a new explicit reauthorization after completed revoke remains possible',async()=>{
  const f=setup({pause:'none'});
  await f.sync.revoke({provider:SOURCE});
  const result=await f.sync.reauthorize({provider:SOURCE,scopes:['steps']});
  assert.equal(result.grantId,GRANT);
  assert.deepEqual(f.events,['revoke','wearable-revoked','grant','wearable-reauthorized']);
});

test('revoking during an imported batch prevents stale synchronized refresh',async()=>{
  const f=setup({pause:'none'});
  const entered=deferred(),release=deferred();
  f.transport.importWearableAuthorized=async()=>{
    entered.resolve();
    await release.promise;
    return {accepted:1,rejected:0,stale:0};
  };
  const pending=f.sync.stage({clientId:CLIENT,provider:SOURCE,
    records:[record()],authorizationGrant:GRANT});
  await entered.promise;
  const revocation=f.sync.revoke({provider:SOURCE});
  release.resolve();
  await assert.rejects(pending,/M26_WEARABLE_SOURCE_REVOKED/u);
  await revocation;
  assert.deepEqual(f.events,['revoke','wearable-revoked']);
  assert.equal(await f.sync.pendingCount(),0);
});


test('logout erases owner health queue immediately despite a hanging remote import',async()=>{
  const queueStore=createMemoryKeyValueStore();
  const entered=deferred(),release=deferred();
  let refreshes=0,uploads=0;
  const sync=createWearableRemoteSync({
    ownerId:'privacy-hung-fetch',
    queueStore,
    getToken:async()=>'old-session-token',
    isOnline:()=>true,
    refreshState:async()=>{refreshes++;},
    transport:{
      async importWearableAuthorized(){
        uploads++;
        entered.resolve();
        await release.promise;
        return {accepted:1,stale:0,rejected:0};
      },
    },
  });
  const pending=sync.stage({clientId:CLIENT,provider:SOURCE,
    records:[record()],authorizationGrant:GRANT});
  await entered.promise;
  assert.equal((await queueStore.entries('m26:wearable-sync:v44:owner/privacy-hung-fetch/')).length,1);
  const purge=sync.clearOwner();
  const early=await Promise.race([
    purge.then(()=>true),
    new Promise(resolve=>setTimeout(()=>resolve(false),250)),
  ]);
  try{
    assert.equal(early,true,'logout local erase must not await an unresponsive upload');
    assert.equal((await queueStore.entries('m26:wearable-sync:v44:owner/privacy-hung-fetch/')).length,0);
    assert.equal(await sync.pendingCount(),0);
  }finally{
    release.resolve();
  }
  await purge;
  await assert.rejects(pending,/M26_WEARABLE_SOURCE_REVOKED/u);
  assert.equal((await queueStore.entries('m26:wearable-sync:v44:owner/privacy-hung-fetch/')).length,0);
  assert.equal(uploads,1,'logout cannot unsend an already-dispatched authorized request');
  assert.equal(refreshes,0);
});

test('delayed IndexedDB-like queue write never resurrects old owner after logout',async()=>{
  const inner=createMemoryKeyValueStore(),entered=deferred(),release=deferred();
  const queueStore={
    get:key=>inner.get(key),
    keys:key=>inner.keys(key),
    entries:key=>inner.entries(key),
    clear:key=>inner.clear(key),
    remove:key=>inner.remove(key),
    async set(key,value){
      entered.resolve();
      await release.promise;
      return inner.set(key,value);
    },
  };
  const sync=createWearableRemoteSync({
    ownerId:'privacy-delayed-write',queueStore,
    getToken:async()=>'old-session-token',
    isOnline:()=>false,transport:{},
  });
  const stage=sync.stage({clientId:CLIENT,provider:SOURCE,
    records:[record()],authorizationGrant:GRANT});
  await entered.promise;
  await sync.clearOwner();
  assert.deepEqual(await inner.entries('m26:wearable-sync:v44:owner/privacy-delayed-write/'),[]);
  release.resolve();
  await assert.rejects(stage,/M26_WEARABLE_SOURCE_REVOKED/u);
  assert.deepEqual(await inner.entries('m26:wearable-sync:v44:owner/privacy-delayed-write/'),[]);
});

test('failed remote import after logout cannot requeue sensitive data for retry',async()=>{
  const queueStore=createMemoryKeyValueStore(),entered=deferred(),release=deferred();
  const sync=createWearableRemoteSync({
    ownerId:'privacy-failed-upload',queueStore,
    getToken:async()=>'old-session-token',isOnline:()=>true,
    transport:{
      async importWearableAuthorized(){
        entered.resolve();
        await release.promise;
        throw new Error('M26_NETWORK_UNAVAILABLE');
      },
    },
  });
  const stage=sync.stage({clientId:CLIENT,provider:SOURCE,
    records:[record()],authorizationGrant:GRANT});
  await entered.promise;
  await sync.clearOwner();
  release.resolve();
  await assert.rejects(stage,/M26_NETWORK_UNAVAILABLE/u);
  assert.deepEqual(await queueStore.entries('m26:wearable-sync:v44:owner/privacy-failed-upload/'),[]);
  assert.equal(await sync.pendingCount(),0);
});
