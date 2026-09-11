import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('scripts/audit/continuous_app_audit.mjs','utf8').replace(/\r\n/g,'\n');

test('continuous audit fail-closes when production Admin client onboarding edge is missing',()=>{
  assert.match(source,/ADMIN_CLIENT_INVITE_EDGE_URL/u);
  assert.match(source,/functions\/v1\/iberfit-admin-client-invite-v1/u);
  assert.match(source,/method:'OPTIONS'/u);
  assert.match(source,/'origin':APP_URL/u);
  assert.match(source,/'access-control-request-method':'POST'/u);
  assert.match(source,/response\.status!==204/u);
  assert.match(source,/LIVE_ADMIN_CLIENT_INVITE_EDGE_UNAVAILABLE/u);
  assert.match(source,/LIVE_ADMIN_CLIENT_INVITE_CORS_INVALID/u);
  assert.match(source,/LIVE_ADMIN_CLIENT_INVITE_POST_NOT_ALLOWED/u);
});

test('continuous audit checks onboarding edge as part of every integral live audit',()=>{
  const live=source.indexOf('await auditLivePublicSurface();');
  const onboarding=source.indexOf('await auditClientOnboardingBackendReadiness();');
  assert.ok(live>=0);
  assert.ok(onboarding>live);
  assert.match(source,/LIVE_ADMIN_CLIENT_ONBOARDING_EDGE_READY/u);
});

test('onboarding edge readiness audit is strictly read-only',()=>{
  const start=source.indexOf('async function auditClientOnboardingBackendReadiness()');
  const end=source.indexOf('async function auditLivePublicSurface()',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/method:'OPTIONS'/u);
  assert.doesNotMatch(block,/method:'POST'/u);
  assert.doesNotMatch(block,/['"]authorization['"]\s*:/iu);
  assert.doesNotMatch(block,/Bearer\s+[A-Za-z0-9._-]+/u);
  assert.doesNotMatch(block,/\.rpc\(|insert|update|delete/iu);
});
