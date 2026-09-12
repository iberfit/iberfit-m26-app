import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const auditPath='scripts/audit/continuous_app_audit.mjs';
const audit=fs.readFileSync(auditPath,'utf8').replace(/\r\n/g,'\n');

test('continuous audit script parses under the CI Node runtime',()=>{
  execFileSync(process.execPath,['--check',auditPath],{stdio:'pipe'});
});

test('continuous audit enforces production security headers fail-closed',()=>{
  for(const header of [
    'content-security-policy',
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'permissions-policy',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
  ]){
    assert.ok(audit.includes(header),`missing audit for ${header}`);
  }
  assert.match(audit,/LIVE_SECURITY_HEADERS_INVALID/u);
  assert.match(audit,/LIVE_SECURITY_HEADERS_HARDENED/u);
  assert.match(audit,/frame-ancestors 'none'/u);
  assert.match(audit,/unsafe-eval/u);
});

test('continuous audit proves anon boundaries with a valid publishable key and no fabricated user JWT',()=>{
  for(const rpc of [
    'm26_backend_health_v43',
    'm26_backend_health_v431',
    'm26_wearable_health_v44',
  ]){
    assert.ok(audit.includes(rpc),`missing protected health RPC ${rpc}`);
  }
  assert.match(audit,/const PUBLIC_BRAND_RPC='iberfit_exercise_catalog_public_v1';/u);

  const requestStart=audit.indexOf('async function postSupabaseRpc');
  const postureStart=audit.indexOf('async function auditAnonymousRpcPosture',requestStart);
  assert.ok(requestStart>=0&&postureStart>requestStart);
  const requestBlock=audit.slice(requestStart,postureStart);
  assert.match(requestBlock,/apikey:publishableKey/u);
  assert.doesNotMatch(requestBlock,/authorization\s*:/iu);
  assert.doesNotMatch(requestBlock,/Bearer/u);

  const releaseStart=audit.indexOf('async function auditReleaseCoherence',postureStart);
  assert.ok(releaseStart>postureStart);
  const postureBlock=audit.slice(postureStart,releaseStart);
  assert.ok(postureBlock.indexOf('rpc:PUBLIC_BRAND_RPC')>=0);
  assert.ok(postureBlock.indexOf('for(const rpc of AUTHENTICATED_HEALTH_RPCS)')>postureBlock.indexOf('rpc:PUBLIC_BRAND_RPC'));
  assert.match(postureBlock,/if\(response\.ok\)exposed\.push\(rpc\)/u);
  assert.match(postureBlock,/LIVE_PUBLIC_BRAND_RPC_SCOPED/u);
  assert.match(postureBlock,/LIVE_ANON_HEALTH_RPC_EXPOSED/u);
  assert.match(postureBlock,/LIVE_HEALTH_RPCS_AUTH_BOUND/u);
});

test('continuous audit does not store the publishable key in report coverage',()=>{
  assert.doesNotMatch(audit,/coverage\.live\.[A-Za-z0-9_]*publishableKey\s*=/u);
  assert.match(audit,/runtimePublishableKey/u);
  assert.match(audit,/anonymousHealthRpcStatuses/u);
});
