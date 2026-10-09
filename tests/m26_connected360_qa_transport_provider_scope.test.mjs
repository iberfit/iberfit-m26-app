import test from 'node:test';
import assert from 'node:assert/strict';
import {createM26Transport,M26_PRODUCTION_PROJECT_REF,M26_QA_PROJECT_REF}
  from '../src/m26/supabase-transport.js';

const GRANT='33333333-3333-4333-8333-333333333333';
const CLIENT_TOKEN='synthetic-client-jwt-not-a-real-secret';
const qaRuntime=(host='m26-canary.iberfit.cl')=>({
  enabled:true,qaOnly:true,host,canary:host==='m26-canary.iberfit.cl',
  projectRef:M26_QA_PROJECT_REF,url:`https://${M26_QA_PROJECT_REF}.supabase.co`,
  publishableKey:'sb_publishable_QA_test_not_a_real_key',
});
const prodRuntime=()=>({
  enabled:true,qaOnly:false,host:'app.iberfit.cl',
  projectRef:M26_PRODUCTION_PROJECT_REF,
  url:`https://${M26_PRODUCTION_PROJECT_REF}.supabase.co`,
  publishableKey:'sb_publishable_PROD_test_not_a_real_key',
});
function createMock(runtime){
  const calls=[];
  const transport=createM26Transport(runtime,{
    fetchImpl:async(url,init)=>{
      const path=new URL(url).pathname;
      const body=JSON.parse(init.body||'{}');
      calls.push({path,body,method:init.method,authorization:init.headers.authorization});
      let result;
      if(path.endsWith('/m26_wearable_authorization_status_v2')){
        result={provider:body.p_provider,authorized:false,
          grantId:null,revocationCursor:0,scopes:[]};
      }else if(path.endsWith('/m26_wearable_reauthorize_v2')){
        result={ok:true,provider:body.p_provider,grantId:GRANT,
          revocationCursor:0,scopes:body.p_scopes};
      }else throw new Error('TEST_UNEXPECTED_RPC:'+path);
      return new Response(JSON.stringify(result),{
        status:200,headers:{'content-type':'application/json'},
      });
    },
  });
  return {transport,calls};
}

test('PROD authorization remains strictly file-only; no native consent request reaches network',async()=>{
  const {transport,calls}=createMock(prodRuntime());
  for(const provider of ['health_connect','apple_health','samsung_health','strava']){
    await assert.rejects(
      transport.wearableAuthorizationStatus(CLIENT_TOKEN,provider),
      /M26_CONNECTED360_CLIENT_FILE_REQUIRED/u);
    await assert.rejects(
      transport.reauthorizeWearable(CLIENT_TOKEN,{
        provider,expectedCursor:0,scopes:['steps'],
      }),
      /M26_CONNECTED360_CLIENT_FILE_REQUIRED/u);
  }
  assert.equal(calls.length,0);
  const file=await transport.wearableAuthorizationStatus(CLIENT_TOKEN,'normalized_file');
  assert.equal(file.provider,'normalized_file');
  assert.equal(calls.length,1);
});

test('CANARY Health Connect explicit status and CAS grant use exact QA RPCs and client token',async()=>{
  const {transport,calls}=createMock(qaRuntime());
  assert.deepEqual(await transport.wearableAuthorizationStatus(CLIENT_TOKEN,'health_connect'),{
    provider:'health_connect',authorized:false,grantId:null,revocationCursor:0,scopes:[],
  });
  const grant=await transport.reauthorizeWearable(CLIENT_TOKEN,{
    provider:'health_connect',expectedCursor:0,expectedGrant:null,
    scopes:['steps','sleepMinutes','restingHeartRate'],
  });
  assert.equal(grant.grantId,GRANT);
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(c=>c.path),[
    '/rest/v1/rpc/m26_wearable_authorization_status_v2',
    '/rest/v1/rpc/m26_wearable_reauthorize_v2',
  ]);
  assert.deepEqual(calls[1].body,{
    p_provider:'health_connect',p_expected_cursor:0,
    p_expected_grant:null,
    p_scopes:['steps','sleepMinutes','restingHeartRate'],
  });
  assert.ok(calls.every(c=>c.authorization===`Bearer ${CLIENT_TOKEN}`));
  assert.ok(calls.every(c=>c.method==='POST'));
});

test('QA gate fails closed for untrusted host and all other native providers',async()=>{
  for(const runtime of [qaRuntime('localhost'),qaRuntime('app.iberfit.cl'),prodRuntime()]){
    const {transport,calls}=createMock(runtime);
    await assert.rejects(
      transport.wearableAuthorizationStatus(CLIENT_TOKEN,'health_connect'),
      /M26_CONNECTED360_CLIENT_FILE_REQUIRED/u);
    assert.equal(calls.length,0);
  }
  const {transport,calls}=createMock(qaRuntime());
  for(const provider of ['apple_health','samsung_health','fitbit','oura','strava','garmin_connect',
    'ble_direct','wear_os_health_services','health_connect-extra']){
    await assert.rejects(
      transport.reauthorizeWearable(CLIENT_TOKEN,{
        provider,expectedCursor:0,scopes:['steps'],
      }),/M26_CONNECTED360_CLIENT_FILE_REQUIRED/u);
  }
  assert.equal(calls.length,0);
});

test('Invalid scope, duplicate metrics or stale CAS cursor never reaches database',async()=>{
  const {transport,calls}=createMock(qaRuntime());
  for(const scopes of [['steps','steps'],['secretMetric'],[],['steps','heartSourceId']]){
    await assert.rejects(transport.reauthorizeWearable(CLIENT_TOKEN,{
      provider:'health_connect',expectedCursor:0,scopes,
    }),/M26_CONNECTED360_REAUTHORIZE_INVALID/u);
  }
  await assert.rejects(transport.reauthorizeWearable(CLIENT_TOKEN,{
    provider:'health_connect',expectedCursor:-1,scopes:['steps'],
  }),/M26_CONNECTED360_REAUTHORIZE_INVALID/u);
  assert.equal(calls.length,0);
});

test('Normalized file grants remain supported in both environments',async()=>{
  for(const runtime of [qaRuntime(),prodRuntime()]){
    const {transport,calls}=createMock(runtime);
    const grant=await transport.reauthorizeWearable(CLIENT_TOKEN,{
      provider:'normalized_file',expectedCursor:0,scopes:['steps'],
    });
    assert.equal(grant.grantId,GRANT);
    assert.equal(calls.length,1);
    assert.equal(calls[0].body.p_provider,'normalized_file');
  }
});
