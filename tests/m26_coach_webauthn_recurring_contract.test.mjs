import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Coach WebAuthn recurring broker stays QA-only and fixture-scoped',async()=>{
  const source=await read('supabase/functions/iberfit-qa-webauthn-cert-broker/index.ts');
  assert.match(source,/const QA_REF="gjztkdwfmunnzhtvxrsu"/u);
  assert.match(source,/const TARGET_USER_ID="d381eb97-6c53-40e0-b0dc-916dd06bcd35"/u);
  assert.match(source,/const TARGET_EMAIL="qa\.rc74\.coach@iberfit\.cl"/u);
  assert.match(source,/const EXPECTED_REF="refs\/heads\/canary\/rc74-4"/u);
  assert.match(source,/coach-webauthn-recurring\.yml@refs\/heads\/canary\/rc74-4/u);
  assert.match(source,/audience:AUDIENCE/u);
  assert.match(source,/payload\.repository_id/u);
  assert.match(source,/payload\.workflow_ref/u);
  assert.match(source,/payload\.runner_environment/u);
  assert.match(source,/IBERFIT_QA_CERT_TARGET_ASSIGNMENTS_PRESENT/u);
  assert.match(source,/iberfit_webauthn_credentials_v1/u);
  assert.match(source,/iberfit_privileged_assurance_v1/u);
  assert.match(source,/iberfit_email_privileged_assurance_v1/u);
  assert.doesNotMatch(source,/pjhmrhejsoofmouedavw/u);
  assert.doesNotMatch(source,/createUser\s*\(/u);
  assert.doesNotMatch(source,/deleteUser\s*\(/u);
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY.*github/u);
});

test('trusted Canary workflow owns OIDC reset, real ceremony and cleanup',async()=>{
  const workflow=await read('.github/workflows/coach-webauthn-recurring.yml');
  assert.match(workflow,/push:\s*\n\s+branches: \[canary\/rc74-4\]/u);
  assert.match(workflow,/workflow_dispatch:/u);
  assert.ok(workflow.includes("group: ${{ github.event_name == 'pull_request' && format('iberfit-coach-webauthn-contract-pr-{0}', github.event.pull_request.number) || 'iberfit-qa-shared-auth-readonly' }}"));
  assert.ok(workflow.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"));
  assert.doesNotMatch(workflow,/\n\s*group: iberfit-qa-shared-auth-readonly\s*\n/u);
  assert.match(workflow,/live-coach-webauthn:[\s\S]*if: github\.event_name != 'pull_request'/u);
  assert.match(workflow,/permissions:[\s\S]*id-token: write/u);
  assert.match(workflow,/OIDC_AUDIENCE: iberfit-webauthn-qa-cert/u);
  assert.match(workflow,/Reset Coach QA WebAuthn fixture/u);
  assert.match(workflow,/Cleanup Coach QA WebAuthn fixture[\s\S]*if: always\(\)/u);
  assert.match(workflow,/playwright\.coach-webauthn-recurring\.config\.mjs/u);
  assert.match(workflow,/KNOWN_GAP_COACH_POST_WEBAUTHN=GREEN/u);
  assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE_KEY/u);
});

test('browser contract proves both registration and assertion on current source',async()=>{
  const spec=await read('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs');
  const config=await read('playwright.coach-webauthn-recurring.config.mjs');
  assert.match(spec,/WebAuthn\.addVirtualAuthenticator/u);
  assert.match(spec,/registration-options/u);
  assert.match(spec,/registration-verify/u);
  assert.match(spec,/authentication-options/u);
  assert.match(spec,/authentication-verify/u);
  assert.match(spec,/data-m26-action="logout"/u);
  assert.ok(spec.includes('.m26-shell[data-m26-role="coach"]'));
  assert.match(spec,/businessMutationsPerformed:false/u);
  assert.match(spec,/serviceRoleUsed:false/u);
  assert.match(spec,/tablet-portrait/u);
  assert.match(spec,/tablet-landscape/u);
  assert.match(spec,/mobile/u);
  assert.match(config,/workers:1/u);
  assert.match(config,/browserName:'chromium'/u);
  assert.match(config,/trace:'retain-on-failure'/u);
});

test('authenticated readonly gate expects the disposable Coach fixture after cleanup',async()=>{
  const gate=await read('scripts/remote-gates/run_authenticated_readonly_gate.mjs');
  assert.match(gate,/const EXPECTED_COACH_CERT_EMAIL='qa\.rc74\.coach@iberfit\.cl'/u);
  assert.match(gate,/RC74_4_REMOTE_COACH_CERT_IDENTITY_MISMATCH/u);
  assert.match(gate,/assurance\?\.webauthnRequired!==true\|\|assurance\?\.credentialEnrolled!==false/u);
  assert.match(gate,/privilegedGate:\{ok:true,iberfitAssurance:'required',credentialEnrolled:false,webauthnRequired:true/u);
  assert.match(gate,/RC74_4_SERVICE_ROLE_FORBIDDEN/u);
  assert.doesNotMatch(gate,/credentialEnrolled!==true/u);
});
