import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createM26Transport,
  M26_PRODUCTION_PROJECT_REF,
  M26_QA_PROJECT_REF,
} from '../src/m26/supabase-transport.js';

function runtime(qaOnly=false){
  const projectRef=qaOnly?M26_QA_PROJECT_REF:M26_PRODUCTION_PROJECT_REF;
  return {
    enabled:true,
    projectRef,
    url:`https://${projectRef}.supabase.co`,
    publishableKey:'public-test-key',
    qaOnly,
    timeoutMs:1000,
    version:'26.0.0-test',
  };
}

function mockFetch(environment){
  return async (url,options={})=>{
    assert.equal(options.headers?.Authorization,'Bearer health-token');
    return ({
    ok:true,
    status:200,
    headers:{
      get(name){
        return String(name).toLowerCase()==='content-type'
          ? 'application/json'
          : null;
      },
    },
    async json(){
      const value=String(url);
      const version=value.includes('m26_backend_health_v431')
        ? 'RC43.1'
        : value.includes('m26_wearable_health_v44')
          ? 'RC44'
          : 'RC43';
      return {ok:true,ready:true,version,environment};
    },
    async text(){return '';},
  });
  };
}

test('health RPC accepts production only for production runtime',async()=>{
  const transport=createM26Transport(runtime(false),{fetchImpl:mockFetch('production')});
  assert.equal((await transport.backendHealth('health-token')).environment,'production');
  assert.equal((await transport.draftBackendHealth('health-token')).environment,'production');
  assert.equal((await transport.wearableHealth('health-token')).environment,'production');
});

test('health RPC accepts qa only for QA runtime',async()=>{
  const transport=createM26Transport(runtime(true),{fetchImpl:mockFetch('qa')});
  assert.equal((await transport.backendHealth('health-token')).environment,'qa');
  assert.equal((await transport.draftBackendHealth('health-token')).environment,'qa');
  assert.equal((await transport.wearableHealth('health-token')).environment,'qa');
});


test('health RPCs fail closed without an authenticated session token',async()=>{
  const transport=createM26Transport(runtime(false),{fetchImpl:async()=>{throw new Error('network must not be reached');}});
  await assert.rejects(transport.backendHealth(),/M26_RC43_HEALTH_AUTH_REQUIRED/);
  await assert.rejects(transport.draftBackendHealth(),/M26_RC431_HEALTH_AUTH_REQUIRED/);
  await assert.rejects(transport.wearableHealth(),/M26_RC44_HEALTH_AUTH_REQUIRED/);
});

test('health RPC fails closed on production/QA environment mixing',async()=>{
  const production=createM26Transport(runtime(false),{fetchImpl:mockFetch('qa')});
  await assert.rejects(production.backendHealth('health-token'),/M26_RC43_BACKEND_NOT_READY/);
  await assert.rejects(production.draftBackendHealth('health-token'),/M26_RC431_BACKEND_NOT_READY/);
  await assert.rejects(production.wearableHealth('health-token'),/M26_RC44_BACKEND_NOT_READY/);

  const qa=createM26Transport(runtime(true),{fetchImpl:mockFetch('production')});
  await assert.rejects(qa.backendHealth('health-token'),/M26_RC43_BACKEND_NOT_READY/);
  await assert.rejects(qa.draftBackendHealth('health-token'),/M26_RC431_BACKEND_NOT_READY/);
  await assert.rejects(qa.wearableHealth('health-token'),/M26_RC44_BACKEND_NOT_READY/);
});

function jsonResponse(body,status=200){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get(name){return String(name).toLowerCase()==='content-type'?'application/json':null;}},
    async json(){return body;},
    async text(){return JSON.stringify(body);},
  };
}

test('QA auth accepts the narrow synthetic RC accounts but not arbitrary iberfit.cl mail',async()=>{
  const fetchImpl=async(_url,options={})=>{
    const email=JSON.parse(String(options.body||'{}')).email;
    return jsonResponse({
      access_token:'qa-access-token',
      refresh_token:'qa-refresh-token',
      expires_at:2_000_000_000,
      user:{id:'qa-user-id',email},
    });
  };
  const transport=createM26Transport(runtime(true),{fetchImpl});
  const accepted=await transport.login('qa.rc74.client-a@iberfit.cl','password-segura');
  assert.equal(accepted.user.email,'qa.rc74.client-a@iberfit.cl');
  await assert.rejects(
    transport.login('persona@iberfit.cl','password-segura'),
    /M26_QA_ACCOUNT_REQUIRED/,
  );
});
