import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunicationTransport} from '../src/m26/communication/transport.js';

function jsonResponse(body,{status=200}={}){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get:(name)=>String(name).toLowerCase()==='content-type'?'application/json':null},
    json:async()=>body,
    text:async()=>JSON.stringify(body),
  };
}

function harness(responses=[]){
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options,body:JSON.parse(options.body)});
    return responses.shift()||jsonResponse({ok:true});
  };
  const transport=createCommunicationTransport({
    runtime:{url:'https://qa.example.test',publishableKey:'pk-test',version:'26-test'},
    fetchImpl,
  });
  return {transport,calls};
}

test('web push status uses the authenticated narrow RPC and normalizes response',async()=>{
  const {transport,calls}=harness([jsonResponse({ok:true,active:true,subscriptionCount:2,updatedAt:'2026-09-19T18:00:00Z'})]);
  const result=await transport.webPushStatus('jwt-user');
  assert.deepEqual(result,{ok:true,active:true,subscriptionCount:2,updatedAt:'2026-09-19T18:00:00Z'});
  assert.match(calls[0].url,/\/rest\/v1\/rpc\/iberfit_web_push_status_v1$/);
  assert.equal(calls[0].options.headers.authorization,'Bearer jwt-user');
  assert.deepEqual(calls[0].body,{});
});

test('device status checks only the supplied browser endpoint and returns metadata',async()=>{
  const {transport,calls}=harness([jsonResponse({ok:true,deviceActive:true,subscriptionCount:3})]);
  const result=await transport.webPushDeviceStatus('jwt-user','https://push.example.test/device-a');
  assert.deepEqual(result,{ok:true,deviceActive:true,subscriptionCount:3});
  assert.match(calls[0].url,/\/rest\/v1\/rpc\/iberfit_web_push_device_status_v1$/);
  assert.deepEqual(calls[0].body,{p_endpoint:'https://push.example.test/device-a'});
  assert.equal(calls[0].options.headers.authorization,'Bearer jwt-user');
  await assert.rejects(()=>transport.webPushDeviceStatus('jwt-user',''),/M26_PUSH_ENDPOINT_REQUIRED/);
});

test('web push upsert forwards only the subscription payload and requires confirmed activation',async()=>{
  const subscription={endpoint:'https://push.example.test/a',expirationTime:null,keys:{p256dh:'key',auth:'auth'}};
  const {transport,calls}=harness([jsonResponse({ok:true,active:true,updatedAt:null})]);
  const result=await transport.webPushUpsert('jwt-user',subscription);
  assert.deepEqual(result,{ok:true,active:true,updatedAt:null});
  assert.deepEqual(calls[0].body,{p_subscription:subscription});
  assert.match(calls[0].url,/iberfit_web_push_upsert_v1$/);

  const rejected=harness([jsonResponse({ok:true,active:false})]);
  await assert.rejects(()=>rejected.transport.webPushUpsert('jwt-user',subscription),/M26_PUSH_UPSERT_NOT_CONFIRMED/);
});

test('web push revoke supports one device or all server subscriptions without leaking state',async()=>{
  const {transport,calls}=harness([jsonResponse({ok:true,active:false,deletedCount:1})]);
  const result=await transport.webPushRevoke('jwt-user','https://push.example.test/a');
  assert.deepEqual(result,{ok:true,active:false,deletedCount:1});
  assert.deepEqual(calls[0].body,{p_endpoint:'https://push.example.test/a'});

  const all=harness([jsonResponse({ok:true,active:false,deletedCount:3})]);
  await all.transport.webPushRevoke('jwt-user');
  assert.deepEqual(all.calls[0].body,{p_endpoint:null});
});

test('push RPCs remain authenticated and fail closed on backend errors',async()=>{
  const {transport}=harness();
  await assert.rejects(()=>transport.webPushStatus(''),/M26_AUTH_REQUIRED/);
  const failed=harness([jsonResponse({message:'push_endpoint_conflict'},{status:403})]);
  await assert.rejects(()=>failed.transport.webPushUpsert('jwt-user',{endpoint:'https://push.example.test/a'}),/push_endpoint_conflict/);
});
