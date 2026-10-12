import test from 'node:test';
import assert from 'node:assert/strict';
import {QUERY,REQUIRED,certify,verify} from '../scripts/ops/verify_connected360_v47_prod_schema.mjs';
const projectRef='pjhmrhejsoofmouedavw';
const accessToken='synthetic-nonsecret-test-token';
const healthy=Object.fromEntries(REQUIRED.map(k=>[k,true]));
test('release fence SQL is read-only and verifies independent consent + RLS',()=>{
  assert.match(QUERY,/^SELECT/u);
  assert.match(QUERY,/m26_wearable_v47_consents_prod/u);
  assert.match(QUERY,/m26_wearable_daily_health_v47/u);
  assert.match(QUERY,/relforcerowsecurity/u);
  assert.equal(REQUIRED.length,13);
});
test('fail closed on any missing schema capability, denied response, or malformed JSON',()=>{
  for(const key of REQUIRED){
    assert.throws(()=>certify([{...healthy,[key]:false}]), e=>e.message.includes(key));
  }
  assert.deepEqual(certify([healthy]),{ready:true,checks:13});
  assert.throws(()=>certify([]),/RESPONSE_INVALID/u);
  assert.throws(()=>certify({unexpected:true}),/RESPONSE_INVALID/u);
  assert.throws(()=>certify([{...healthy,read_rpc:'true'}]),/SCHEMA_INCOMPATIBLE/u);
});
test('production release gate calls only the read-only Management API',async()=>{
  let calls=0;
  const result=await verify({projectRef,accessToken,fetchImpl:async(url,opts)=>{
    calls++;
    assert.equal(url,'https://api.supabase.com/v1/projects/'+projectRef+'/database/query/read-only');
    assert.equal(opts.method,'POST');
    assert.deepEqual(Object.keys(JSON.parse(opts.body)),['query']);
    assert.equal(opts.headers.Authorization,'Bearer '+accessToken);
    return {ok:true,status:201,json:async()=>[healthy]};
  }});
  assert.equal(result.ready,true);assert.equal(calls,1);
});
test('denies missing credentials, bad status, schema mismatch and network failure',async()=>{
  await assert.rejects(verify({projectRef:'wrong',accessToken,fetchImpl:async()=>{throw Error('should-not-call');}}),/PROJECT_INVALID/u);
  await assert.rejects(verify({projectRef,accessToken:'',fetchImpl:async()=>{throw Error('should-not-call');}}),/ACCESS_TOKEN_MISSING/u);
  await assert.rejects(verify({projectRef,accessToken,fetchImpl:async()=>({ok:false,status:403})}),/QUERY_HTTP_403/u);
  await assert.rejects(verify({projectRef,accessToken,fetchImpl:async()=>({ok:true,json:async()=>[{...healthy,daily_rls:false}]})}),/SCHEMA_INCOMPATIBLE/u);
  await assert.rejects(verify({projectRef,accessToken,fetchImpl:async()=>{throw Error('network');}}),/DATABASE_UNREACHABLE/u);
});
