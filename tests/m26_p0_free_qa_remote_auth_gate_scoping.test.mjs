import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/remote-gates.yml','utf8');
const canary=readFileSync('.github/workflows/canary-exact-deploy.yml','utf8');
const push=workflow.split('  push:')[1]?.split('  workflow_dispatch:')[0]||'';
const paths=[...push.matchAll(/      - '([^']+)'/g)].map(x=>x[1]);
const required=["src/m26/app/**","src/m26/security/**","src/m26/qa/**","src/m26/shell/role-policy.js","src/m26/supabase-transport.js","src/m26/production-state.js","src/m26/rc39/multi-role.js","src/m26/ui/i18n-surface-p0-client-auth.js","src/m26/design/auth-native.css","qa/rc64/**","qa/coach-webauthn-recurring/**","qa/admin-webauthn-recurring/**","scripts/remote-gates/**","scripts/prelaunch/**","scripts/generate_rc74_4_runtime_config.mjs","scripts/ops/prepare_canary_deploy_surface.mjs","scripts/run_rc74_4_validation.mjs","playwright.authenticated.config.mjs","playwright.authenticated-visual.config.mjs","playwright.coach-webauthn-recurring.config.mjs","playwright.admin-webauthn-recurring.config.mjs","supabase/migrations/**","supabase/qa-migrations/**","supabase/functions/iberfit-qa-webauthn-cert-broker/**","supabase/functions/iberfit-webauthn-v1/**",".github/workflows/ci.yml",".github/workflows/continuous-app-audit.yml",".github/workflows/hosted-auth-security-hardening.yml",".github/workflows/production-promote.yml",".github/workflows/remote-gates.yml",".github/workflows/canary-exact-deploy.yml","tests/m26_remote_gate_client_role_contract.test.mjs","tests/m26_remote_gate_webauthn_origin.test.mjs","tests/m26_shared_qa_auth_concurrency_contract.test.mjs","tests/m26_canary_exact_qa_auth_lock.test.mjs"];
test('Free QA: remote push no longer repeats auth gates for all source, docs and UI changes',()=>{
 assert.match(push,/branches:\s*\n\s*- canary\/rc74-4/u);
 assert.deepEqual(paths,required);
 for(const unsafe of ['src/**','public/**','scripts/**','qa/**','tests/**','docs/**','package.json','package-lock.json'])assert.ok(!paths.includes(unsafe),unsafe+' remains broad');
 assert.match(workflow,/workflow_dispatch:\s*\n\s*inputs:/u);
 assert.match(workflow,/READ_ONLY_REMOTE_GATE/u);
});
test('remote auth gate preserved intact for protected security paths, broker, ACL and migrations',()=>{
 for(const p of ['src/m26/app/**','src/m26/security/**','src/m26/supabase-transport.js','supabase/migrations/**','supabase/qa-migrations/**','supabase/functions/iberfit-qa-webauthn-cert-broker/**','.github/workflows/remote-gates.yml','.github/workflows/canary-exact-deploy.yml'])assert.ok(paths.includes(p),p);
 assert.match(workflow,/group: iberfit-qa-shared-auth-readonly/u);
 assert.match(workflow,/queue: max/u);
 assert.match(workflow,/cancel-in-progress: false/u);
 assert.match(workflow,/node scripts\/remote-gates\/run_authenticated_readonly_gate\.mjs/u);
 assert.match(workflow,/playwright\.authenticated-visual\.config\.mjs/u);
});
test('independent Canary Exact remains a fail-closed auth gate on every push',()=>{
 assert.match(canary,/push:\s*\n\s*branches:\s*\n\s*- canary\/rc74-4/u);
 assert.match(canary,/qa-auth-readonly-preflight:[\s\S]*?node scripts\/remote-gates\/run_authenticated_readonly_gate\.mjs/u);
 assert.match(canary,/deploy-canary:[\s\S]*?needs: qa-auth-readonly-preflight/u);
 assert.match(canary,/Certify deployed Canary desktop and mobile read-only/u);
});
