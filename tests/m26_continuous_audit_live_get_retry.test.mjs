import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readOnlyPublicProbeWithRetry} from '../scripts/audit/public-probe-retry.mjs';

test('operational public GET retries once on transient network failure, and keeps body validation',async()=>{
  let attempts=0,delays=0;
  const out=await readOnlyPublicProbeWithRetry(async()=>{
    ++attempts;
    if(attempts===1)throw new TypeError('fetch failed');
    return {response:{status:200,ok:true},body:'{"sourceSha":"verified"}'};
  },{delay:async()=>{++delays}});
  assert.equal(attempts,2);assert.equal(delays,1);
  assert.equal(out.response.status,200);
});
test('public GET never retries returned 403, 500, or malformed 200 body',async()=>{
  for(const status of [403,500,200]){
    let attempts=0;
    const out=await readOnlyPublicProbeWithRetry(async()=>{
      ++attempts;return {response:{status,ok:status===200},body:'not-json'};
    },{delay:async()=>{throw Error('unexpected retry')}});
    assert.equal(attempts,1);assert.equal(out.response.status,status);
    assert.equal(out.body,'not-json');
  }
});
test('two transient failures fail closed; unrelated errors never retry',async()=>{
  let attempts=0;
  await assert.rejects(readOnlyPublicProbeWithRetry(async()=>{
    ++attempts;throw new TypeError('fetch failed');
  },{delay:async()=>{}}),TypeError);
  assert.equal(attempts,2);
  attempts=0;
  await assert.rejects(readOnlyPublicProbeWithRetry(async()=>{
    ++attempts;throw new Error('Invalid response signature');
  },{delay:async()=>{}}),/Invalid response signature/u);
  assert.equal(attempts,1);
});
test('release identity audit preserves mandatory checks and CRITICAL persistent failure',()=>{
  const source=readFileSync(new URL('../scripts/audit/continuous_app_audit.mjs',import.meta.url),'utf8');
  assert.match(source,/readOnlyPublicProbeWithRetry\(readOnce/u);
  assert.match(source,/method:'GET'/u);
  assert.match(source,/cache:'no-store'/u);
  assert.match(source,/addFinding\('critical','LIVE_READ_FAILED'/u);
  assert.match(source,/if\(!versionResult\?\.response\?\.ok\|\|!swResult\?\.response\?\.ok\)return/u);
  assert.match(source,/LIVE_VERSION_JSON_INVALID/u);
  assert.match(source,/LIVE_READ_HTTP_REJECTED/u);
  assert.doesNotMatch(source,/ignoreNetworkError|skipLiveIdentity|trustVersionWithoutLiveRead/u);
});
