import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const audit=fs.readFileSync('scripts/audit/continuous_app_audit.mjs','utf8').replace(/\r\n/g,'\n');

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

test('continuous audit proves health RPCs remain unavailable to anon',()=>{
  for(const rpc of [
    'm26_backend_health_v43',
    'm26_backend_health_v431',
    'm26_wearable_health_v44',
  ]){
    assert.ok(audit.includes(rpc),`missing protected health RPC ${rpc}`);
  }
  assert.match(audit,/authorization:/u);
  assert.match(audit,/Bearer/u);
  assert.match(audit,/if\(response\.ok\)exposed\.push\(rpc\)/u);
  assert.match(audit,/LIVE_ANON_HEALTH_RPC_EXPOSED/u);
  assert.match(audit,/LIVE_HEALTH_RPCS_AUTH_BOUND/u);
});

test('continuous audit does not store the publishable key in report coverage',()=>{
  assert.doesNotMatch(audit,/coverage\.live\.[A-Za-z0-9_]*publishableKey\s*=/u);
  assert.match(audit,/runtimePublishableKey/u);
  assert.match(audit,/anonymousHealthRpcStatuses/u);
});
