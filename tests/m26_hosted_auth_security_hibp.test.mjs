import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  __hostedAuthSecurityInternals,
} from '../scripts/auth/sync-hosted-auth-security.mjs';
import {
  __applicationInternals,
} from '../src/m26/app/application.js';

const read=(file)=>fs.readFileSync(file,'utf8');

test('Hosted Auth hardening is scoped to leaked-password protection only',()=>{
  assert.deepEqual(__hostedAuthSecurityInternals.ALLOWED_PATCH_KEYS,['password_hibp_enabled']);
  assert.deepEqual(
    __hostedAuthSecurityInternals.sanitizePatch({password_hibp_enabled:true}),
    {password_hibp_enabled:true},
  );
  assert.throws(
    ()=>__hostedAuthSecurityInternals.sanitizePatch({password_hibp_enabled:true,mailer_autoconfirm:true}),
    /IBERFIT_AUTH_SECURITY_PATCH_SCOPE_INVALID/u,
  );
  assert.throws(
    ()=>__hostedAuthSecurityInternals.sanitizePatch({password_hibp_enabled:'true'}),
    /IBERFIT_AUTH_SECURITY_HIBP_BOOLEAN_REQUIRED/u,
  );
});

test('QA and PROD use exact project refs and explicit independent confirmations',()=>{
  const {TARGETS}=__hostedAuthSecurityInternals;
  assert.equal(TARGETS.qa.projectRef,'gjztkdwfmunnzhtvxrsu');
  assert.equal(TARGETS.prod.projectRef,'pjhmrhejsoofmouedavw');
  assert.equal(TARGETS.qa.confirmation,'ENABLE_IBERFIT_HIBP_QA');
  assert.equal(TARGETS.prod.confirmation,'ENABLE_IBERFIT_HIBP_PROD');
  assert.equal(TARGETS.qa.rollbackConfirmation,'ROLLBACK_IBERFIT_HIBP_QA');
  assert.equal(TARGETS.prod.rollbackConfirmation,null);
});

test('QA workflow enables HIBP, validates real logins and rolls back only on failure',()=>{
  const workflow=read('.github/workflows/hosted-auth-security-hardening.yml');
  assert.match(workflow,/environment: m26-canary-readonly/u);
  assert.match(workflow,/sync-hosted-auth-security\.mjs --enable --target qa/u);
  assert.match(workflow,/run_authenticated_readonly_gate\.mjs/u);
  assert.match(workflow,/sync-hosted-auth-security\.mjs --verify --target qa/u);
  assert.match(workflow,/failure\(\) && steps\.hibp\.outcome == 'success'/u);
  assert.match(workflow,/sync-hosted-auth-security\.mjs --restore-qa --target qa/u);
  assert.match(workflow,/SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/u);
});

test('production promotion requires QA HIBP and enables PROD before Cloudflare cutover',()=>{
  const workflow=read('.github/workflows/production-promote.yml');
  const qaVerify=workflow.indexOf('Verify QA leaked-password protection before production');
  const prodEnable=workflow.indexOf('Enable and verify leaked-password protection in PROD');
  const discover=workflow.indexOf('Discover exact Cloudflare production target');
  const deploy=workflow.indexOf('Deploy exact certified surface to production with Wrangler');
  assert.ok(qaVerify>=0);
  assert.ok(prodEnable>qaVerify);
  assert.ok(discover>prodEnable);
  assert.ok(deploy>discover);
  const prodBlock=workflow.slice(prodEnable,discover);
  assert.match(prodBlock,/ENABLE_IBERFIT_HIBP_PROD/u);
  assert.match(prodBlock,/sync-hosted-auth-security\.mjs --enable --target prod/u);
  assert.match(prodBlock,/SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/u);
  assert.match(workflow,/recovery\/hosted-auth-security\//u);
});

test('management token cannot be printed or embedded in evidence',()=>{
  const source=read('scripts/auth/sync-hosted-auth-security.mjs');
  assert.doesNotMatch(source,/console\.log\([^\n]*token/iu);
  assert.doesNotMatch(source,/writeEvidence\([^\n]*token/iu);
  assert.doesNotMatch(source,/SUPABASE_ACCESS_TOKEN\s*[:=]\s*['"`]/u);
});

test('IBERFIT explains weak or leaked password failures without mislabeling credentials',()=>{
  const weak={status:400,message:'Password is weak because it appears in a leaked password list',body:{code:'weak_password'}};
  assert.match(__applicationInternals.loginFailureMessage(weak),/renovarse por seguridad/u);
  assert.match(__applicationInternals.loginFailureMessage(weak),/Olvidaste tu contraseña/u);
  assert.match(__applicationInternals.recoveryPasswordError(weak),/débil o expuesta/u);
  assert.equal(
    __applicationInternals.loginFailureMessage({status:400,message:'invalid login credentials',body:{code:'invalid_credentials'}}),
    'El correo o la contraseña no coinciden.',
  );
});
