import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const network=readFileSync('qa/rc64/secure-current-source-auth.mjs','utf8');
const spec=readFileSync('qa/rc64/authenticated-current-contract.spec.mjs','utf8');

test('P0 Free: public cache instrumentation exposes counters without extra backend calls',()=>{
  assert.match(network,/export function qaPublicRpcMemoStats\(\)\{return qaPublicRpcMemo\.stats\(\);\}/u);
  assert.match(network,/const qaPublicRpcMemo=createQaPublicRpcMemo\(\);/u);
  assert.match(spec,/publicRpcCacheAtStart=qaPublicRpcMemoStats\(\)/u);
  assert.match(spec,/publicRpcCacheAtEnd=qaPublicRpcMemoStats\(\)/u);
  assert.match(spec,/M26_QA_PUBLIC_RPC_CACHE_TELEMETRY/u);
  assert.match(spec,/backendNetworkReads:difference\('networkReads'\)/u);
  assert.match(spec,/cacheHits:difference\('cacheHits'\)/u);
  assert.match(spec,/sharedHits:difference\('sharedHits'\)/u);
  assert.match(spec,/extraHttpRequests:0/u);
  assert.match(spec,/containsPrivateData:false/u);
});

test('P0 Free: cache telemetry cannot emit identity or response bodies',()=>{
  const block=spec.split("console.log('M26_QA_PUBLIC_RPC_CACHE_TELEMETRY:")[1]
    ?.split('const sizes=await payloadFootprint.flush()')[0]||'';
  assert.ok(block.length>100,'The telemetry block must be present');
  for(const forbidden of ['.email','.password','.token','.jwt','.url','.body',
    'authorization','response.text','response.json','request.postData'])
    assert.ok(!block.includes(forbidden),forbidden+' in public-only cache telemetry');
  assert.match(network,/const QA_PUBLIC_READ_RPCS=new Set/u);
  assert.match(network,/const readOnlyContext=!Object\.prototype\.hasOwnProperty\.call/u);
  assert.match(network,/if\(readOnlyContext&&await qaPublicRpcMemo\.serve/u);
});
