import test from 'node:test';
import assert from 'node:assert/strict';
import {createWearableRemoteSync} from '../src/m26/wearables/remote-sync.js';

const GRANT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function fixture({initial=['steps'],extendError=null}={}){
  let scopes=[...initial];
  const events=[];
  const transport={
    async wearableAuthorizationStatus(token,provider){
      events.push({action:'status',token,provider});
      return {authorized:true,grantId:GRANT,revocationCursor:0,scopes:[...scopes]};
    },
    async reauthorizeWearable(){throw new Error('MUST_NOT_REPLACE_LIVE_GRANT');},
    async extendConnected360QaV46Grant(token,request){
      events.push({action:'extend',token,...request});
      if(extendError)throw extendError;
      scopes=[...new Set([...scopes,...request.scopes])];
      return {ok:true,provider:'health_connect',grantId:GRANT,
        revocationCursor:0,scopes:[...scopes],alreadyAuthorized:false};
    },
  };
  const queueStore={entries:async()=>[],remove:async()=>{}};
  const sync=createWearableRemoteSync({
    transport,getToken:async()=> 'synthetic-web-jwt-only',
    ownerId:owner,isOnline:()=>true,queueStore,
    refreshState:async()=>{events.push({action:'refresh'});},
  });
  return {sync,events,scopes:()=>scopes};
}

test('A direct V46 QA user action extends a live Health Connect grant without revoking steps',async()=>{
  const x=fixture();
  const authorized=await x.sync.reauthorizeV46({scopes:['generalHeartRate','exerciseSessions']});
  assert.equal(authorized.grantId,GRANT);
  assert.equal(authorized.revocationCursor,0);
  assert.ok(x.scopes().includes('steps'));
  assert.ok(x.scopes().includes('generalHeartRate'));
  assert.ok(x.scopes().includes('exerciseSessions'));
  assert.equal(x.events.filter(e=>e.action==='extend').length,1);
  assert.deepEqual(x.events.find(e=>e.action==='extend').scopes,['generalHeartRate','exerciseSessions']);
  assert.equal(x.events.find(e=>e.action==='extend').expectedGrant,GRANT);
  assert.equal(x.events.find(e=>e.action==='extend').expectedCursor,0);
  const status=await x.sync.currentAuthorization({provider:'health_connect',scopes:['generalHeartRate']});
  assert.equal(status.grantId,GRANT);
});

test('Generic authorization never escalates existing permissions without the explicit QA wrapper',async()=>{
  const x=fixture();
  await assert.rejects(x.sync.reauthorize({provider:'health_connect',
    scopes:['generalHeartRate']}),/SCOPE_EXPANSION_REQUIRES_REVOKE/u);
  assert.equal(x.events.filter(e=>e.action==='extend').length,0);
  await assert.rejects(x.sync.reauthorizeV46({scopes:['restingHeartRate']}),
    /M26_V46_QA_SCOPE_EXTENSION_INVALID/u);
  assert.equal(x.events.filter(e=>e.action==='extend').length,0);
});

test('Already-authorized QA category never rewrites a live consent generation',async()=>{
  const x=fixture({initial:['steps','exerciseSessions']});
  const result=await x.sync.reauthorizeV46({scopes:['exerciseSessions']});
  assert.equal(result.alreadyAuthorized,true);
  assert.equal(x.events.filter(e=>e.action==='extend').length,0);
});

test('A stale server-side grant fails closed and leaves its older scopes unchanged',async()=>{
  const x=fixture({extendError:new Error('M26_V46_QA_SCOPE_GRANT_STALE')});
  await assert.rejects(x.sync.reauthorizeV46({scopes:['generalHeartRate']}),
    /M26_V46_QA_SCOPE_GRANT_STALE/u);
  assert.deepEqual(x.scopes(),['steps']);
});
