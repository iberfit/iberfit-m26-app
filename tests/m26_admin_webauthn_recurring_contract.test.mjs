import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Admin WebAuthn broker keeps the multiapp fixture ephemeral and QA-only',async()=>{
  const source=await read('supabase/functions/iberfit-qa-webauthn-cert-broker/index.ts');
  assert.match(source,/const QA_REF="gjztkdwfmunnzhtvxrsu"/u);
  assert.match(source,/const ADMIN_TARGET_USER_ID="a0ec751f-e61d-465a-88e9-ceffb0086b99"/u);
  assert.match(source,/const ADMIN_TARGET_EMAIL="qa\.rc74\.client-a@iberfit\.cl"/u);
  assert.match(source,/const ADMIN_EXPECTED_WORKFLOW_REF="iberfit\/iberfit-m26-app\/\.github\/workflows\/admin-webauthn-recurring\.yml@refs\/heads\/canary\/rc74-4"/u);
  assert.match(source,/profileRole:"client"/u);
  assert.match(source,/roleMap\.get\("client"\)!==true\|\|!roleMap\.has\("admin"\)/u);
  assert.match(source,/setAdminRole\(db,body\.target\.userId,false\);[\s\S]*?clearAuthState\(db,body\.target\.userId\);[\s\S]*?state=await finalState\(db,body\.target\);[\s\S]*?requireCleanState\(state\);[\s\S]*?state\.adminRoleActive!==false[\s\S]*?body\.action==="prepare"[\s\S]*?setAdminRole\(db,body\.target\.userId,true\)/u);
  assert.match(source,/\.eq\("user_id",userId\)\.eq\("role","admin"\)/u);
  assert.match(source,/activeCredentials/u);
  assert.match(source,/activeChallenges/u);
  assert.match(source,/activeAssurance/u);
  assert.match(source,/activeEmailAssurance/u);
  assert.match(source,/IBERFIT_QA_CERT_FINAL_STATE_DIRTY/u);
  assert.match(source,/payload\.workflow_ref!==body\.target\.workflowRef/u);
  assert.doesNotMatch(source,/pjhmrhejsoofmouedavw/u);
  assert.doesNotMatch(source,/createUser\s*\(/u);
  assert.doesNotMatch(source,/deleteUser\s*\(/u);
});

test('trusted Canary workflow owns prepare ceremony cleanup and shared fixture lock',async()=>{
  const workflow=await read('.github/workflows/admin-webauthn-recurring.yml');
  assert.match(workflow,/push:\s*\n\s+branches: \[canary\/rc74-4\]/u);
  assert.match(workflow,/workflow_dispatch:/u);
  assert.ok(workflow.includes("group: ${{ github.event_name == 'pull_request' && format('iberfit-admin-webauthn-contract-pr-{0}', github.event.pull_request.number) || format('iberfit-admin-webauthn-run-{0}', github.run_id) }}"));
  assert.ok(workflow.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"));
  assert.match(workflow,/live-admin-webauthn:[\s\S]*?if: github\.event_name != 'pull_request'/u);
  assert.match(workflow,/live-admin-webauthn:[\s\S]*?concurrency:\s*\n\s*group: iberfit-qa-shared-auth-readonly\s*\n\s*queue: max\s*\n\s*cancel-in-progress: false/u);
  assert.match(workflow,/permissions:[\s\S]*id-token: write/u);
  assert.match(workflow,/OIDC_AUDIENCE: iberfit-webauthn-qa-cert/u);
  assert.match(workflow,/\{action:"prepare",target:"admin"/u);
  assert.match(workflow,/Prepare ephemeral Admin QA WebAuthn fixture/u);
  assert.match(workflow,/Cleanup ephemeral Admin QA WebAuthn fixture[\s\S]*if: always\(\)/u);
  assert.match(workflow,/\{action:"reset",target:"admin"/u);
  assert.match(workflow,/\.state\.activeCredentials == 0/u);
  assert.match(workflow,/\.state\.activeChallenges == 0/u);
  assert.match(workflow,/\.state\.activeAssurance == 0/u);
  assert.match(workflow,/\.state\.activeEmailAssurance == 0/u);
  assert.match(workflow,/\.state\.adminRoleActive == false/u);
  assert.match(workflow,/playwright\.admin-webauthn-recurring\.config\.mjs/u);
  assert.match(workflow,/KNOWN_GAP_ADMIN_AUTHENTICATED_RECURRING=GREEN/u);
  assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE_KEY/u);
});

test('browser contract proves real registration assertion app choice and Admin shell',async()=>{
  const spec=await read('qa/admin-webauthn-recurring/admin-webauthn-recurring.spec.mjs');
  const config=await read('playwright.admin-webauthn-recurring.config.mjs');
  assert.match(spec,/WebAuthn\.addVirtualAuthenticator/u);
  assert.match(spec,/registration-options/u);
  assert.match(spec,/registration-verify/u);
  assert.match(spec,/authentication-options/u);
  assert.match(spec,/authentication-verify/u);
  assert.match(spec,/App selector must not precede WebAuthn/u);
  assert.match(spec,/At most one provisional Admin shell may exist before app choice/u);
  assert.match(spec,/Rendered provisional Admin shell must remain inert until app choice/u);
  assert.match(spec,/toHaveAttribute\('inert',''\)/u);
  assert.match(spec,/toHaveAttribute\('aria-hidden','true'\)/u);
  assert.match(spec,/Chosen Admin shell must become interactive/u);
  assert.match(spec,/Chosen Admin shell must leave the accessibility-hidden state/u);
  assert.match(spec,/data-m26-switch-role="client"/u);
  assert.match(spec,/data-m26-switch-role="admin"/u);
  assert.match(spec,/data-m26-switch-role="coach"/u);
  assert.ok(spec.includes('.m26-shell[data-m26-role="admin"]'));
  assert.match(spec,/iberfit_admin_bootstrap_v14/u);
  assert.match(spec,/businessMutationsPerformed:false/u);
  assert.match(spec,/serviceRoleUsed:false/u);
  assert.match(spec,/tablet-portrait/u);
  assert.match(spec,/tablet-landscape/u);
  assert.match(spec,/mobile/u);
  assert.match(config,/workers:1/u);
  assert.match(config,/browserName:'chromium'/u);
  assert.match(config,/trace:'retain-on-failure'/u);
});

test('shared authenticated helper remains strictly read-only',async()=>{
  const helper=await read('qa/rc64/secure-current-source-auth.mjs');
  assert.doesNotMatch(helper,/WebAuthn\.addVirtualAuthenticator/u);
  assert.doesNotMatch(helper,/completeClientWebAuthnChoice/u);
  assert.doesNotMatch(helper,/iberfit-webauthn-v1/u);
});
