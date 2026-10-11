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
