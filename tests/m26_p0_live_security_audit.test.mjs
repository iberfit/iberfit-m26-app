import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const audit=fs.readFileSync('scripts/audit/continuous_app_audit.mjs','utf8').replace(/\r\n/g,'\n');

test('P0 live security auditor version is pinned to the current hardened contract',()=>{
  assert.match(audit,/const AUDIT_VERSION='1\.2\.0';/u);
});

test('P0 anonymous posture proves the publishable key on public content before sensitive probes',()=>{
  assert.match(audit,/const PUBLIC_BRAND_RPC='iberfit_exercise_catalog_public_v1';/u);
  for(const rpc of [
    'm26_backend_health_v43',
    'm26_backend_health_v431',
    'm26_wearable_health_v44',
  ]){
    assert.ok(audit.includes(`'${rpc}'`),`missing denied RPC ${rpc}`);
  }

  const start=audit.indexOf('async function auditAnonymousRpcPosture');
  const end=audit.indexOf('async function auditReleaseCoherence',start);
  assert.ok(start>=0&&end>start);
  const block=audit.slice(start,end);
  assert.ok(block.indexOf('rpc:PUBLIC_BRAND_RPC')>=0);
  assert.ok(block.indexOf('for(const rpc of AUTHENTICATED_HEALTH_RPCS)')>block.indexOf('rpc:PUBLIC_BRAND_RPC'));
  assert.match(block,/LIVE_PUBLIC_BRAND_RPC_SCOPED/u);
  assert.match(block,/LIVE_ANON_HEALTH_RPC_EXPOSED/u);
});

test('P0 anonymous Supabase probe uses only the publishable apikey and never fabricates Authorization',()=>{
  const start=audit.indexOf('async function postSupabaseRpc');
  const end=audit.indexOf('async function auditAnonymousRpcPosture',start);
  assert.ok(start>=0&&end>start);
  const block=audit.slice(start,end);
  assert.match(block,/apikey:publishableKey/u);
  assert.doesNotMatch(block,/authorization\s*:/iu);
  assert.match(block,/credentials:'omit'/u);
  assert.match(block,/cache:'no-store'/u);
  assert.match(block,/redirect:'error'/u);
});

test('P0 live browser security header contract remains fail-closed',()=>{
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
    assert.ok(audit.includes(`'${header}'`),`missing header check ${header}`);
  }
  for(const directive of [
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
  ]){
    assert.ok(audit.includes(directive),`missing browser security rule ${directive}`);
  }
  assert.match(audit,/LIVE_SECURITY_HEADERS_HARDENED/u);
});

test('P0 live release contract ties version.json and Service Worker to one exact production SHA',()=>{
  const start=audit.indexOf('async function auditReleaseCoherence');
  const end=audit.indexOf('async function auditClientOnboardingBackendReadiness',start);
  assert.ok(start>=0&&end>start);
  const block=audit.slice(start,end);
  assert.match(block,/\/m26\/version\.json/u);
  assert.match(block,/\/m26\/sw\.js/u);
  assert.match(block,/\^\[0-9a-f\]\{40\}\$/u);
  assert.match(block,/26\.0\.0-production\./u);
  assert.match(block,/m26-prod-/u);
  assert.match(block,/PREVIOUS_VERSION/u);
  assert.match(block,/service-worker-allowed/u);
  assert.match(block,/LIVE_SW_SCOPE_HEADER_INVALID/u);
  assert.match(block,/LIVE_RELEASE_COHERENCE_INVALID/u);
  assert.match(block,/LIVE_RELEASE_COHERENT/u);
});

test('continuous audit executes release coherence before backend readiness and reporting',()=>{
  const start=audit.indexOf('async function main(){');
  const end=audit.indexOf('await main();',start);
  assert.ok(start>=0&&end>start);
  const block=audit.slice(start,end);
  const surface=block.indexOf('await auditLivePublicSurface()');
  const release=block.indexOf('await auditReleaseCoherence()');
  const onboarding=block.indexOf('await auditClientOnboardingBackendReadiness()');
  const report=block.indexOf('await writeReport()');
  assert.ok(surface>=0&&release>surface&&onboarding>release&&report>onboarding);
});
