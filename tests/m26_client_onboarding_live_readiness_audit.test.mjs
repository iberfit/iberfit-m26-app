import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('scripts/audit/continuous_app_audit.mjs','utf8').replace(/\r\n/g,'\n');

test('continuous audit fail-closes on both production and QA Admin client onboarding edges',()=>{
  assert.match(source,/ADMIN_CLIENT_INVITE_EDGE_URL/u);
  assert.match(source,/QA_ADMIN_CLIENT_INVITE_EDGE_URL/u);
  assert.match(source,/functions\/v1\/iberfit-admin-client-invite-v1/u);
  assert.match(source,/QA_APP_URL='https:\/\/m26-canary\.iberfit\.cl'/u);
  assert.match(source,/method:'OPTIONS'/u);
  assert.match(source,/'access-control-request-method':'POST'/u);
  assert.match(source,/response\.status!==204/u);
  assert.match(source,/codePrefix:'LIVE_ADMIN_CLIENT_INVITE_EDGE'/u);
  assert.match(source,/codePrefix:'QA_ADMIN_CLIENT_INVITE_EDGE'/u);
  assert.match(source,/\$\{codePrefix\}_UNAVAILABLE/u);
  assert.match(source,/\$\{codePrefix\}_CORS_INVALID/u);
  assert.match(source,/\$\{codePrefix\}_POST_NOT_ALLOWED/u);
});

test('continuous audit checks onboarding edges as part of every integral live audit',()=>{
  const live=source.indexOf('await auditLivePublicSurface();');
  const onboarding=source.indexOf('await auditClientOnboardingBackendReadiness();');
  assert.ok(live>=0);
  assert.ok(onboarding>live);
  assert.match(source,/LIVE_ADMIN_CLIENT_ONBOARDING_EDGE_READY/u);
  assert.match(source,/QA_ADMIN_CLIENT_ONBOARDING_EDGE_READY/u);
  assert.match(source,/ADMIN_CLIENT_ONBOARDING_EDGE_ENVIRONMENTS_READY/u);
});

test('onboarding edge readiness audit remains strictly read-only',()=>{
  const start=source.indexOf('async function auditClientInviteEdge(');
  const end=source.indexOf('async function auditLivePublicSurface()',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/method:'OPTIONS'/u);
  assert.doesNotMatch(block,/method:'POST'/u);
  assert.doesNotMatch(block,/['"]authorization['"]\s*:/iu);
  assert.doesNotMatch(block,/Bearer\s+[A-Za-z0-9._-]+/u);
  assert.doesNotMatch(block,/\.rpc\(|\.insert\(|\.update\(|\.delete\(/iu);
});

test('QA and production onboarding checks use different origins and project endpoints',()=>{
  assert.match(source,/const PROD_PROJECT_REF='pjhmrhejsoofmouedavw'/u);
  assert.match(source,/const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu'/u);
  assert.match(source,/origin:APP_URL/u);
  assert.match(source,/origin:QA_APP_URL/u);
  assert.match(source,/url:ADMIN_CLIENT_INVITE_EDGE_URL/u);
  assert.match(source,/url:QA_ADMIN_CLIENT_INVITE_EDGE_URL/u);
});
