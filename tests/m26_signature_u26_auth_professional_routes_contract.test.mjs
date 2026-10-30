import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const inventory=JSON.parse(read('qa/visual/signature-360-coverage.json'));

test('U26 retains separate certified U25 source and pending integral SIGNATURE acceptance',()=>{
  assert.equal(inventory.productionBaseline.sourceSha,'4c58d70e5f7a984e8bd2663633f7cf9abd68b4e6');
  assert.equal(inventory.productionBaseline.workflowRunId,39479637032);
  assert.equal(inventory.status,'WIP_NOT_PRODUCTION');
  assert.equal(inventory.activeDelivery,'SIGNATURE-U26-authenticated-professional-route-smoke-WIP');
  assert.equal(inventory.qaEvidence.professionalAuthenticatedRouteSmoke.fullFunctionalAcceptance,false);
  assert.ok(Object.values(inventory.roles).flat().every(x=>x.evidenceStatus==='pending'));
  assert.equal(inventory.roles.client.length,9);
  assert.equal(inventory.roles.coach.length,17);
  assert.equal(inventory.roles.admin.length,17);
});
test('U26 audits actual navigation after real privileged WebAuthn in trusted push jobs',()=>{
  const helper=read('qa/signature-u26-authenticated-professional-routes.mjs');
  const coach=read('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs');
  const admin=read('qa/admin-webauthn-recurring/admin-webauthn-recurring.spec.mjs');
  for(const spec of [coach,admin]){
    assert.match(spec,/auditAuthenticatedProfessionalRoutes\(page,/u);
    assert.match(spec,/authentication-verify/u);
    assert.match(spec,/evidence\.authenticationVerified=true;evidence\.mfaCompleted=true/u);
    assert.match(spec,/signatureU26Audits:\[\]/u);
    assert.match(spec,/expect\(evidence\.blocked/u);
  }
  assert.ok(coach.indexOf("evidence.authenticationVerified=true")<coach.indexOf("auditAuthenticatedProfessionalRoutes(page,"));
  assert.ok(admin.indexOf("evidence.authenticationVerified=true")<admin.indexOf("auditAuthenticatedProfessionalRoutes(page,"));
  assert.match(helper,/data-m26-area/u);
  assert.match(helper,/m26-main/u);
  assert.match(helper,/m26-route-placeholder/u);
  assert.match(helper,/toBeGreaterThanOrEqual\(viewport===/u);
  assert.match(helper,/fullFunctionalAcceptance:false/u);
  assert.match(helper,/notExposed/u);
  // Total test coverage is not a user-facing response-time SLA.
  // Preserve every route/content/auth assertion and constrain actual browser
  // pointer-to-painted-route timing instead of constraining total suite work.
  assert.match(coach,/test\\.setTimeout\\(600_000\\)/u);
  assert.match(helper,/SIGNATURE_U26_BROWSER_PAINT/u);
  assert.match(helper,/state\\.navPaint\\?\\.trusted/u);
  assert.match(helper,/state\\.navPaint\\?\\.elapsedMs/u);
  assert.match(helper,/\\.toBeLessThanOrEqual\\(5_000\\)/u);
  assert.match(helper,/SIGNATURE_U26_ROUTE_START/u);
  assert.match(helper,/SIGNATURE_U26_ROUTE_PASS/u);
  assert.match(helper,/timeout:12000/u);

  assert.doesNotMatch(helper,/\.navigate\(|\.setState\(|\.dispatch\(|\.fill\(|\.submit\(/u);
  const coachFlow=read('.github/workflows/coach-webauthn-recurring.yml');
  const adminFlow=read('.github/workflows/admin-webauthn-recurring.yml');
  for(const flow of [coachFlow,adminFlow]){
    assert.match(flow,/if: github\.event_name != 'pull_request'/u);
    assert.match(flow,/group: iberfit-qa-shared-auth-readonly/u);
    assert.match(flow,/if: always\(\)/u);
  }
});
