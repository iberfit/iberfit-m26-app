import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createM26Transport,
  M26_CANONICAL_PROJECT_REF,
} from '../src/m26/supabase-transport.js';

function runtime(qaOnly=false){
  return {
    enabled:true,
    projectRef:M26_CANONICAL_PROJECT_REF,
    url:`https://${M26_CANONICAL_PROJECT_REF}.supabase.co`,
    publishableKey:'public-test-key',
    qaOnly,
    timeoutMs:1000,
    version:'26.0.0-test',
  };
}

function mockFetch(environment){
  return async (url)=>({
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

      return {
        ok:true,
        ready:true,
        version,
        environment,
      };
    },
    async text(){return '';},
  });
}

test('health RPC acepta production únicamente en runtime productivo',async()=>{
  const transport=createM26Transport(
    runtime(false),
    {fetchImpl:mockFetch('production')},
  );

  assert.equal((await transport.backendHealth()).environment,'production');
  assert.equal((await transport.draftBackendHealth()).environment,'production');
  assert.equal((await transport.wearableHealth()).environment,'production');
});

test('health RPC acepta canary únicamente en runtime QA',async()=>{
  const transport=createM26Transport(
    runtime(true),
    {fetchImpl:mockFetch('canary')},
  );

  assert.equal((await transport.backendHealth()).environment,'canary');
  assert.equal((await transport.draftBackendHealth()).environment,'canary');
  assert.equal((await transport.wearableHealth()).environment,'canary');
});

test('health RPC falla cerrado ante entorno cruzado',async()=>{
  const production=createM26Transport(
    runtime(false),
    {fetchImpl:mockFetch('canary')},
  );

  await assert.rejects(
    production.backendHealth(),
    /M26_RC43_BACKEND_NOT_READY/,
  );

  const canary=createM26Transport(
    runtime(true),
    {fetchImpl:mockFetch('production')},
  );

  await assert.rejects(
    canary.wearableHealth(),
    /M26_RC44_BACKEND_NOT_READY/,
  );
});