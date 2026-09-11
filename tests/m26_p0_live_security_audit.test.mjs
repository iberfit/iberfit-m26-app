import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const audit=fs.readFileSync('scripts/audit/continuous_app_audit.mjs','utf8').replace(/\r\n/g,'\n');

test('P0 live security auditor version is pinned to the hardened contract',()=>{
  assert.match(audit,/const AUDIT_VERSION='1\.1\.0';/u);
});

test('P0 live security auditor explicitly denies anonymous health RPC execution',()=>{
  for(const rpc of [
    'm26_backend_health_v43',
    'm26_backend_health_v431',
    'm26_wearable_health_v44',
  ]){
    assert.ok(audit.includes(`'${rpc}'`),`missing denied RPC ${rpc}`);
  }
  assert.match(audit,/const PUBLIC_BRAND_RPC='iberfit_exercise_catalog_public_v1';/u);
  assert.match(audit,/LIVE_ANON_PRIVILEGED_RPC_EXPOSED/u);
  assert.match(audit,/LIVE_ANON_HEALTH_RPC_DENIED/u);
});

test('P0 anonymous posture probe uses only the publishable key and never fabricates Authorization',()=>{
  const start=audit.indexOf('async function postSupabaseRpc');
  const end=audit.indexOf('async function auditAnonymousRpcPosture',start);
  assert.ok(start>=0&&end>start);
  const block=audit.slice(start,end);
  assert.match(block,/apikey:publishableKey/u);
  assert.doesNotMatch(block,/authorization\s*:/iu);
  assert.match(block,/cache:'no-store'/u);
  assert.match(block,/redirect:'error'/u);
});

test('P0 public brand-content probe runs before sensitive anonymous-denial probes',()=>{
  const start=audit.indexOf('async function auditAnonymousRpcPosture');
  const end=audit.indexOf('async function auditReleaseCoherence',start);
  const block=audit.slice(start,end);
  const publicIndex=block.indexOf('rpc:PUBLIC_BRAND_RPC');
  const sensitiveIndex=block.indexOf('for(const rpc of ANON_DENIED_HEALTH_RPCS)');
  assert.ok(publicIndex>=0&&sensitiveIndex>publicIndex);
  assert.match(block,/LIVE_PUBLIC_BRAND_RPC_UNAVAILABLE/u);
  assert.match(block,/LIVE_PUBLIC_BRAND_RPC_SCOPED/u);
});

test('P0 live security header contract is fail-closed for browser and PWA protections',()=>{
  for(const header of [
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
    'service-worker-allowed',
    'permissions-policy',
  ]){
    assert.ok(audit.includes(`'${header}'`),`missing header check ${header}`);
  }
  for(const directive of ["object-src 'none'","frame-ancestors 'none'","base-uri 'none'"]){
    assert.ok(audit.includes(directive),`missing CSP directive ${directive}`);
  }
  assert.match(audit,/LIVE_SECURITY_HEADERS_HARDENED/u);
  assert.match(audit,/LIVE_CSP_HARDENING_INVALID/u);
});

test('P0 live release contract ties version.json and Service Worker to one exact production SHA',()=>{
  const start=audit.indexOf('async function auditReleaseCoherence');
  const end=audit.indexOf('async function auditClientOnboardingBackendReadiness',start);
  assert.ok(start>=0&&end>start);
  const block=audit.slice(start,end);
  assert.match(block,/version\.json/u);
  assert.match(block,/sw\.js/u);
  assert.match(block,/\^\[0-9a-f\]\{40\}\$/u);
  assert.match(block,/26\.0\.0-production\./u);
  assert.match(block,/m26-prod-/u);
  assert.match(block,/PREVIOUS_VERSION/u);
  assert.match(block,/LIVE_RELEASE_COHERENCE_INVALID/u);
  assert.match(block,/LIVE_RELEASE_COHERENT/u);
});

test('P0 continuous audit executes the new live security checks before reporting',()=>{
  const start=audit.indexOf('async function main(){');
  const end=audit.indexOf('await main();',start);
  const block=audit.slice(start,end);
  const surface=block.indexOf('await auditLivePublicSurface()');
  const release=block.indexOf('await auditReleaseCoherence()');
  const anon=block.indexOf('await auditAnonymousRpcPosture()');
  const onboarding=block.indexOf('await auditClientOnboardingBackendReadiness()');
  const report=block.indexOf('await writeReport()');
  assert.ok(surface>=0&&release>surface&&anon>release&&onboarding>anon&&report>onboarding);
});
