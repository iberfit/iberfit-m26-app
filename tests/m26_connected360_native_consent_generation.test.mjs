import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMemoryKeyValueStore} from '../src/m26/platform/key-value-store.js';
import {createWearableRemoteSync} from '../src/m26/wearables/remote-sync.js';

const GRANT='c2b97b1d-f43c-45e0-8305-f9384988124a';
const provider='health_connect';
const clientId='connected360-client-qa';
const day={
  clientId,provider,date:'2026-10-08',sourceUpdatedAt:'2026-10-08T17:00:00Z',
  quality:'media',sourceRecordCount:1,
  metrics:{steps:4500,sleepMinutes:405,restingHeartRate:60},
};
function service(transport,options={}){
  return createWearableRemoteSync({
    ownerId:'connected360-owner-qa',getToken:async()=>'scoped-user-session',
    isOnline:options.isOnline??(()=>true),queueStore:createMemoryKeyValueStore(),
    transport,
  });
}

test('passive native reconnect reads existing authorization and imports with its exact generation',async()=>{
  let statusCalls=0,reauthorizations=0,uploads=0,legacyUploads=0;
  const sync=service({
    async wearableAuthorizationStatus(token,source){
      statusCalls++;
      assert.equal(token,'scoped-user-session');
      assert.equal(source,provider);
      return {authorized:true,grantId:GRANT,scopes:['steps','sleepMinutes'],revocationCursor:5};
    },
    async reauthorizeWearable(){reauthorizations++;throw Error('silent refresh cannot authorize');},
    async importWearableAuthorized(token,grant,payload){
      uploads++;
      assert.equal(token,'scoped-user-session');
      assert.equal(grant,GRANT);
      assert.equal(payload.records[0].provider,provider);
      return {accepted:1,stale:0,rejected:0};
    },
    async importWearableSummaries(){legacyUploads++;throw Error('legacy write forbidden');},
  });
  const authorization=await sync.currentAuthorization({provider,scopes:['steps','sleepMinutes']});
  assert.equal(authorization.grantId,GRANT);
  assert.equal(authorization.alreadyAuthorized,true);
  const result=await sync.stage({clientId,provider,authorizationGrant:authorization.grantId,records:[day]});
  assert.equal(result.synced,true);
  assert.equal(uploads,1);
  assert.equal(legacyUploads,0);
  assert.equal(reauthorizations,0);
  assert.equal(statusCalls,1);
});

test('passive native sync fails closed when server has revoked the grant',async()=>{
  let uploads=0,minted=0;
  const sync=service({
    async wearableAuthorizationStatus(){return {authorized:false,grantId:GRANT,scopes:['steps']};},
    async reauthorizeWearable(){minted++;},
    async importWearableAuthorized(){uploads++;},
  });
  await assert.rejects(sync.currentAuthorization({provider,scopes:['steps']}),/GRANT_STALE/);
  assert.equal(minted,0);
  await assert.rejects(sync.stage({provider,clientId,records:[day]}),/ONLINE_REAUTHORIZE_REQUIRED/);
  assert.equal(uploads,0);
});

test('passive reconnect rejects scope escalation even if native permission exists',async()=>{
  let uploads=0;
  const sync=service({
    async wearableAuthorizationStatus(){return {authorized:true,grantId:GRANT,scopes:['steps']};},
    async importWearableAuthorized(){uploads++;},
  });
  await assert.rejects(sync.currentAuthorization({provider,scopes:['steps','sleepMinutes']}),
    /SCOPE_EXPANSION_REQUIRES_REVOKE/);
  assert.equal(uploads,0);
});

test('passive authorization never requests permission or grant offline',async()=>{
  let networkCalls=0;
  const sync=service({
    async wearableAuthorizationStatus(){networkCalls++;},
    async reauthorizeWearable(){networkCalls++;},
  },{isOnline:()=>false});
  await assert.rejects(sync.currentAuthorization({provider,scopes:['steps']}),/NETWORK_REQUIRED/);
  assert.equal(networkCalls,0);
});

test('in-flight revocation beats an authorization-status response from a different operation',async()=>{
  let release,started;
  const requestStarted=new Promise(resolve=>{started=resolve;});
  const suspended=new Promise(resolve=>{release=resolve;});
  let uploads=0;
  const sync=service({
    async wearableAuthorizationStatus(){started();await suspended;return {authorized:true,grantId:GRANT,scopes:['steps']};},
    async revokeWearableConnection(){return {ok:true};},
    async importWearableAuthorized(){uploads++;return {accepted:1,rejected:0};},
  });
  const inFlight=sync.currentAuthorization({provider,scopes:['steps']});
  await requestStarted;
  const revoke=sync.revoke({provider,deleteData:true});
  release();
  await assert.rejects(inFlight,/SOURCE_REVOKED/);
  await revoke;
  await assert.rejects(sync.stage({clientId,provider,authorizationGrant:GRANT,records:[day]}),/SOURCE_REVOKED/);
  assert.equal(uploads,0);
});

test('session logout invalidates an authorization result arriving afterward',async()=>{
  let release,started;
  const requestStarted=new Promise(resolve=>{started=resolve;});
  const suspended=new Promise(resolve=>{release=resolve;});
  const sync=service({
    async wearableAuthorizationStatus(){started();await suspended;return {authorized:true,grantId:GRANT,scopes:['steps']};},
  });
  const p=sync.currentAuthorization({provider,scopes:['steps']});
  await requestStarted;
  const logout=sync.clearOwner();
  release();
  await assert.rejects(p,/OWNER_DISPOSED/);
  await logout;
});

test('native controller demands server grant and never reauthorizes from passive resume',()=>{
  const c=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const native=c.slice(c.indexOf('async function connectNativeProvider('),
    c.indexOf('async function autoSyncNativeProviders()'));
  assert.match(native,/interactive\s*\?\s*await remoteSync\.reauthorize\(/u);
  assert.match(native,/:await remoteSync\.currentAuthorization\(/u);
  assert.match(native,/authorizationGrant:consent\.grantId/u);
  assert.match(native,/permissionGranted:true/u);
  assert.match(native,/connected:records\.length>0&&result\.synced===true/u);
  const policy=readFileSync(new URL('../src/m26/wearables/free-policy.js',import.meta.url),'utf8');
  assert.match(policy,/health_connect:policy\(\{[^]*?productionAllowed:false/u);
});
